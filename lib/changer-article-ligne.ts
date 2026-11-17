import { supabaseServer } from "@/lib/supabase-server";
import { computeQtCarton } from "@/lib/dispatcher-shared";

// Dashboard > Conditionnement : changer la CONTENANCE d'une ligne de programme (ex : GEL DOUCHE SOOPURE CAROTTE 3/1 300ML -> 600ML). Les articles
// d'un meme vrac se conditionnent dans plusieurs contenances : le vrac prevu ne change pas, les cartons prevus sont recalcules avec la
// contenance et le nombre de pieces par carton du nouvel article (meme formule que le Programme : vrac / contenance / pieces par carton,
// arrondi au carton superieur).
//
// Un lot (code) deja commence avec l'ancien article (cartons ou emballage saisis, Fin programme Conditionnement / Emballage, Besoin valide en salle
// de pesage / de conditionnement : les matieres reservees sont celles de l'ancien article) NE change PAS de contenance :
//  - aucun lot commence : la ligne entiere change d'article ;
//  - certains lots commences : les lots PAS ENCORE commences passent sur une NOUVELLE ligne de programme (meme groupe / PD, meme date, meme
//    chaine) avec le nouvel article ; les lots commences restent sur la ligne d'origine. Pour chaque lot deplace, ses lignes de Fabrication /
//    Test labo / choix de code vrac suivent (elles sont rattachees a la ligne et au code) ;
//  - tous les lots commences : refuse.

export type ChangementArticle =
  | {
      ok: true;
      message: string;
      ancien: string;
      nouveau: string;
      cartonsAvant: number | null;
      cartonsApres: number | null;
      // lots deplaces sur une nouvelle ligne (vide = la ligne entiere a change d'article)
      lotsDeplaces: string[];
      lotsGardes: string[];
      nouvelleLigneId: number | null;
    }
  | { ok: false; message: string };

type EntreeDetail = { code: string; qt_vrac: number | null; qt_carton: number | null };

