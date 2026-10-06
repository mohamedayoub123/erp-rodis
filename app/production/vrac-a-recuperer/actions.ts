"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { logAudit } from "@/lib/audit-log";
import {
  MAX_LIGNES_VRAC_A_RECUPERER,
  SOURCE_VRAC_A_RECUPERER,
  dateIsoValide,
  formaterQuantiteVrac,
  type LigneVracAEnregistrer,
} from "@/lib/vrac-a-recuperer";
import { lireIdDepotB, lireSoldesDepotB } from "./data";

type Reponse = { ok: true; message: string } | { ok: false; message: string };

function rafraichir() {
  revalidatePath("/production/vrac-a-recuperer");
  revalidatePath("/production/suivi-production");
  revalidatePath("/stock");
  revalidatePath("/depots");
}

// Retourne {ok, message} au lieu de "throw" : Next.js efface le message d'une
// Error jetee depuis une Server Action en production.
export async function ajouterVracARecupererAction(date: string, lignes: LigneVracAEnregistrer[]): Promise<Reponse> {
  try {
    const utilisateur = await getCurrentStockUser();
    if (!(await canWritePageUser(utilisateur, "productionVracARecuperer"))) {
      return { ok: false, message: "Cet utilisateur ne peut pas enregistrer de vrac a recuperer." };
    }

    const jour = String(date || "").trim();
    if (!dateIsoValide(jour)) return { ok: false, message: "Choisis une date valide." };

    if (!Array.isArray(lignes) || lignes.length === 0) {
      return { ok: false, message: "Ajoute au moins une ligne (article, code, quantite)." };
    }
    if (lignes.length > MAX_LIGNES_VRAC_A_RECUPERER) {
      return { ok: false, message: `Maximum ${MAX_LIGNES_VRAC_A_RECUPERER} lignes a la fois.` };
    }

    const propres = lignes.map((l) => ({
      articleId: Number(l.articleId),
      code: String(l.code ?? "").trim().slice(0, 60),
      quantite: l.quantite === null ? null : Number(l.quantite),
      remarque: String(l.remarque ?? "").trim().slice(0, 200),
    }));

    for (const [i, l] of propres.entries()) {
      const numero = i + 1;
      if (!Number.isInteger(l.articleId) || l.articleId <= 0) {
        return { ok: false, message: `Ligne ${numero} : choisis un article vrac dans la liste.` };
      }
      if (!l.code) return { ok: false, message: `Ligne ${numero} : ecris le code du vrac.` };
      if (l.quantite === null || !Number.isFinite(l.quantite) || l.quantite <= 0) {
        return { ok: false, message: `Ligne ${numero} : la quantite doit etre superieure a 0.` };
      }
    }

    // Le meme article + code deux fois dans la saisie ferait entrer le vrac en double
    const vus = new Set<string>();
    for (const l of propres) {
      const cle = `${l.articleId}|${l.code.toUpperCase()}`;
      if (vus.has(cle)) return { ok: false, message: `Le code ${l.code} est saisi deux fois pour le meme article.` };
      vus.add(cle);
    }

    const articleIds = [...new Set(propres.map((l) => l.articleId))];
    const [{ data: articlesData, error: articlesError }, depotBId] = await Promise.all([
      supabaseServer.from("articles").select("id, nom_article, nature").in("id", articleIds),
      lireIdDepotB(),
    ]);
    if (articlesError) return { ok: false, message: articlesError.message };
    if (!depotBId) return { ok: false, message: "Depot B introuvable." };

    const articles = new Map(
      ((articlesData ?? []) as { id: number; nom_article: string | null; nature: string | null }[]).map((a) => [a.id, a])
    );
    for (const l of propres) {
      const article = articles.get(l.articleId);
      if (!article) return { ok: false, message: "Un article choisi n'existe plus. Recharge la page." };
      if (article.nature !== "vrac") {
        return { ok: false, message: `${article.nom_article ?? "Cet article"} n'est pas un article vrac.` };
      }
    }

    // Ce code existe deja dans le Depot B ? Une entree existante (vrac mis de
    // cote en Fabrication, ou deja enregistre ici) ferait compter le stock deux
    // fois. Des sorties seules (recuperation faite avant l'entree) sont normales :
    // on garde alors l'ecriture exacte du code deja utilisee.
    const codesMajuscules = [...new Set(propres.map((l) => l.code.toUpperCase()))];
    const { data: existantsData, error: existantsError } = await supabaseServer
      .from("lots_stock")
      .select("article_id, numero_lot, code_normalise, qte_entree")
      .eq("depot_id", depotBId)
      .in("article_id", articleIds)
      .in("code_normalise", codesMajuscules);
    if (existantsError) return { ok: false, message: existantsError.message };

    const existants = (existantsData ?? []) as {
      article_id: number;
      numero_lot: string | null;
      code_normalise: string | null;
      qte_entree: number | null;
    }[];
    const ecritureExistante = new Map<string, string>();
    const dejaEntres = new Set<string>();
    for (const e of existants) {
      const cle = `${e.article_id}|${(e.code_normalise ?? e.numero_lot ?? "").toUpperCase()}`;
      if (e.numero_lot && !ecritureExistante.has(cle)) ecritureExistante.set(cle, e.numero_lot);
      if (Number(e.qte_entree ?? 0) > 0) dejaEntres.add(cle);
    }

    const soldes = dejaEntres.size > 0 ? await lireSoldesDepotB(depotBId, articleIds) : new Map<string, number>();
    for (const l of propres) {
      const cle = `${l.articleId}|${l.code.toUpperCase()}`;
      if (dejaEntres.has(cle)) {
        const numeroLot = ecritureExistante.get(cle) ?? l.code;
        const solde = soldes.get(`${l.articleId}|${numeroLot}`) ?? 0;
        return {
          ok: false,
          message: `Le code ${numeroLot} de ${articles.get(l.articleId)?.nom_article ?? "cet article"} est deja dans le Depot B (stock ${formaterQuantiteVrac(solde)}). Il ne faut pas l'enregistrer une deuxieme fois.`,
        };
      }
    }

    const lots = propres.map((l) => {
      const cle = `${l.articleId}|${l.code.toUpperCase()}`;
      const numeroLot = ecritureExistante.get(cle) ?? l.code;
      return {
        article_id: l.articleId,
        depot_id: depotBId,
        date_jour: jour,
        numero_lot: numeroLot,
        code_normalise: numeroLot.toUpperCase(),
        date_fabrication: jour,
        qte_entree: l.quantite as number,
        qte_sortie: 0,
        source_import: SOURCE_VRAC_A_RECUPERER,
        note: l.remarque ? `Vrac a recuperer - ${l.remarque}` : "Vrac a recuperer",
        utilisateur,
      };
    });

    const { error: insertError } = await supabaseServer.from("lots_stock").insert(lots);
    if (insertError) return { ok: false, message: insertError.message };

    const total = lots.reduce((somme, l) => somme + l.qte_entree, 0);
    await logAudit({
      utilisateur,
      module: "Stock",
      action: "creation",
      cible: lots.map((l) => l.numero_lot).join(", "),
      resume: `Vrac a recuperer - ${lots.length} lot(s) entres dans le Depot B, ${formaterQuantiteVrac(total)} au total`,
      apres: { lots },
    });

    rafraichir();
    const pluriel = lots.length > 1;
    return {
      ok: true,
      message: `${lots.length} lot${pluriel ? "s" : ""} entre${pluriel ? "s" : ""} dans le Depot B (${formaterQuantiteVrac(total)} kg). ${pluriel ? "Ils sont maintenant proposes" : "Il est maintenant propose"} dans "Code vrac recupere" du rapport Fabrication.`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Enregistrement impossible." };
  }
}

// Retire une entree creee par ce module. Refuse si le vrac a deja servi : le
// stock du code passerait en negatif.
export async function supprimerVracARecupererAction(lotId: number): Promise<Reponse> {
  try {
    const utilisateur = await getCurrentStockUser();
    if (!(await canDeletePageUser(utilisateur, "productionVracARecuperer"))) {
      return { ok: false, message: "Cet utilisateur ne peut pas supprimer de vrac a recuperer." };
    }
    if (!Number.isInteger(lotId) || lotId <= 0) return { ok: false, message: "Ligne invalide." };

    const { data, error } = await supabaseServer.from("lots_stock").select("*").eq("id", lotId).maybeSingle();
    if (error) return { ok: false, message: error.message };

    const lot = data as {
      id: number;
      article_id: number;
      depot_id: number | null;
      numero_lot: string | null;
      qte_entree: number | null;
      source_import: string | null;
    } | null;
    if (!lot) return { ok: false, message: "Cette ligne n'existe plus. Recharge la page." };
    if (lot.source_import !== SOURCE_VRAC_A_RECUPERER) {
      return { ok: false, message: "Seules les lignes enregistrees ici peuvent etre supprimees ici." };
    }
    if (!lot.depot_id) return { ok: false, message: "Depot introuvable pour cette ligne." };

    const soldes = await lireSoldesDepotB(lot.depot_id, [lot.article_id]);
    const solde = soldes.get(`${lot.article_id}|${lot.numero_lot ?? ""}`) ?? 0;
    const soldeApres = solde - Number(lot.qte_entree ?? 0);
    if (soldeApres < -1e-9) {
      return {
        ok: false,
        message: `Ce vrac a deja ete utilise (il reste ${formaterQuantiteVrac(solde)} sur ${formaterQuantiteVrac(Number(lot.qte_entree ?? 0))} entres) : impossible de le supprimer.`,
      };
    }

    const { error: deleteError } = await supabaseServer.from("lots_stock").delete().eq("id", lotId);
    if (deleteError) return { ok: false, message: deleteError.message };

    await logAudit({
      utilisateur,
      module: "Stock",
      action: "suppression",
      cible: lot.numero_lot,
      resume: `Vrac a recuperer ${lot.numero_lot ?? `#${lotId}`} retire du Depot B`,
      avant: { lots: [lot] },
    });

    rafraichir();
    return { ok: true, message: "Ligne supprimee." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Suppression impossible." };
  }
}
