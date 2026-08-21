"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { fetchLotsInDepot, totalAvailable } from "@/app/depots/transfer-order/stock-lots";

// Identique a app/production/programme/[numero]/stock/actions.ts (Programme
// MB) - meme regroupement par famille de produit fini et meme separation
// Colorant/Base vs le reste, demande explicite ("meme chose que le MB").
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

function categorieSousGroupe(categorie: string | null): string {
  const normalized = (categorie || "").trim().toUpperCase();
  const tokens = normalized.split(/[^A-Z0-9]+/).filter(Boolean);
  const isChimique =
    normalized.includes("COLORANT") ||
    normalized.includes("COL_COSM") ||
    normalized.includes("COL COSM") ||
    normalized === "BASE" ||
    tokens.includes("MP");
  return isChimique ? "Colorant-Base" : "Autre";
}

function round(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Meme comportement que autoCreateTransferOrdersAction (Programme MB), mais
// pour un groupe programme_lignes : pas de vrac_article_id/qt_vrac stockes
// ici, l'article vrac (nature/vrac_article_id) et le vrac reel de la ligne
// (vrac_a_fabriquer) servent directement au lieu d'un ratio derive de
// qt_carton. Tag source_groupe_id_programme_ligne au lieu de
// source_numero_programme.
export async function autoCreateTransferOrdersFromProgrammeLigneAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "depots"))) {
    throw new Error("Cet utilisateur ne peut pas creer de Transfer Order.");
  }

  const groupeId = Number(formData.get("groupe_id") || "0");
  if (!groupeId) {
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
    .from("programme_lignes")
    .select("article_id, qt_carton, vrac_a_fabriquer, date_jour")
    .or(`groupe_id.eq.${groupeId},and(groupe_id.is.null,id.eq.${groupeId})`);

  if (lignesError) {
    throw new Error(lignesError.message);
  }

  const lignes = ((lignesData ?? []) as {
    article_id: number | null;
    qt_carton: number | null;
    vrac_a_fabriquer: number | null;
    date_jour: string;
  }[]).filter((l) => l.article_id);

  if (lignes.length === 0) {
    throw new Error("Programme introuvable.");
  }

  const dateJour = lignes[0].date_jour;
  const articleIds = [...new Set(lignes.map((l) => l.article_id).filter((id): id is number => !!id))];

  const { data: articlesData } = await supabaseServer
    .from("articles")
    .select("id, type_article, nature, vrac_article_id, quantite_recette_base")
    .in("id", articleIds);

  const articleById = new Map(
    (
      (articlesData ?? []) as {
        id: number;
        type_article: string | null;
        nature: string | null;
        vrac_article_id: number | null;
        quantite_recette_base: number | null;
      }[]
    ).map((a) => [a.id, a])
  );

  function resolveVracId(articleId: number): number | null {
    const article = articleById.get(articleId);
    if (!article) return null;
    if (article.nature === "vrac") return articleId;
    return article.vrac_article_id ?? null;
  }

  const vracIds = [...new Set(articleIds.map((id) => resolveVracId(id)).filter((id): id is number => !!id))];
  const missingVracIds = vracIds.filter((id) => !articleById.has(id));

  if (missingVracIds.length > 0) {
    const { data: vracArticlesData } = await supabaseServer
      .from("articles")
      .select("id, type_article, nature, vrac_article_id, quantite_recette_base")
      .in("id", missingVracIds);
    for (const a of (vracArticlesData ?? []) as {
      id: number;
      type_article: string | null;
      nature: string | null;
      vrac_article_id: number | null;
      quantite_recette_base: number | null;
    }[]) {
      articleById.set(a.id, a);
    }
  }

  const recetteArticleIds = [...new Set([...articleIds, ...vracIds])];
  const { data: recettesData } = await supabaseServer
    .from("recettes_pf")
    .select("article_pf_id, article_mp_id, quantite")
    .in("article_pf_id", recetteArticleIds);

  const recettes = (recettesData ?? []) as { article_pf_id: number; article_mp_id: number; quantite: number }[];

  // besoin par (groupe de type, article MP) - le groupe vient TOUJOURS du
  // type_article de l'article FINI de la ligne (article_id), jamais du
  // vrac.
  const besoinParGroupeMp = new Map<string, Map<number, number>>();

  for (const ligne of lignes) {
    if (!ligne.article_id) continue;
    const pfArticle = articleById.get(ligne.article_id);
    const groupe = mapTypeArticleToGroupe(pfArticle?.type_article ?? null);
    const besoinMap = besoinParGroupeMp.get(groupe) ?? new Map<number, number>();

    if (ligne.qt_carton) {
      const ratioCarton = ligne.qt_carton / (pfArticle?.quantite_recette_base || 1);
      for (const r of recettes.filter((r) => r.article_pf_id === ligne.article_id)) {
        besoinMap.set(r.article_mp_id, (besoinMap.get(r.article_mp_id) ?? 0) + r.quantite * ratioCarton);
      }
    }

    const vracId = resolveVracId(ligne.article_id);
    if (vracId && ligne.vrac_a_fabriquer) {
      const vracArticle = articleById.get(vracId);
      const ratioVrac = ligne.vrac_a_fabriquer / (vracArticle?.quantite_recette_base || 1);
      for (const r of recettes.filter((r) => r.article_pf_id === vracId)) {
        besoinMap.set(r.article_mp_id, (besoinMap.get(r.article_mp_id) ?? 0) + r.quantite * ratioVrac);
      }
    }

    besoinParGroupeMp.set(groupe, besoinMap);
  }

  const allMpIds = [...new Set([...besoinParGroupeMp.values()].flatMap((m) => [...m.keys()]))];
  const { data: articlesMpData } = await supabaseServer
    .from("articles_matiere_premiere")
    .select("id, nom_article, categorie, depot_id")
    .in("id", allMpIds);
  const articleMpById = new Map(
    (
      (articlesMpData ?? []) as { id: number; nom_article: string; categorie: string | null; depot_id: number | null }[]
    ).map((a) => [a.id, a])
  );

  const createdCodes: string[] = [];
  const skipped: { articleId: number; besoin: number; disponible: number }[] = [];
  // Voir la note dans app/production/programme/[numero]/stock/actions.ts
  // (Programme MB) - un article MP sans depot par defaut connu ne doit
  // plus jamais disparaitre en silence d'un TO.
  const articlesSansDepot = new Set<string>();

  const year = dateJour.slice(0, 4);
  const { data: lastTransferOrder } = await supabaseServer
    .from("transfer_orders")
    .select("numero")
    .gte("date_jour", `${year}-01-01`)
    .lte("date_jour", `${year}-12-31`)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextNumero = ((lastTransferOrder as { numero: number | null } | null)?.numero ?? 0) + 1;

  for (const [groupe, besoinMap] of besoinParGroupeMp.entries()) {
    const buckets = new Map<string, { mpArticleId: number; quantite: number; depotSourceId: number }[]>();

    for (const [mpArticleId, besoin] of besoinMap.entries()) {
      if (besoin <= 0) continue;
      const mpArticle = articleMpById.get(mpArticleId);
      const depotSourceId = mpArticle?.depot_id ?? null;
      if (!depotSourceId) {
        articlesSansDepot.add(mpArticle?.nom_article ?? `#${mpArticleId}`);
        continue;
      }

      const sousGroupe = categorieSousGroupe(mpArticle?.categorie ?? null);
      const bucketKey = `${sousGroupe}::${depotSourceId}`;
      const list = buckets.get(bucketKey) ?? [];
      list.push({ mpArticleId, quantite: besoin, depotSourceId });
      buckets.set(bucketKey, list);
    }

    for (const [bucketKey, entries] of buckets.entries()) {
      const [sousGroupe, depotSourceIdRaw] = bucketKey.split("::");
      const depotSourceId = Number(depotSourceIdRaw);
      if (depotSourceId === depotDestinationId) continue;

      const lignesToCreate: { article_id: number; quantite: number }[] = [];
      for (const entry of entries) {
        const lots = await fetchLotsInDepot("MP", entry.mpArticleId, depotSourceId);
        const disponible = totalAvailable(lots);
        const quantiteBrute = Math.min(entry.quantite, disponible);
        // Article de conditionnement (sous-groupe "Autre" = Sleeve, Carton,
        // Flacon, Capsule...) = piece entiere, jamais une fraction - un
        // besoin de 313.2 cartons demande reellement 314 cartons. Seul le
        // sous-groupe Colorant-Base (liquide/poids) garde des decimales.
        const quantite = sousGroupe === "Colorant-Base" ? round(quantiteBrute) : Math.ceil(quantiteBrute);

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
          famille_produit: groupe,
          type_mp: sousGroupe === "Colorant-Base" ? "MP" : "Conditionnement",
          numero: nextNumero,
          source_groupe_id_programme_ligne: groupeId,
        })
        .select("id")
        .single();

      if (transferOrderError) {
        throw new Error(transferOrderError.message);
      }

      nextNumero += 1;
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

  if (createdCodes.length === 0 && articlesSansDepot.size === 0) {
    throw new Error(
      skipped.length > 0
        ? "Aucun Transfer Order cree - aucune matiere premiere disponible dans son depot par defaut."
        : "Aucun Transfer Order cree - verifie que les articles ont un type/categorie et un depot par defaut."
    );
  }

  revalidatePath("/depots/transfer-order");

  if (articlesSansDepot.size > 0) {
    const liste = [...articlesSansDepot].join(", ");
    redirect(
      `/depots/transfer-order?avertissement=${encodeURIComponent(
        `Ignore (aucun depot source connu, a regler depuis Articles MP) : ${liste}`
      )}`
    );
  }

  redirect("/depots/transfer-order");
}
