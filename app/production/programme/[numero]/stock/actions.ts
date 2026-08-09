"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { fetchLotsInDepot, totalAvailable } from "@/app/depots/transfer-order/stock-lots";

// Les 9 familles de produit fini demandees, chacune sa propre Transfer
// Order - plusieurs type_article bruts (avec fautes de frappe/espaces dans
// les donnees reelles, ex: "Anti sptique ", "lave vitre ") sont regroupes
// ensemble quand demande (Parfume+Antiseptique+Lave vitre, Huile+Serum, Gel
// douche+Gel).
const TYPE_GROUPS: { label: string; types: string[] }[] = [
  { label: "Clarifiant", types: ["clarifiant"] },
  { label: "Hydratant", types: ["hydratant"] },
  { label: "Parfume - Antiseptique - Lave vitre", types: ["parfume", "anti sptique", "anti septique", "lave vitre"] },
  { label: "Huile - Serum", types: ["huile", "serum"] },
  { label: "Gel douche - Gel", types: ["gel douche", "gel"] },
  { label: "Pommade", types: ["pommade"] },
  { label: "Menthole", types: ["menthole"] },
  { label: "Talc", types: ["talc"] },
  { label: "Savon", types: ["savon"] },
];

function mapTypeArticleToGroupe(typeArticle: string | null): string {
  const normalized = (typeArticle || "").trim().toLowerCase();
  for (const group of TYPE_GROUPS) {
    if (group.types.some((t) => normalized === t || normalized.includes(t))) {
      return group.label;
    }
  }
  return "Autre";
}

// COLORANT PLAS. / Col_Cosm / Col_cosm dans les donnees reelles - toujours
// une categorie a part, jamais melangee avec le reste de la MP d'un meme
// groupe.
function isColorant(categorie: string | null): boolean {
  const normalized = (categorie || "").toUpperCase();
  return normalized.includes("COLORANT") || normalized.includes("COL_COSM") || normalized.includes("COL COSM");
}

