import { supabaseServer } from "@/lib/supabase-server";
import { calculerConsommationVrac, type DemandeLigneCode } from "@/lib/vrac-consommation";

// Dashboard > Conditionnement : la colonne N Lot est vide au depart, la personne choisit le ou les CODES VRAC qu'elle conditionne sur la
// ligne. La quantite de vrac consommee sur chaque code n'est plus tapee : elle se CALCULE avec les cartons produits (cartons x contenance x
// pieces par carton), plafonnee au vrac fabrique sur le code, voir lib/vrac-consommation.ts. ChoixCodeVrac.quantite = kg consommes
// (calcules a la lecture). Ici : lecture des choix, calcul des codes vrac DISPONIBLES pour une ligne, regles de controle. Table :
// conditionnement_codes_vrac (scripts/sql/create_conditionnement_codes_vrac.sql) ; sa colonne quantite_vrac n'est plus utilisee (elle doit
// rester > 0 : on y ecrit QUANTITE_VRAC_IGNOREE).

// Valeur ecrite dans conditionnement_codes_vrac.quantite_vrac pour un nouveau choix : la table impose quantite_vrac > 0 mais la quantite
// reellement consommee est calculee avec les cartons, cette valeur n'est jamais lue.
export const QUANTITE_VRAC_IGNOREE = 0.001;

export type ChoixCodeVrac = { id: number; ligneId: number; code: string; codeVrac: string; quantite: number };

export type CodeVracDisponible = {
  code: string;
  // ce qu'il reste a conditionner : vrac fabrique - quantites deja choisies - cartons deja conditionnes sous son propre code
  disponible: number;
  fabrique: number;
  derniereDate: string | null;
  // Fin programme du Conditionnement deja faite sur ce code : il reste propose tant qu'il a du vrac (ex : changer de contenance en urgence)
  clos: boolean;
};

export type ResultatChoix =
  | { ok: true; parLigneCode: Map<string, ChoixCodeVrac[]> }
  | { ok: false; erreur: string; tableAbsente: boolean };

const BLOCAGES_QUALITE = new Set(["a_recuperer", "a_detruire"]);

export function cleChoix(ligneId: number, code: string): string {
  return `${ligneId}::${code}`;
}

export function arrondi3(valeur: number): number {
  return Math.round(valeur * 1000) / 1000;
}

function erreurTableAbsente(message: string | undefined): boolean {
  // "Could not find the table ... in the schema cache" (PGRST205) ou "relation ... does not exist" (42P01) : le script SQL n'est pas lance
  return /does not exist|schema cache|PGRST205|42P01/i.test(message ?? "");
}

type ChoixBrut = { id: number; programme_ligne_id: number; code: string; code_vrac: string; quantite_vrac: number | string };

function versChoix(ligne: ChoixBrut): ChoixCodeVrac {
  return {
    id: ligne.id,
    ligneId: ligne.programme_ligne_id,
    code: ligne.code,
    codeVrac: ligne.code_vrac,
    quantite: Number(ligne.quantite_vrac),
  };
}

function regrouper(lignes: ChoixCodeVrac[]): Map<string, ChoixCodeVrac[]> {
  const parLigneCode = new Map<string, ChoixCodeVrac[]>();
  for (const choix of lignes) {
    const cle = cleChoix(choix.ligneId, choix.code);
    const liste = parLigneCode.get(cle) ?? [];
    liste.push(choix);
    parLigneCode.set(cle, liste);
  }
  return parLigneCode;
}

