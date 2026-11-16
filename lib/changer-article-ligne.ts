import { supabaseServer } from "@/lib/supabase-server";
import { computeQtCarton } from "@/lib/dispatcher-shared";

// Dashboard > Conditionnement : changer la CONTENANCE d'une ligne de programme (ex : LAIT WHITE SECRET 500ML -> 200ml ou 300ML). Les articles
// d'un meme vrac (ex "vrac lait white secret") se conditionnent dans plusieurs contenances : le vrac prevu ne change pas, les cartons prevus
// sont recalcules avec la contenance et le nombre de pieces par carton du nouvel article (meme formule que le Programme : vrac / contenance /
// pieces par carton, arrondi au carton superieur).
//
// Refuse des qu'une chose a deja ete faite avec l'ancien article sur cette ligne : cartons ou emballage saisis, Fin programme
// Conditionnement / Emballage, Besoin valide en salle de pesage / de conditionnement (les matieres reservees sont celles de l'ancien article).

export type ChangementArticle =
  | { ok: true; message: string; ancien: string; nouveau: string; cartonsAvant: number | null; cartonsApres: number | null }
  | { ok: false; message: string };

type LigneBrute = {
  id: number;
  article_id: number | null;
  produit: string | null;
  numero_lot: string | null;
  numero_lot_detail: { code: string; qt_vrac: number | null; qt_carton: number | null }[] | null;
  vrac_a_fabriquer: number | null;
  qt_carton: number | null;
  groupe_id: number | null;
  source_numero_programme: number | null;
};

type ArticleBrut = {
  id: number;
  nom_article: string;
  nature: string | null;
  vrac_article_id: number | null;
  contenance: number | null;
  piece_par_carton: number | null;
};

const ETAPES_BLOQUANTES = ["carton", "emballage", "pesage", "salle_conditionnement"];