type LigneBrute = Record<string, unknown> & {
  id: number;
  article_id: number | null;
  produit: string | null;
  numero_lot: string | null;
  numero_lot_detail: EntreeDetail[] | null;
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
const TABLES_DEPLACEES = ["production_rapports", "production_vrac_entries", "production_code_termine", "conditionnement_codes_vrac"] as const;

const somme = (valeurs: (number | null | undefined)[]) => valeurs.reduce<number>((total, valeur) => total + Number(valeur ?? 0), 0);

// code : le lot de la ligne du Dashboard sur laquelle on a clique - SEUL ce lot change de contenance, les autres lots de la ligne ne changent pas
// (chacun se change separement). Sans code : tous les lots pas encore commences de la ligne.
export async function changerArticleLigne(ligneId: number, nouvelArticleId: number, code?: string): Promise<ChangementArticle> {
  const { data: ligneData, error: ligneErreur } = await supabaseServer.from("programme_lignes").select("*").eq("id", ligneId).maybeSingle();
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
  const contenance = Number(nouveau.contenance);
  const piecesParCarton = Number(nouveau.piece_par_carton);

  // Qu'est-ce qui est deja commence, lot par lot ?
  const codes = (ligne.numero_lot || "").split(",").map((c) => c.trim()).filter(Boolean);
  const [cartons, emballages, termines] = await Promise.all([
    supabaseServer.from("production_carton_entries").select("code").eq("programme_ligne_id", ligneId),
    supabaseServer.from("production_emballage_entries").select("code").eq("programme_ligne_id", ligneId),
    supabaseServer.from("production_code_termine").select("id, code, stage").eq("programme_ligne_id", ligneId),
  ]);
  for (const resultat of [cartons, emballages, termines]) if (resultat.error) return { ok: false, message: resultat.error.message };
  const entrees = [...((cartons.data ?? []) as { code: string | null }[]), ...((emballages.data ?? []) as { code: string | null }[])];
  if (entrees.some((entree) => !(entree.code ?? "").trim())) {
    return { ok: false, message: "Cette ligne a une saisie ancienne sans numero de lot : la contenance ne peut plus changer." };
  }
  const termineRows = (termines.data ?? []) as { id: number; code: string | null; stage: string }[];
  const codesOuLigneEntiere = codes.length > 0 ? codes : [""];
  const demarres = new Set<string>();
  for (const entree of entrees) demarres.add((entree.code ?? "").trim());
  for (const termine of termineRows) if (ETAPES_BLOQUANTES.includes(termine.stage)) demarres.add((termine.code ?? "").trim());
  const codeDemande = code && code.trim() !== "-" ? code.trim() : "";
  let lotsGardes: string[];
  let lotsAChanger: string[];
  if (codeDemande) {
    // UN seul lot : celui de la ligne du Dashboard sur laquelle on a clique. Les autres lots de la ligne gardent leur contenance.
    if (!codes.includes(codeDemande)) return { ok: false, message: "Ce lot n'existe plus sur cette ligne. Recharge la page." };
    if (demarres.has(codeDemande)) {
      return { ok: false, message: "Ce lot a deja du conditionnement ou un Besoin valide : sa contenance ne peut plus changer." };
    }
    lotsAChanger = [codeDemande];
    lotsGardes = codes.filter((lot) => lot !== codeDemande);
  } else {
    lotsGardes = codesOuLigneEntiere.filter((lot) => demarres.has(lot) || (codes.length === 0 && demarres.size > 0));
    lotsAChanger = codesOuLigneEntiere.filter((lot) => !lotsGardes.includes(lot));
    if (lotsAChanger.length === 0) {
      return { ok: false, message: "Tous les lots de cette ligne ont deja du conditionnement ou un Besoin valide : la contenance ne peut plus changer." };
    }
  }

  // Des matieres reservees pour l'ancienne contenance sur les lots qui changeraient : refuse
  const termineAChanger = termineRows.filter((t) => lotsAChanger.includes((t.code ?? "").trim()));
  if (termineAChanger.length > 0) {
    const { data: reserves, error: reservesErreur } = await supabaseServer
      .from("production_mp_reserve")
      .select("id")
      .in("production_code_termine_id", termineAChanger.map((t) => t.id))
      .limit(1);
    if (reservesErreur) return { ok: false, message: reservesErreur.message };
    if ((reserves ?? []).length > 0) {
      return { ok: false, message: "Des matieres sont deja reservees pour l'ancienne contenance : la contenance ne peut plus changer." };
    }
  }

  const detail = Array.isArray(ligne.numero_lot_detail) ? ligne.numero_lot_detail : null;
  const nouveauCartons = (entree: EntreeDetail) => computeQtCarton(entree.qt_vrac, contenance, piecesParCarton);

  // ----- Aucun lot commence : toute la ligne change d'article -----
  if (lotsGardes.length === 0) {
    const nouveauDetail = detail?.map((entree) => ({ ...entree, qt_carton: nouveauCartons(entree) })) ?? null;
    const totalCartons = nouveauDetail ? somme(nouveauDetail.map((entree) => entree.qt_carton)) : computeQtCarton(ligne.vrac_a_fabriquer, contenance, piecesParCarton);
    const modification: Record<string, unknown> = { article_id: nouveau.id, produit: nouveau.nom_article, qt_carton: totalCartons };
    if (nouveauDetail) modification.numero_lot_detail = nouveauDetail;

    const { data: modifiees, error: modificationErreur } = await supabaseServer
      .from("programme_lignes")
      .update(modification)
      .eq("id", ligneId)
      .eq("article_id", ancien.id)
      .select("id");
    if (modificationErreur) return { ok: false, message: modificationErreur.message };
    if ((modifiees ?? []).length !== 1) return { ok: false, message: "La ligne a change entre-temps. Recharge la page." };

    await mettreAJourHistorique(ligne, codes, ancien.id, nouveau, contenance, piecesParCarton);
    return {
      ok: true,
      message: `${ancien.nom_article} -> ${nouveau.nom_article} (cartons prevus ${ligne.qt_carton ?? "-"} -> ${totalCartons ?? "-"})`,
      ancien: ancien.nom_article,
      nouveau: nouveau.nom_article,
      cartonsAvant: ligne.qt_carton,
      cartonsApres: totalCartons,
      lotsDeplaces: [],
      lotsGardes: [],
      nouvelleLigneId: null,
    };
  }

  // ----- Certains lots commences : les autres passent sur une NOUVELLE ligne -----
  if (!detail || detail.length !== codes.length || !codes.every((code) => detail.some((entree) => entree.code === code))) {
    return { ok: false, message: "La repartition des lots de cette ligne est incomplete : impossible de separer les lots deja commences des autres." };
  }
  const detailDeplace = detail.filter((entree) => lotsAChanger.includes(entree.code)).map((entree) => ({ ...entree, qt_carton: nouveauCartons(entree) }));
  const detailGarde = detail.filter((entree) => lotsGardes.includes(entree.code));
  const cartonsDeplaces = somme(detailDeplace.map((entree) => entree.qt_carton));
  const cartonsAvantDeplaces = somme(detail.filter((entree) => lotsAChanger.includes(entree.code)).map((entree) => entree.qt_carton));

  // 1) ligne d'arrivee : une ligne DEJA existante du meme groupe / PD, meme date, meme chaine et meme zone avec le nouvel article (les lots que l'on
  // change un par un s'y regroupent), sinon une NOUVELLE ligne (copie de la ligne d'origine)
  type LigneCible = {
    id: number;
    numero_lot: string | null;
    numero_lot_detail: EntreeDetail[] | null;
    vrac_a_fabriquer: number | null;
    qt_carton: number | null;
    programme_termine: boolean | null;
  };
  let cible: LigneCible | null = null;
  const dateJour = typeof ligne.date_jour === "string" ? ligne.date_jour : null;
  const zone = typeof ligne.zone === "string" ? ligne.zone : null;
  const chaine = typeof ligne.chaine === "string" ? ligne.chaine : null;
  if (ligne.groupe_id !== null && dateJour && zone && chaine) {
    const { data: candidats } = await supabaseServer
      .from("programme_lignes")
      .select("id, numero_lot, numero_lot_detail, vrac_a_fabriquer, qt_carton, programme_termine")
      .eq("groupe_id", ligne.groupe_id)
      .eq("article_id", nouveau.id)
      .eq("date_jour", dateJour)
      .eq("zone", zone)
      .eq("chaine", chaine)
      .neq("id", ligneId)
      .order("id", { ascending: true });
    cible =
      ((candidats ?? []) as LigneCible[]).find((candidat) => {
        const lotsCandidat = (candidat.numero_lot || "").split(",").map((c) => c.trim()).filter(Boolean);
        return (
          !candidat.programme_termine &&
          Array.isArray(candidat.numero_lot_detail) &&
          candidat.numero_lot_detail.length === lotsCandidat.length &&
          !lotsAChanger.some((lot) => lotsCandidat.includes(lot))
        );
      }) ?? null;
  }

  let nouvelleLigneId: number;
  let ligneCreee = false;
  if (cible) {
    const lotsCible = (cible.numero_lot || "").split(",").map((c) => c.trim()).filter(Boolean);
    const detailArrivee = [...(cible.numero_lot_detail ?? []), ...detailDeplace];
    const { data: fusionnee, error: fusionErreur } = await supabaseServer
      .from("programme_lignes")
      .update({
        numero_lot: [...lotsCible, ...lotsAChanger].join(", "),
        numero_lot_detail: detailArrivee,
        vrac_a_fabriquer: somme(detailArrivee.map((entree) => entree.qt_vrac)),
        qt_carton: somme(detailArrivee.map((entree) => entree.qt_carton)),
      })
      .eq("id", cible.id)
      .select("id");
    if (fusionErreur) return { ok: false, message: fusionErreur.message };
    if ((fusionnee ?? []).length !== 1) return { ok: false, message: "La ligne d'arrivee a change entre-temps. Recharge la page." };
    nouvelleLigneId = cible.id;
  } else {
    const { id: _ancienId, ...copie } = ligne;
    void _ancienId;
    const nouvelleLigne = {
      ...copie,
      article_id: nouveau.id,
      produit: nouveau.nom_article,
      numero_lot: lotsAChanger.join(", "),
      numero_lot_detail: detailDeplace,
      vrac_a_fabriquer: somme(detailDeplace.map((entree) => entree.qt_vrac)),
      qt_carton: cartonsDeplaces,
    };
    const { data: creee, error: creationErreur } = await supabaseServer.from("programme_lignes").insert(nouvelleLigne).select("id").maybeSingle();
    if (creationErreur) return { ok: false, message: creationErreur.message };
    const idCree = (creee as { id: number } | null)?.id;
    if (!idCree) return { ok: false, message: "La nouvelle ligne n'a pas pu etre creee." };
    nouvelleLigneId = idCree;
    ligneCreee = true;
  }

  // 2) les lignes rattachees a (ligne, lot) des lots deplaces suivent la ligne d'arrivee ; en cas d'echec tout est remis comme avant
  const tablesDeplacees: string[] = [];
  const annuler = async () => {
    for (const table of tablesDeplacees) {
      await supabaseServer.from(table).update({ programme_ligne_id: ligneId }).eq("programme_ligne_id", nouvelleLigneId).in("code", lotsAChanger);
    }
    if (ligneCreee) {
      await supabaseServer.from("programme_lignes").delete().eq("id", nouvelleLigneId);
    } else if (cible) {
      await supabaseServer
        .from("programme_lignes")
        .update({
          numero_lot: cible.numero_lot,
          numero_lot_detail: cible.numero_lot_detail,
          vrac_a_fabriquer: cible.vrac_a_fabriquer,
          qt_carton: cible.qt_carton,
        })
        .eq("id", cible.id);
    }
  };
  for (const table of TABLES_DEPLACEES) {
    const { error } = await supabaseServer.from(table).update({ programme_ligne_id: nouvelleLigneId }).eq("programme_ligne_id", ligneId).in("code", lotsAChanger);
    if (error) {
      await annuler();
      return { ok: false, message: `${error.message} (rien n'a ete change)` };
    }
    tablesDeplacees.push(table);
  }

  // 3) la ligne d'origine ne garde que les lots commences
  const { data: gardees, error: gardeErreur } = await supabaseServer
    .from("programme_lignes")
    .update({
      numero_lot: lotsGardes.join(", "),
      numero_lot_detail: detailGarde,
      vrac_a_fabriquer: somme(detailGarde.map((entree) => entree.qt_vrac)),
      qt_carton: somme(detailGarde.map((entree) => entree.qt_carton)),
    })
    .eq("id", ligneId)
    .eq("article_id", ancien.id)
    .select("id");
  if (gardeErreur || (gardees ?? []).length !== 1) {
    await annuler();
    return { ok: false, message: `${gardeErreur?.message ?? "La ligne a change entre-temps. Recharge la page."} (rien n'a ete change)` };
  }

  // 4) historique du Programme Dispatcher des lots deplaces
  await mettreAJourHistorique(ligne, lotsAChanger, ancien.id, nouveau, contenance, piecesParCarton);

  return {
    ok: true,
    message: `Lot${lotsAChanger.length > 1 ? "s" : ""} ${lotsAChanger.join(", ")} : ${ancien.nom_article} -> ${nouveau.nom_article} ${
      ligneCreee ? "sur une nouvelle ligne" : "sur la ligne deja existante dans cette contenance"
    } (cartons prevus ${cartonsAvantDeplaces} -> ${cartonsDeplaces}) ; ${lotsGardes.join(", ")} ne change${lotsGardes.length > 1 ? "nt" : ""} pas`,
    ancien: ancien.nom_article,
    nouveau: nouveau.nom_article,
    cartonsAvant: cartonsAvantDeplaces,
    cartonsApres: cartonsDeplaces,
    lotsDeplaces: lotsAChanger,
    lotsGardes,
    nouvelleLigneId,
  };
}

// L'historique du Programme Dispatcher (les lots de CETTE ligne, avec l'ancien article) suit : meme article, meme libelle, cartons recalcules
async function mettreAJourHistorique(
  ligne: LigneBrute,
  codes: string[],
  ancienArticleId: number,
  nouveau: ArticleBrut,
  contenance: number,
  piecesParCarton: number
) {
  if (ligne.groupe_id === null || codes.length === 0) return;
  const { data: historique } = await supabaseServer
    .from("programme_dispatcher_history")
    .select("id, qt_vrac")
    .eq("source_groupe_id", ligne.groupe_id)
    .eq("article_id", ancienArticleId)
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