// Les choix tels qu'ils sont ecrits dans la table (la table reste petite : une ligne par code vrac choisi), SANS la quantite calculee.
// tableAbsente = le script SQL n'a pas encore ete lance : la page se comporte alors comme avant (aucun choix, aucun blocage).
async function lireChoixBruts(): Promise<{ ok: true; choix: ChoixCodeVrac[] } | { ok: false; erreur: string; tableAbsente: boolean }> {
  const lignes: ChoixCodeVrac[] = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabaseServer
      .from("conditionnement_codes_vrac")
      .select("id, programme_ligne_id, code, code_vrac, quantite_vrac")
      .order("id", { ascending: true })
      .range(debut, debut + 999);
    if (error) return { ok: false, erreur: error.message, tableAbsente: erreurTableAbsente(error.message) };
    const page = (data ?? []) as ChoixBrut[];
    lignes.push(...page.map(versChoix));
    if (page.length < 1000) break;
  }
  return { ok: true, choix: lignes };
}

// Tous les choix, avec dans quantite les kg de vrac CONSOMMES (cartons produits x kg par carton, plafonnes au vrac fabrique : voir
// lib/vrac-consommation.ts). Si le calcul ne peut pas se faire (lecture en erreur), les choix sont rendus sans quantite calculee plutot que de
// faire tomber la page.
export async function lireTousLesChoix(): Promise<ResultatChoix> {
  const brut = await lireChoixBruts();
  if (!brut.ok) return brut;
  try {
    return { ok: true, parLigneCode: regrouper(await calculerQuantitesDesChoix(brut.choix)) };
  } catch {
    return { ok: true, parLigneCode: regrouper(brut.choix.map((c) => ({ ...c, quantite: 0 }))) };
  }
}

export async function lireChoixLigneCode(ligneId: number, code: string): Promise<ResultatChoix> {
  const { data, error } = await supabaseServer
    .from("conditionnement_codes_vrac")
    .select("id, programme_ligne_id, code, code_vrac, quantite_vrac")
    .eq("programme_ligne_id", ligneId)
    .eq("code", code)
    .order("id", { ascending: true });
  if (error) return { ok: false, erreur: error.message, tableAbsente: erreurTableAbsente(error.message) };
  return { ok: true, parLigneCode: regrouper(((data ?? []) as ChoixBrut[]).map(versChoix)) };
}

function decouper<T>(liste: T[], taille: number): T[][] {
  const lots: T[][] = [];
  for (let debut = 0; debut < liste.length; debut += taille) lots.push(liste.slice(debut, debut + taille));
  return lots;
}

// Lecture groupee : les paquets de valeurs sont lus EN PARALLELE (pages de 1000 lignes comprises)
async function lireParPaquetsEnParallele<T>(table: string, colonnes: string, colonneFiltre: string, valeurs: (number | string)[], taille = 100): Promise<T[]> {
  const parPaquet = await Promise.all(
    decouper([...new Set(valeurs)], taille).map(async (paquet) => {
      const lignes: T[] = [];
      for (let debut = 0; ; debut += 1000) {
        const { data, error } = await supabaseServer
          .from(table)
          .select(colonnes)
          .in(colonneFiltre, paquet)
          .order("id", { ascending: true })
          .range(debut, debut + 999);
        if (error) throw new Error(error.message);
        const page = (data ?? []) as T[];
        lignes.push(...page);
        if (page.length < 1000) break;
      }
      return lignes;
    })
  );
  return parPaquet.flat();
}