export async function changerArticleLigne(ligneId: number, nouvelArticleId: number): Promise<ChangementArticle> {
  const { data: ligneData, error: ligneErreur } = await supabaseServer
    .from("programme_lignes")
    .select("id, article_id, produit, numero_lot, numero_lot_detail, vrac_a_fabriquer, qt_carton, groupe_id, source_numero_programme")
    .eq("id", ligneId)
    .maybeSingle();
  if (ligneErreur) return { ok: false, message: ligneErreur.message };
  const ligne = ligneData as LigneBrute | null;
  if (!ligne) return { ok: false, message: "Cette ligne n'existe plus. Recharge la page." };
  if (ligne.groupe_id === null && ligne.source_numero_programme === null) {
    return { ok: false, message: "Cette ligne ne vient pas d'un programme : sa contenance ne se change pas ici." };
  }
  if (!ligne.article_id) return { ok: false, message: "Cette ligne n'a pas d'article." };
  if (ligne.article_id === nouvelArticleId) return { ok: false, message: "C'est deja cette contenance." };

  const { data: articlesData, error: articlesErreur } = await supabaseServer
    .from("articles")
    .select("id, nom_article, nature, vrac_article_id, contenance, piece_par_carton")
    .in("id", [ligne.article_id, nouvelArticleId]);
  if (articlesErreur) return { ok: false, message: articlesErreur.message };
  const articles = (articlesData ?? []) as ArticleBrut[];
  const ancien = articles.find((a) => a.id === ligne.article_id);
  const nouveau = articles.find((a) => a.id === nouvelArticleId);
  if (!ancien || !nouveau) return { ok: false, message: "Article introuvable." };
  if (!ancien.vrac_article_id || ancien.vrac_article_id !== nouveau.vrac_article_id) {
    return { ok: false, message: `${nouveau.nom_article} n'utilise pas le meme vrac que ${ancien.nom_article} : changement refuse.` };
  }
  if (nouveau.nature === "vrac") return { ok: false, message: "Choisis un produit fini, pas un vrac." };
  if (!(Number(nouveau.contenance) > 0) || !(Number(nouveau.piece_par_carton) > 0)) {
    return { ok: false, message: `${nouveau.nom_article} n'a pas de contenance ou de pieces par carton dans sa fiche article.` };
  }

  // Rien ne doit avoir ete fait avec l'ancien article
  const [cartons, emballages, termines] = await Promise.all([
    supabaseServer.from("production_carton_entries").select("id").eq("programme_ligne_id", ligneId).limit(1),
    supabaseServer.from("production_emballage_entries").select("id").eq("programme_ligne_id", ligneId).limit(1),
    supabaseServer.from("production_code_termine").select("id, stage").eq("programme_ligne_id", ligneId),
  ]);
  for (const resultat of [cartons, emballages, termines]) if (resultat.error) return { ok: false, message: resultat.error.message };
  if ((cartons.data ?? []).length > 0 || (emballages.data ?? []).length > 0) {
    return { ok: false, message: "Des cartons ou de l'emballage sont deja saisis sur cette ligne : la contenance ne peut plus changer." };
  }
  const termineRows = (termines.data ?? []) as { id: number; stage: string }[];
  if (termineRows.some((t) => ETAPES_BLOQUANTES.includes(t.stage))) {
    return { ok: false, message: "Le Besoin ou la Fin programme de cette ligne est deja valide (matieres reservees pour l'ancienne contenance) : la contenance ne peut plus changer." };
  }
  if (termineRows.length > 0) {
    const { data: reserves, error: reservesErreur } = await supabaseServer
      .from("production_mp_reserve")
      .select("id")
      .in("production_code_termine_id", termineRows.map((t) => t.id))
      .limit(1);
    if (reservesErreur) return { ok: false, message: reservesErreur.message };
    if ((reserves ?? []).length > 0) {
      return { ok: false, message: "Des matieres sont deja reservees pour l'ancienne contenance : la contenance ne peut plus changer." };
    }
  }

  // Cartons prevus avec la nouvelle contenance (vrac prevu inchange), par lot puis au total
  const contenance = Number(nouveau.contenance);
  const piecesParCarton = Number(nouveau.piece_par_carton);
  const detail = Array.isArray(ligne.numero_lot_detail) ? ligne.numero_lot_detail : null;
  const nouveauDetail = detail?.map((entree) => ({ ...entree, qt_carton: computeQtCarton(entree.qt_vrac, contenance, piecesParCarton) })) ?? null;
  const totalCartons = nouveauDetail
    ? nouveauDetail.reduce((somme, entree) => somme + (entree.qt_carton ?? 0), 0)
    : computeQtCarton(ligne.vrac_a_fabriquer, contenance, piecesParCarton);

  const modification: Record<string, unknown> = {
    article_id: nouveau.id,
    produit: nouveau.nom_article,
    qt_carton: totalCartons,
  };
  if (nouveauDetail) modification.numero_lot_detail = nouveauDetail;

  const { data: modifiees, error: modificationErreur } = await supabaseServer
    .from("programme_lignes")
    .update(modification)
    .eq("id", ligneId)
    .eq("article_id", ancien.id)
    .select("id");
  if (modificationErreur) return { ok: false, message: modificationErreur.message };
  if ((modifiees ?? []).length !== 1) return { ok: false, message: "La ligne a change entre-temps. Recharge la page." };

  // L'historique du Programme Dispatcher (les lots de CETTE ligne, avec l'ancien article) suit : meme article, meme libelle, cartons recalcules
  if (ligne.groupe_id !== null) {
    const codes = (ligne.numero_lot || "").split(",").map((c) => c.trim()).filter(Boolean);
    if (codes.length > 0) {
      const { data: historique } = await supabaseServer
        .from("programme_dispatcher_history")
        .select("id, qt_vrac")
        .eq("source_groupe_id", ligne.groupe_id)
        .eq("article_id", ancien.id)
        .in("code", codes);
      for (const ligneHistorique of (historique ?? []) as { id: number; qt_vrac: number | null }[]) {
        await supabaseServer
          .from("programme_dispatcher_history")
          .update({
            article_id: nouveau.id,
            produit: nouveau.nom_article,
            qt_carton: computeQtCarton(ligneHistorique.qt_vrac, contenance, piecesParCarton),
          })
          .eq("id", ligneHistorique.id);
      }
    }
  }

  return {
    ok: true,
    message: `${ancien.nom_article} -> ${nouveau.nom_article} (cartons prevus ${ligne.qt_carton ?? "-"} -> ${totalCartons ?? "-"})`,
    ancien: ancien.nom_article,
    nouveau: nouveau.nom_article,
    cartonsAvant: ligne.qt_carton,
    cartonsApres: totalCartons,
  };
}