function round(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Cree automatiquement un Transfer Order par famille de produit fini
// (Clarifiant, Hydratant...), avec la MP Colorant toujours dans une TO a
// part de celle du reste - vers "Depot B", a partir du depot par defaut de
// chaque article MP. Quantite plafonnee au stock reellement disponible
// (jamais plus) ; un article sans aucun stock disponible est simplement
// exclu (pas d'echec global pour un seul article en rupture).
export async function autoCreateTransferOrdersAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "depots"))) {
    throw new Error("Cet utilisateur ne peut pas creer de Transfer Order.");
  }

  const numeroProgramme = Number(formData.get("numero_programme") || "0");
  if (!numeroProgramme) {
    throw new Error("Programme invalide.");
  }

  const { data: depotBData, error: depotBError } = await supabaseServer
    .from("depots")
    .select("id, nom")
    .ilike("nom", "Depot B")
    .maybeSingle();

  if (depotBError) {
    throw new Error(depotBError.message);
  }
  if (!depotBData) {
    throw new Error('Aucun depot nomme "Depot B" - cree-le dabord depuis Entrepot.');
  }
  const depotDestinationId = (depotBData as { id: number }).id;

  const { data: lignesData, error: lignesError } = await supabaseServer
    .from("programmes")
    .select("article_id, vrac_article_id, qt_carton, qt_vrac, date_jour")
    .eq("numero_programme", numeroProgramme);

  if (lignesError) {
    throw new Error(lignesError.message);
  }

  const lignes = (lignesData ?? []) as {
    article_id: number;
    vrac_article_id: number | null;
    qt_carton: number;
    qt_vrac: number;
    date_jour: string;
  }[];

  if (lignes.length === 0) {
    throw new Error("Programme introuvable.");
  }

  const dateJour = lignes[0].date_jour;
  const articleIds = [...new Set(lignes.flatMap((l) => [l.article_id, l.vrac_article_id]).filter((id): id is number => !!id))];

  const [{ data: articlesData }, { data: recettesData }] = await Promise.all([
    supabaseServer.from("articles").select("id, type_article, quantite_recette_base").in("id", articleIds),
    supabaseServer.from("recettes_pf").select("article_pf_id, article_mp_id, quantite").in("article_pf_id", articleIds),
  ]);

  const articleById = new Map(
    ((articlesData ?? []) as { id: number; type_article: string | null; quantite_recette_base: number | null }[]).map(
      (a) => [a.id, a]
    )
  );
  const recettes = (recettesData ?? []) as { article_pf_id: number; article_mp_id: number; quantite: number }[];

  // besoin par (groupe de type, article MP) - le groupe vient TOUJOURS du
  // type_article de l'article FINI de la ligne (article_id), jamais du
  // vrac.
  const besoinParGroupeMp = new Map<string, Map<number, number>>();

  for (const ligne of lignes) {
    const pfArticle = articleById.get(ligne.article_id);
    const groupe = mapTypeArticleToGroupe(pfArticle?.type_article ?? null);
    const besoinMap = besoinParGroupeMp.get(groupe) ?? new Map<number, number>();

    const ratioCarton = ligne.qt_carton / (pfArticle?.quantite_recette_base || 1);
    for (const r of recettes.filter((r) => r.article_pf_id === ligne.article_id)) {
      besoinMap.set(r.article_mp_id, (besoinMap.get(r.article_mp_id) ?? 0) + r.quantite * ratioCarton);
    }

    if (ligne.vrac_article_id) {
      const vracArticle = articleById.get(ligne.vrac_article_id);
      const ratioVrac = ligne.qt_vrac / (vracArticle?.quantite_recette_base || 1);
      for (const r of recettes.filter((r) => r.article_pf_id === ligne.vrac_article_id)) {
        besoinMap.set(r.article_mp_id, (besoinMap.get(r.article_mp_id) ?? 0) + r.quantite * ratioVrac);
      }
    }

    besoinParGroupeMp.set(groupe, besoinMap);
  }

  const allMpIds = [...new Set([...besoinParGroupeMp.values()].flatMap((m) => [...m.keys()]))];
  const { data: articlesMpData } = await supabaseServer
    .from("articles_matiere_premiere")
    .select("id, categorie, depot_id")
    .in("id", allMpIds);
  const articleMpById = new Map(
    ((articlesMpData ?? []) as { id: number; categorie: string | null; depot_id: number | null }[]).map((a) => [a.id, a])
  );

  const createdCodes: string[] = [];
  const skipped: { articleId: number; besoin: number; disponible: number }[] = [];

  for (const [groupe, besoinMap] of besoinParGroupeMp.entries()) {
    // Colorant toujours a part du reste, meme groupe de type - et par depot
    // source (rare que ca varie, mais un Transfer Order n'a qu'un seul
    // depot source).
    const buckets = new Map<string, { mpArticleId: number; quantite: number; depotSourceId: number }[]>();

    for (const [mpArticleId, besoin] of besoinMap.entries()) {
      if (besoin <= 0) continue;
      const mpArticle = articleMpById.get(mpArticleId);
      const depotSourceId = mpArticle?.depot_id ?? null;
      if (!depotSourceId) continue; // pas de depot par defaut connu pour cet article - impossible de savoir d'ou transferer

      const sousGroupe = isColorant(mpArticle?.categorie ?? null) ? "Colorant" : "Autre";
      const bucketKey = `${sousGroupe}::${depotSourceId}`;
      const list = buckets.get(bucketKey) ?? [];
      list.push({ mpArticleId, quantite: besoin, depotSourceId });
      buckets.set(bucketKey, list);
    }

    for (const [bucketKey, entries] of buckets.entries()) {
      const [sousGroupe, depotSourceIdRaw] = bucketKey.split("::");
      const depotSourceId = Number(depotSourceIdRaw);
      if (depotSourceId === depotDestinationId) continue; // deja dans Depot B, rien a transferer

      const lignesToCreate: { article_id: number; quantite: number }[] = [];
      for (const entry of entries) {
        const lots = await fetchLotsInDepot("MP", entry.mpArticleId, depotSourceId);
        const disponible = totalAvailable(lots);
        const quantite = round(Math.min(entry.quantite, disponible));

        if (quantite <= 0) {
          skipped.push({ articleId: entry.mpArticleId, besoin: entry.quantite, disponible });
          continue;
        }

        lignesToCreate.push({ article_id: entry.mpArticleId, quantite });
      }

      if (lignesToCreate.length === 0) continue;

      const { data: transferOrder, error: transferOrderError } = await supabaseServer
        .from("transfer_orders")
        .insert({
          depot_source_id: depotSourceId,
          depot_destination_id: depotDestinationId,
          date_jour: dateJour,
          cree_par: currentUser,
        })
        .select("id")
        .single();

      if (transferOrderError) {
        throw new Error(transferOrderError.message);
      }

      const transferOrderId = (transferOrder as { id: number }).id;

      const { error: lignesInsertError } = await supabaseServer.from("transfer_order_lignes").insert(
        lignesToCreate.map((l) => ({
          transfer_order_id: transferOrderId,
          article_type: "MP",
          article_id: l.article_id,
          quantite_demandee: l.quantite,
        }))
      );

      if (lignesInsertError) {
        throw new Error(lignesInsertError.message);
      }

      createdCodes.push(`${groupe} (${sousGroupe}) -> TO #${transferOrderId}`);
    }
  }

  if (createdCodes.length === 0) {
    throw new Error(
      skipped.length > 0
        ? "Aucun Transfer Order cree - aucune matiere premiere disponible dans son depot par defaut."
        : "Aucun Transfer Order cree - verifie que les articles ont un type/categorie et un depot par defaut."
    );
  }

  revalidatePath("/depots/transfer-order");
  redirect("/depots/transfer-order");
}