// Code sous lequel une entree de cartons compte pour sa ligne : son propre code ; une ancienne entree sans code (code vide) compte pour le
// code de la ligne quand elle n'en a qu'un (ou "-" quand elle n'en a aucun), sinon elle n'est rattachee a aucun code.
export function codeEffectifEntree(codeEntree: string | null, numeroLotLigne: string | null): string {
  const propre = (codeEntree ?? "").trim();
  if (propre) return propre;
  const codes = (numeroLotLigne ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  if (codes.length === 1) return codes[0];
  return codes.length === 0 ? "-" : "";
}

// Les kg de vrac consommes par chaque choix, calcules avec les cartons des lignes concernees et le vrac fabrique sur chaque code vrac choisi
async function calculerQuantitesDesChoix(choix: ChoixCodeVrac[]): Promise<ChoixCodeVrac[]> {
  if (choix.length === 0) return choix;
  const ligneIds = [...new Set(choix.map((c) => c.ligneId))];
  const codesVrac = [...new Set(choix.map((c) => c.codeVrac))];

  const [lignes, entreesCarton, entreesVrac] = await Promise.all([
    lireParPaquetsEnParallele<{ id: number; article_id: number | null; numero_lot: string | null }>("programme_lignes", "id, article_id, numero_lot", "id", ligneIds),
    lireParPaquetsEnParallele<{ programme_ligne_id: number; code: string | null; quantite: number | string | null }>(
      "production_carton_entries",
      "id, programme_ligne_id, code, quantite",
      "programme_ligne_id",
      ligneIds
    ),
    lireParPaquetsEnParallele<{ code: string | null; quantite: number | string | null }>("production_vrac_entries", "id, code, quantite", "code", codesVrac, 50),
  ]);
  const articleIds = lignes.map((l) => l.article_id).filter((id): id is number => id !== null);
  const articles = await lireParPaquetsEnParallele<ArticleInfo>("articles", "id, nom_article, vrac_article_id, contenance, piece_par_carton", "id", articleIds, 150);

  const articleParId = new Map(articles.map((a) => [a.id, a]));
  const ligneParId = new Map(lignes.map((l) => [l.id, l]));

  const cartonsParLigneCode = new Map<string, DemandeLigneCode>();
  for (const entree of entreesCarton) {
    const ligne = ligneParId.get(entree.programme_ligne_id);
    const code = codeEffectifEntree(entree.code, ligne?.numero_lot ?? null);
    if (!code) continue;
    const cle = `${entree.programme_ligne_id}::${code}`;
    const existante = cartonsParLigneCode.get(cle) ?? {
      ligneId: entree.programme_ligne_id,
      code,
      cartons: 0,
      kgParCarton: kgParCarton(ligne?.article_id ? articleParId.get(ligne.article_id) : undefined),
    };
    existante.cartons += Number(entree.quantite ?? 0);
    cartonsParLigneCode.set(cle, existante);
  }

  const fabriqueParCodeVrac = new Map<string, number>();
  for (const entree of entreesVrac) {
    const code = (entree.code ?? "").trim();
    if (code) fabriqueParCodeVrac.set(code, (fabriqueParCodeVrac.get(code) ?? 0) + Number(entree.quantite ?? 0));
  }

  const resultat = calculerConsommationVrac({
    choix: choix.map((c) => ({ id: c.id, ligneId: c.ligneId, code: c.code, codeVrac: c.codeVrac })),
    demandes: [...cartonsParLigneCode.values()],
    fabriqueParCodeVrac,
  });
  return choix.map((c) => ({ ...c, quantite: resultat.parChoix.get(c.id) ?? 0 }));
}

async function lirePar<T>(table: string, colonnes: string, ligneIds: number[]): Promise<T[]> {
  const lignes: T[] = [];
  for (const ids of decouper(ligneIds, 100)) {
    for (let debut = 0; ; debut += 1000) {
      const { data, error } = await supabaseServer
        .from(table)
        .select(colonnes)
        .in("programme_ligne_id", ids)
        .order("id", { ascending: true })
        .range(debut, debut + 999);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as T[];
      lignes.push(...page);
      if (page.length < 1000) break;
    }
  }
  return lignes;
}

export type ArticleInfo = {
  id: number;
  nom_article: string | null;
  vrac_article_id: number | null;
  contenance: number | null;
  piece_par_carton: number | null;
};

export function kgParCarton(article: ArticleInfo | undefined): number {
  const contenance = Number(article?.contenance ?? 0);
  const pieces = Number(article?.piece_par_carton ?? 0);
  return contenance > 0 && pieces > 0 ? contenance * pieces : 0;
}

export type CodesVracPrets =
  | { ok: true; codes: CodeVracDisponible[]; vracNom: string | null; kgParCarton: number }
  | { ok: false; message: string };

// Les codes vrac que cette ligne peut conditionner : ceux du VRAC de son article (ex : LAIT WHITE SECRET 200 ml -> "vrac lait white secret", donc
// aussi les codes fabriques pour le 300 ml et le 500 ml) dont la Fabrication est deja ENTREE, avec le Test labo fait et sans statut "A recuperer"
// / "A detruire", et qui ont encore du vrac. Le reste de chaque code = vrac fabrique (entrees Fabrication, recuperations comprises) - vrac DEJA
// CONSOMME par les cartons produits (cartons x contenance x pieces par carton, plafonne au vrac fabrique : lib/vrac-consommation.ts). Un code
// dont le Conditionnement est termine (Fin programme) reste propose tant qu'il a du vrac : une nouvelle ligne peut le conditionner (autre
// contenance en urgence), ses cartons retirent alors le vrac qui reste.
export async function lireCodesVracPrets(ligneId: number): Promise<CodesVracPrets> {
  const { data: ligneData, error: ligneErreur } = await supabaseServer
    .from("programme_lignes")
    .select("id, article_id")
    .eq("id", ligneId)
    .maybeSingle();
  if (ligneErreur) return { ok: false, message: ligneErreur.message };
  const ligne = ligneData as { id: number; article_id: number | null } | null;
  if (!ligne) return { ok: false, message: "Ligne introuvable (page pas a jour, recharge-la)." };
  if (!ligne.article_id) return { ok: false, message: "Cette ligne n'a pas d'article : impossible de savoir quel vrac utiliser." };

  const { data: articleData, error: articleErreur } = await supabaseServer
    .from("articles")
    .select("id, nom_article, vrac_article_id, contenance, piece_par_carton")
    .eq("id", ligne.article_id)
    .maybeSingle();
  if (articleErreur) return { ok: false, message: articleErreur.message };
  const article = articleData as ArticleInfo | null;
  if (!article?.vrac_article_id) {
    return { ok: false, message: `L'article ${article?.nom_article ?? ""} n'a pas de vrac associe (fiche article).`.replace("  ", " ") };
  }
  const vracArticleId = article.vrac_article_id;

  const [{ data: vracArticleData }, { data: articlesVracData, error: articlesErreur }] = await Promise.all([
    supabaseServer.from("articles").select("id, nom_article").eq("id", vracArticleId).maybeSingle(),
    supabaseServer
      .from("articles")
      .select("id, nom_article, vrac_article_id, contenance, piece_par_carton")
      .eq("vrac_article_id", vracArticleId),
  ]);
  if (articlesErreur) return { ok: false, message: articlesErreur.message };
  const articlesDuVrac = (articlesVracData ?? []) as ArticleInfo[];
  const articleParId = new Map(articlesDuVrac.map((a) => [a.id, a]));
  const vracNom = (vracArticleData as { nom_article: string } | null)?.nom_article ?? null;

  // Les lignes de programme de tous les articles qui partagent ce vrac
  const lignesDuVrac: { id: number; article_id: number; numero_lot: string | null }[] = [];
  for (const ids of decouper(articlesDuVrac.map((a) => a.id), 50)) {
    for (let debut = 0; ; debut += 1000) {
      const { data, error } = await supabaseServer
        .from("programme_lignes")
        .select("id, article_id, numero_lot")
        .in("article_id", ids)
        .order("id", { ascending: false })
        .range(debut, debut + 999);
      if (error) return { ok: false, message: error.message };
      const page = (data ?? []) as typeof lignesDuVrac;
      lignesDuVrac.push(...page);
      if (page.length < 1000 || lignesDuVrac.length >= 4000) break;
    }
  }
  const ligneIds = lignesDuVrac.map((l) => l.id);
  if (ligneIds.length === 0) return { ok: true, codes: [], vracNom, kgParCarton: kgParCarton(article) };
  const articleDeLigne = new Map(lignesDuVrac.map((l) => [l.id, articleParId.get(l.article_id)]));

  let entreesVrac: { programme_ligne_id: number; code: string | null; quantite: number | string | null; date_jour: string | null }[];
  let entreesCarton: { programme_ligne_id: number; code: string | null; quantite: number | string | null }[];
  let rapports: { programme_ligne_id: number; code: string | null; utilisateur_test_labo: string | null; disposition_qualite: string | null }[];
  let termines: { programme_ligne_id: number; code: string | null; stage: string | null }[];
  try {
    [entreesVrac, entreesCarton, rapports, termines] = await Promise.all([
      lirePar<(typeof entreesVrac)[number]>("production_vrac_entries", "id, programme_ligne_id, code, quantite, date_jour", ligneIds),
      lirePar<(typeof entreesCarton)[number]>("production_carton_entries", "id, programme_ligne_id, code, quantite", ligneIds),
      lirePar<(typeof rapports)[number]>("production_rapports", "id, programme_ligne_id, code, utilisateur_test_labo, disposition_qualite", ligneIds),
      lirePar<(typeof termines)[number]>("production_code_termine", "id, programme_ligne_id, code, stage", ligneIds),
    ]);
  } catch (erreur) {
    return { ok: false, message: erreur instanceof Error ? erreur.message : "Lecture impossible." };
  }

  const tousLesChoix = await lireChoixBruts();
  if (!tousLesChoix.ok) {
    return {
      ok: false,
      message: tousLesChoix.tableAbsente
        ? "Le script SQL create_conditionnement_codes_vrac.sql n'a pas encore ete lance dans Supabase."
        : tousLesChoix.erreur,
    };
  }
  const ligneIdsDuVrac = new Set(ligneIds);
  const choixDuVrac = tousLesChoix.choix.filter((c) => ligneIdsDuVrac.has(c.ligneId));

  type Suivi = { fabrique: number; derniereDate: string | null; testLabo: boolean; bloque: boolean };
  const parCode = new Map<string, Suivi>();
  const suivi = (code: string) => {
    let s = parCode.get(code);
    if (!s) { s = { fabrique: 0, derniereDate: null, testLabo: false, bloque: false }; parCode.set(code, s); }
    return s;
  };

  for (const entree of entreesVrac) {
    const code = (entree.code ?? "").trim();
    if (!code) continue;
    const s = suivi(code);
    s.fabrique += Number(entree.quantite ?? 0);
    const date = entree.date_jour ? String(entree.date_jour).slice(0, 10) : null;
    if (date && (!s.derniereDate || date > s.derniereDate)) s.derniereDate = date;
  }
  for (const rapport of rapports) {
    const code = (rapport.code ?? "").trim();
    if (!code || !parCode.has(code)) continue;
    const s = suivi(code);
    if ((rapport.utilisateur_test_labo ?? "").trim()) s.testLabo = true;
    if (rapport.disposition_qualite && BLOCAGES_QUALITE.has(rapport.disposition_qualite)) s.bloque = true;
  }

  // Vrac consomme par code : cartons produits x kg par carton sur chaque ligne (les choix de code vrac, et pour une ligne SANS choix son propre
  // code comme avant), plafonne au vrac fabrique - voir lib/vrac-consommation.ts
  const numeroLotDeLigne = new Map(lignesDuVrac.map((l) => [l.id, l.numero_lot]));
  const demandes = new Map<string, DemandeLigneCode>();
  for (const entree of entreesCarton) {
    const code = codeEffectifEntree(entree.code, numeroLotDeLigne.get(entree.programme_ligne_id) ?? null);
    if (!code) continue;
    const cle = cleChoix(entree.programme_ligne_id, code);
    const existante = demandes.get(cle) ?? {
      ligneId: entree.programme_ligne_id,
      code,
      cartons: 0,
      kgParCarton: kgParCarton(articleDeLigne.get(entree.programme_ligne_id)),
    };
    existante.cartons += Number(entree.quantite ?? 0);
    demandes.set(cle, existante);
  }
  const consommation = calculerConsommationVrac({
    choix: choixDuVrac.map((c) => ({ id: c.id, ligneId: c.ligneId, code: c.code, codeVrac: c.codeVrac })),
    demandes: [...demandes.values()],
    fabriqueParCodeVrac: new Map([...parCode].map(([code, s]) => [code, s.fabrique])),
  });

  // Code dont le Conditionnement est TERMINE ("Fin programme") sur toutes les lignes ou il est le code du programme
  const lignesParCode = new Map<string, number[]>();
  for (const l of lignesDuVrac) {
    for (const code of (l.numero_lot ?? "").split(",").map((c) => c.trim()).filter(Boolean)) {
      lignesParCode.set(code, [...(lignesParCode.get(code) ?? []), l.id]);
    }
  }
  const cartonTermine = new Set(termines.filter((t) => t.stage === "carton").map((t) => cleChoix(t.programme_ligne_id, (t.code ?? "").trim())));
  const codeClos = (code: string) => {
    const lignesDuCode = lignesParCode.get(code) ?? [];
    return lignesDuCode.length > 0 && lignesDuCode.every((id) => cartonTermine.has(cleChoix(id, code)));
  };

  // Un code est propose tant qu'il reste de quoi faire au moins un carton de cette ligne ET au moins 5 % de ce qui a ete fabrique : en dessous,
  // ce sont les pertes habituelles d'un lot deja conditionne (sinon des centaines de vieux codes avec quelques kg seraient proposes). Un code
  // termine (Fin programme) reste propose tant qu'il a du vrac : voir plus haut.
  const seuilCarton = Math.max(kgParCarton(article), 1);
  const codes: CodeVracDisponible[] = [];
  for (const [code, s] of parCode) {
    if (s.fabrique <= 0 || !s.testLabo || s.bloque) continue;
    const disponible = arrondi3(s.fabrique - (consommation.parCodeVrac.get(code)?.consomme ?? 0));
    if (disponible < seuilCarton || disponible < s.fabrique * 0.05) continue;
    codes.push({ code, disponible, fabrique: arrondi3(s.fabrique), derniereDate: s.derniereDate, clos: codeClos(code) });
  }
  // Les codes en cours d'abord (du plus recent au plus ancien), puis les codes dont le Conditionnement est termine
  codes.sort(
    (a, b) =>
      Number(a.clos) - Number(b.clos) ||
      (b.derniereDate ?? "").localeCompare(a.derniereDate ?? "") ||
      a.code.localeCompare(b.code)
  );

  return { ok: true, codes, vracNom, kgParCarton: kgParCarton(article) };
}

// Surplus de cartons tolere : au-dela du vrac des codes choisis, une ligne peut produire au plus ce nombre de cartons en plus (pertes, ecarts de
// pesee). Plus que ca : la saisie est refusee, le vrac est insuffisant.
export const SURPLUS_MAX_CARTONS = 15;

// Controle du Conditionnement : ajouter cartonsAjoutes cartons sur (ligne, code) est-il possible avec le vrac des codes choisis ? Renvoie le
// message de refus (le vrac est insuffisant) ou null. Tient compte de TOUT ce qui est deja consomme sur ces codes (autres lignes, autres
// fournees, ancien fonctionnement) et du surplus deja saisi sur cette ligne : le surplus total ne depasse jamais SURPLUS_MAX_CARTONS. Pas de
// controle quand la ligne n'a pas de code vrac choisi (ancien fonctionnement) ou quand le calcul ne peut pas se faire (lecture en erreur).
export async function messageSiVracInsuffisant(ligneId: number, code: string, cartonsAjoutes: number): Promise<string | null> {
  if (!(cartonsAjoutes > 0) || !code) return null;
  try {
    const choixLigne = await lireChoixLigneCode(ligneId, code);
    if (!choixLigne.ok) return null;
    const choixDeLaLigne = choixLigne.parLigneCode.get(cleChoix(ligneId, code)) ?? [];
    if (choixDeLaLigne.length === 0) return null;

    // Tous les choix qui touchent ces codes vrac, et les autres codes vrac de ces memes lignes (une ligne a plusieurs codes les remplit dans l'ordre)
    const codesVrac = new Set(choixDeLaLigne.map((c) => c.codeVrac));
    const choixConnus = new Map<number, ChoixCodeVrac>(choixDeLaLigne.map((c) => [c.id, c]));
    for (let tour = 0; tour < 4; tour++) {
      const avant = choixConnus.size;
      const parCode = await lireParPaquetsEnParallele<ChoixBrut>(
        "conditionnement_codes_vrac",
        "id, programme_ligne_id, code, code_vrac, quantite_vrac",
        "code_vrac",
        [...codesVrac],
        50
      );
      const lignesTouchees = [...new Set([ligneId, ...parCode.map((c) => c.programme_ligne_id)])];
      const parLigne = await lireParPaquetsEnParallele<ChoixBrut>(
        "conditionnement_codes_vrac",
        "id, programme_ligne_id, code, code_vrac, quantite_vrac",
        "programme_ligne_id",
        lignesTouchees
      );
      for (const brut of [...parCode, ...parLigne]) {
        const unChoix = versChoix(brut);
        choixConnus.set(unChoix.id, unChoix);
        codesVrac.add(unChoix.codeVrac);
      }
      if (choixConnus.size === avant) break;
    }
    const tousLesChoix = [...choixConnus.values()];

    // Lignes de l'ancien fonctionnement (sans choix) qui consomment leur propre code : celles dont le numero de lot contient un de ces codes
    const lignesAncien = new Map<number, { id: number; article_id: number | null; numero_lot: string | null }>();
    for (const codeVrac of codesVrac) {
      const { data } = await supabaseServer.from("programme_lignes").select("id, article_id, numero_lot").ilike("numero_lot", `%${codeVrac}%`);
      for (const l of (data ?? []) as { id: number; article_id: number | null; numero_lot: string | null }[]) lignesAncien.set(l.id, l);
    }
    const ligneIds = [...new Set([ligneId, ...tousLesChoix.map((c) => c.ligneId), ...lignesAncien.keys()])];

    const [lignes, entreesCarton, entreesVrac] = await Promise.all([
      lireParPaquetsEnParallele<{ id: number; article_id: number | null; numero_lot: string | null }>("programme_lignes", "id, article_id, numero_lot", "id", ligneIds),
      lireParPaquetsEnParallele<{ programme_ligne_id: number; code: string | null; quantite: number | string | null }>(
        "production_carton_entries",
        "id, programme_ligne_id, code, quantite",
        "programme_ligne_id",
        ligneIds
      ),
      lireParPaquetsEnParallele<{ code: string | null; quantite: number | string | null }>("production_vrac_entries", "id, code, quantite", "code", [...codesVrac], 50),
    ]);
    const articles = await lireParPaquetsEnParallele<ArticleInfo>(
      "articles",
      "id, nom_article, vrac_article_id, contenance, piece_par_carton",
      "id",
      lignes.map((l) => l.article_id).filter((id): id is number => id !== null),
      150
    );
    const articleParId = new Map(articles.map((a) => [a.id, a]));
    const ligneParId = new Map(lignes.map((l) => [l.id, l]));
    const kgCarton = (id: number) => {
      const articleId = ligneParId.get(id)?.article_id;
      return kgParCarton(articleId ? articleParId.get(articleId) : undefined);
    };
    const kgParCartonLigne = kgCarton(ligneId);
    if (!(kgParCartonLigne > 0)) return null;

    const demandes = new Map<string, DemandeLigneCode>();
    for (const entree of entreesCarton) {
      const codeEntree = codeEffectifEntree(entree.code, ligneParId.get(entree.programme_ligne_id)?.numero_lot ?? null);
      if (!codeEntree) continue;
      const cle = cleChoix(entree.programme_ligne_id, codeEntree);
      const existante = demandes.get(cle) ?? { ligneId: entree.programme_ligne_id, code: codeEntree, cartons: 0, kgParCarton: kgCarton(entree.programme_ligne_id) };
      existante.cartons += Number(entree.quantite ?? 0);
      demandes.set(cle, existante);
    }
    const fabriqueParCodeVrac = new Map<string, number>();
    for (const entree of entreesVrac) {
      const codeVrac = (entree.code ?? "").trim();
      if (codeVrac) fabriqueParCodeVrac.set(codeVrac, (fabriqueParCodeVrac.get(codeVrac) ?? 0) + Number(entree.quantite ?? 0));
    }
    const choixMoteur = tousLesChoix.map((c) => ({ id: c.id, ligneId: c.ligneId, code: c.code, codeVrac: c.codeVrac }));

    const avantSaisie = calculerConsommationVrac({ choix: choixMoteur, demandes: [...demandes.values()], fabriqueParCodeVrac });
    const cleCible = cleChoix(ligneId, code);
    const avecSaisie = new Map(demandes);
    const demandeCible = demandes.get(cleCible) ?? { ligneId, code, cartons: 0, kgParCarton: kgParCartonLigne };
    avecSaisie.set(cleCible, { ...demandeCible, cartons: demandeCible.cartons + cartonsAjoutes });
    const apresSaisie = calculerConsommationVrac({ choix: choixMoteur, demandes: [...avecSaisie.values()], fabriqueParCodeVrac });

    const surplusCartons = (apresSaisie.exces.get(cleCible) ?? 0) / kgParCartonLigne;
    if (surplusCartons <= SURPLUS_MAX_CARTONS + 1e-6) return null;

    const codesDeLaLigne = [...new Set(choixDeLaLigne.map((c) => c.codeVrac))];
    const resteKg = codesDeLaLigne.reduce((somme, codeVrac) => somme + (avantSaisie.parCodeVrac.get(codeVrac)?.reste ?? 0), 0);
    const cartonsPossibles = Math.max(0, Math.floor(resteKg / kgParCartonLigne + 1e-9));
    const formater = (valeur: number) => valeur.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
    return (
      `Pas possible avec ce vrac : le vrac est insuffisant. Il reste ${formater(resteKg)} kg sur ${codesDeLaLigne.join(", ")} (environ ${formater(cartonsPossibles)} cartons) ` +
      `et tu veux ajouter ${formater(cartonsAjoutes)} cartons : au-dela du vrac, le surplus maximum est de ${SURPLUS_MAX_CARTONS} cartons (ici ${formater(Math.round(surplusCartons * 100) / 100)}).`
    );
  } catch {
    return null;
  }
}

// Pour le controle du Conditionnement : parmi ces codes vrac, lesquels sont maintenant marques "A recuperer" / "A detruire" au Test labo
// (le statut peut changer apres le choix).
export async function codesVracBloquesParQualite(codes: string[]): Promise<string[]> {
  if (codes.length === 0) return [];
  const bloques = new Set<string>();
  for (const lot of decouper([...new Set(codes)], 50)) {
    const { data } = await supabaseServer
      .from("production_rapports")
      .select("code, disposition_qualite")
      .in("code", lot)
      .in("disposition_qualite", [...BLOCAGES_QUALITE]);
    for (const ligne of (data ?? []) as { code: string }[]) bloques.add(ligne.code);
  }
  return [...bloques];
}
