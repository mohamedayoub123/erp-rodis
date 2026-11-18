import { supabaseServer } from "@/lib/supabase-server";
import { lireAvancementProgrammes } from "@/app/production/suivi/data";

// TI (Transfer Invoice) deja faits de Depot E vers Depot B POUR UN PROGRAMME, a deduire du besoin en articles de conditionnement.
//
// Un programme a un numero MB (programme_lignes.programe, ex "MB6598/AYOUB") et les Transfer Orders de E vers B qui lui apportent ses articles
// portent le MEME numero dans leur remarque ("PLASTIQUE MB-6598", "CONSOMMABLE MB-6598", "MP MB-6598"). Pour chaque programme en cours (MB) et
// chaque article de conditionnement (flacon, capsule, etiquette...) :
//   - TI        = ce qui a deja ete transfere par les TO de ce MB (TO poste : la quantite demandee ; TO partiellement fini : la quantite demandee moins
//                 ce qui reste reserve ; TO en attente / approuve : rien, le TI n'est pas encore fait) ;
//   - consomme  = ce que la production a deja consomme de cet article : cartons deja produits (etape conditionnement) de toutes les lignes du MB,
//                 une ligne ou un code termine comptant pour tout son programme, x quantite de la recette ;
//   - restant   = ce que les cartons qu'il reste a conditionner des lignes en cours vont encore consommer (cartons restants x recette) ;
//   - deduit    = min(TI - consomme, restant) : ce qui est deja sorti vers le B pour ce programme et pas encore consomme. Jamais plus que ce que le
//                 programme a encore besoin, jamais negatif.
// Le besoin en articles de conditionnement est diminue de la somme de ces "deduit" sur tous les programmes (un programme sans TI ne deduit rien :
// sans TI, le flacon n'est pas la). Un TO dont la remarque n'a pas de numero MB n'est pas compte.
//
// Seuls les programmes A VENIR ou du jour comptent (date de production >= aujourd'hui moins JOURS_DE_MARGE) : la production d'une ligne n'est presque
// jamais enregistree en conditionnement et la plupart des lignes ne sont jamais "terminees" (aucun programme MB n'est termine, certains datent
// d'aout) ; un vieux programme dont le TI est fait depuis longtemps a deja consomme ses articles, ils ne sont plus au Depot B. Les TO sont faits
// autour de la date du programme (mediane : le jour meme ; 95 % entre 14 jours avant et 11 jours apres). Un vieux programme redonne en retard
// n'est pas deduit : le manque peut alors etre surestime, jamais cache.
export const JOURS_DE_MARGE = 3;

function dateIsoIlYaJours(jours: number): string {
  return new Date(Date.now() - jours * 86400000).toISOString().slice(0, 10);
}

export type DeductionTiMp = {
  // total deduit du besoin de cet article de conditionnement (somme sur les programmes)
  deduction: number;
  parProgramme: { mb: string; ti: number; consomme: number; restant: number; deduit: number }[];
};

type LigneProgramme = {
  id: number;
  article_id: number | null;
  programe: string | null;
  qt_carton: number | null;
  numero_lot: string | null;
  numero_lot_detail: { code: string; qt_carton: number | null }[] | null;
  programme_termine: boolean | null;
  confirme_production: boolean | null;
  exclu_rapports: boolean | null;
};

// "MB6598/AYOUB" ou "PLASTIQUE MB-6598" -> "6598" (null = pas de numero MB)
export function numeroMb(texte: string | null | undefined): string | null {
  const m = /MB[-. ]?0*(\d+)/i.exec(String(texte ?? ""));
  return m ? m[1] : null;
}

function decouper<T>(liste: T[], taille: number): T[][] {
  const morceaux: T[][] = [];
  for (let debut = 0; debut < liste.length; debut += taille) morceaux.push(liste.slice(debut, debut + taille));
  return morceaux;
}

// Lecture par pages de 1000 (la base plafonne chaque reponse), triee par id pour que la pagination soit stable
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function lireTout<T>(table: string, colonnes: string, filtre?: (requete: any) => any): Promise<T[]> {
  const lignes: T[] = [];
  for (let debut = 0; ; debut += 1000) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let requete: any = supabaseServer.from(table).select(colonnes);
    if (filtre) requete = filtre(requete);
    const { data, error } = await requete.order("id", { ascending: true }).range(debut, debut + 999);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as T[];
    lignes.push(...page);
    if (page.length < 1000) break;
  }
  return lignes;
}

// Cartons prevus d'une ligne (meme regle que le suivi de production : le detail par code s'il existe, sinon la quantite de la ligne pour chaque code)
function cartonsPrevus(ligne: LigneProgramme): number {
  const codes = String(ligne.numero_lot ?? "").split(",").map((code) => code.trim()).filter(Boolean);
  const detail = ligne.numero_lot_detail ?? [];
  if (codes.length > 1 && detail.length === codes.length) return detail.reduce((somme, ligneDetail) => somme + Number(ligneDetail.qt_carton ?? 0), 0);
  return Number(ligne.qt_carton ?? 0) * Math.max(1, codes.length);
}

// articleIds (optionnel) : ne compte comme "restant" que les lignes de ces articles (pages du besoin de certaines proformas seulement) ; la
// consommation, elle, compte toutes les lignes du programme (le TI est fait pour tout le programme).
export async function calculerDeductionTiProgrammes(options?: { articleIds?: Set<number> }): Promise<Map<number, DeductionTiMp>> {
  const resultat = new Map<number, DeductionTiMp>();

  // 1) Lignes de programme en cours (avancement de chaque code) regroupees par numero MB
  const avancement = await lireAvancementProgrammes();
  const dateLimite = dateIsoIlYaJours(JOURS_DE_MARGE);
  const restantParLigne = new Map<number, { articleId: number; mb: string; restant: number; consomme: number }>();
  for (const code of avancement) {
    const mb = numeroMb(code.programe);
    // seulement les lignes a venir ou du jour (voir JOURS_DE_MARGE) : les vieilles lignes jamais terminees ont deja consomme leurs articles
    if (!mb || !code.articleId || String(code.dateJour).slice(0, 10) < dateLimite) continue;
    const ligne = restantParLigne.get(code.ligneId) ?? { articleId: code.articleId, mb, restant: 0, consomme: 0 };
    ligne.restant += code.cartonRestant;
    // consomme : un code termine compte pour tout ce qui etait prevu, sinon les cartons deja produits
    ligne.consomme += code.cartonTermine ? code.cartonPrevu : code.cartonProduit;
    restantParLigne.set(code.ligneId, ligne);
  }
  const mbAvecReste = new Set<string>();
  for (const ligne of restantParLigne.values()) if (ligne.restant > 0) mbAvecReste.add(ligne.mb);
  if (mbAvecReste.size === 0) return resultat;

  // 2) TI deja faits par MB et par article : TO de Depot E vers Depot B, postes ou partiellement finis, dont la remarque porte un MB en cours
  const { data: depotsData, error: depotsError } = await supabaseServer.from("depots").select("id, nom");
  if (depotsError) throw new Error(depotsError.message);
  const depots = (depotsData ?? []) as { id: number; nom: string }[];
  const depotE = depots.find((depot) => depot.nom === "Depot E")?.id;
  const depotB = depots.find((depot) => depot.nom === "Depot B")?.id;
  if (!depotE || !depotB) return resultat;

  const tosBruts = await lireTout<{ id: number; remarque: string | null; statut: string }>(
    "transfer_orders",
    "id, remarque, statut",
    (requete) =>
      requete.eq("depot_source_id", depotE).eq("depot_destination_id", depotB).in("statut", ["poste", "partiellement_fini"]).ilike("remarque", "%MB%")
  );
  const mbDuTo = new Map<number, string>();
  const statutDuTo = new Map<number, string>();
  for (const to of tosBruts) {
    const mb = numeroMb(to.remarque);
    if (mb && mbAvecReste.has(mb)) {
      mbDuTo.set(to.id, mb);
      statutDuTo.set(to.id, to.statut);
    }
  }
  if (mbDuTo.size === 0) return resultat;

  type LigneTo = { id: number; transfer_order_id: number; article_id: number; quantite_demandee: number | string | null };
  const lignesTo: LigneTo[] = [];
  for (const ids of decouper([...mbDuTo.keys()], 150)) {
    lignesTo.push(
      ...(await lireTout<LigneTo>("transfer_order_lignes", "id, transfer_order_id, article_id, quantite_demandee", (requete) =>
        requete.eq("article_type", "MP").in("transfer_order_id", ids)
      ))
    );
  }
  // TO partiellement fini : ce qui reste reserve (pas encore livre) est a retirer de la quantite demandee
  const resteReserve = new Map<number, number>();
  const lignesPartielles = lignesTo.filter((ligne) => statutDuTo.get(ligne.transfer_order_id) === "partiellement_fini").map((ligne) => ligne.id);
  for (const ids of decouper(lignesPartielles, 150)) {
    const lots = await lireTout<{ id: number; transfer_order_ligne_id: number; quantite: number | string | null }>(
      "transfer_order_ligne_lots",
      "id, transfer_order_ligne_id, quantite",
      (requete) => requete.in("transfer_order_ligne_id", ids)
    );
    for (const lot of lots) {
      resteReserve.set(lot.transfer_order_ligne_id, (resteReserve.get(lot.transfer_order_ligne_id) ?? 0) + Number(lot.quantite ?? 0));
    }
  }
  const tiParMbEtMp = new Map<string, Map<number, number>>();
  for (const ligne of lignesTo) {
    const mb = mbDuTo.get(ligne.transfer_order_id);
    if (!mb) continue;
    const demande = Number(ligne.quantite_demandee ?? 0);
    const livre = statutDuTo.get(ligne.transfer_order_id) === "poste" ? demande : Math.max(0, demande - (resteReserve.get(ligne.id) ?? 0));
    if (!(livre > 0)) continue;
    const parMp = tiParMbEtMp.get(mb) ?? new Map<number, number>();
    parMp.set(ligne.article_id, (parMp.get(ligne.article_id) ?? 0) + livre);
    tiParMbEtMp.set(mb, parMp);
  }
  if (tiParMbEtMp.size === 0) return resultat;

  // 3) Toutes les lignes de ces programmes (terminees ou non) : la consommation vient de tous les cartons deja produits du MB
  const mbAvecTi = [...tiParMbEtMp.keys()];
  const lignesDesMb: LigneProgramme[] = [];
  for (const morceau of decouper(mbAvecTi, 20)) {
    const trouvees = await lireTout<LigneProgramme>(
      "programme_lignes",
      "id, article_id, programe, qt_carton, numero_lot, numero_lot_detail, programme_termine, confirme_production, exclu_rapports",
      (requete) => requete.eq("exclu_rapports", false).or(morceau.map((mb) => `programe.ilike.%${mb}%`).join(","))
    );
    lignesDesMb.push(...trouvees.filter((ligne) => {
      const mb = numeroMb(ligne.programe);
      return !!mb && morceau.includes(mb) && !!ligne.article_id;
    }));
  }

  // 4) Recettes (articles de conditionnement par carton) des articles de ces programmes
  const articleIds = [...new Set(lignesDesMb.map((ligne) => ligne.article_id).filter((id): id is number => !!id))];
  const baseParArticle = new Map<number, number>();
  const recettesParArticle = new Map<number, { mpId: number; quantite: number }[]>();
  for (const ids of decouper(articleIds, 150)) {
    const [articles, recettes] = await Promise.all([
      lireTout<{ id: number; quantite_recette_base: number | null }>("articles", "id, quantite_recette_base", (requete) => requete.in("id", ids)),
      lireTout<{ id: number; article_pf_id: number; article_mp_id: number; quantite: number | null }>(
        "recettes_pf",
        "id, article_pf_id, article_mp_id, quantite",
        (requete) => requete.in("article_pf_id", ids)
      ),
    ]);
    for (const article of articles) baseParArticle.set(article.id, Number(article.quantite_recette_base ?? 0));
    for (const recette of recettes) {
      if (!(Number(recette.quantite ?? 0) > 0)) continue;
      const liste = recettesParArticle.get(recette.article_pf_id) ?? [];
      liste.push({ mpId: recette.article_mp_id, quantite: Number(recette.quantite) });
      recettesParArticle.set(recette.article_pf_id, liste);
    }
  }

  // 5) Par programme (MB) et article de conditionnement : consomme, restant, deduit = min(TI - consomme, restant)
  const consommeParMbEtMp = new Map<string, Map<number, number>>();
  const restantParMbEtMp = new Map<string, Map<number, number>>();
  const ajouter = (cible: Map<string, Map<number, number>>, mb: string, mpId: number, valeur: number) => {
    const parMp = cible.get(mb) ?? new Map<number, number>();
    parMp.set(mpId, (parMp.get(mpId) ?? 0) + valeur);
    cible.set(mb, parMp);
  };
  for (const ligne of lignesDesMb) {
    const mb = numeroMb(ligne.programe) as string;
    const articleId = ligne.article_id as number;
    const base = baseParArticle.get(articleId) ?? 0;
    if (!(base > 0)) continue;
    const enCours = restantParLigne.get(ligne.id);
    // cartons deja produits : une ligne terminee compte pour tout son programme, une ligne en cours pour ses cartons deja produits, une ligne
    // pas confirmee n'a rien produit
    const consomme = enCours ? enCours.consomme : ligne.programme_termine === true ? cartonsPrevus(ligne) : 0;
    const restant = enCours && (!options?.articleIds || options.articleIds.has(articleId)) ? enCours.restant : 0;
    for (const recette of recettesParArticle.get(articleId) ?? []) {
      if (consomme > 0) ajouter(consommeParMbEtMp, mb, recette.mpId, (consomme * recette.quantite) / base);
      if (restant > 0) ajouter(restantParMbEtMp, mb, recette.mpId, (restant * recette.quantite) / base);
    }
  }
  for (const [mb, parMp] of tiParMbEtMp) {
    for (const [mpId, ti] of parMp) {
      const restant = restantParMbEtMp.get(mb)?.get(mpId) ?? 0;
      if (!(restant > 0)) continue;
      const consomme = consommeParMbEtMp.get(mb)?.get(mpId) ?? 0;
      const deduit = Math.min(Math.max(0, ti - consomme), restant);
      if (!(deduit > 1e-6)) continue;
      const entree = resultat.get(mpId) ?? { deduction: 0, parProgramme: [] };
      entree.deduction += deduit;
      entree.parProgramme.push({ mb, ti, consomme, restant, deduit });
      resultat.set(mpId, entree);
    }
  }
  return resultat;
}
