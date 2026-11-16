import { supabaseServer } from "@/lib/supabase-server";

// Dashboard > Conditionnement : la colonne N Lot est vide au depart, la personne choisit le ou les CODES VRAC qu'elle conditionne sur la
// ligne (avec la quantite de vrac prise sur chaque code). Ici : lecture des choix, calcul des codes vrac DISPONIBLES pour une ligne,
// regles de controle. Table : conditionnement_codes_vrac (scripts/sql/create_conditionnement_codes_vrac.sql).

export type ChoixCodeVrac = { id: number; ligneId: number; code: string; codeVrac: string; quantite: number };

export type CodeVracDisponible = {
  code: string;
  // ce qu'il reste a conditionner : vrac fabrique - quantites deja choisies - cartons deja conditionnes sous son propre code
  disponible: number;
  fabrique: number;
  derniereDate: string | null;
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

// Tous les choix (la table reste petite : une ligne par code vrac choisi). tableAbsente = le script SQL n'a pas encore ete lance : la
// page se comporte alors comme avant (aucun choix, aucun blocage).
export async function lireTousLesChoix(): Promise<ResultatChoix> {
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
  return { ok: true, parLigneCode: regrouper(lignes) };
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

type ArticleInfo = {
  id: number;
  nom_article: string | null;
  vrac_article_id: number | null;
  contenance: number | null;
  piece_par_carton: number | null;
};

function kgParCarton(article: ArticleInfo | undefined): number {
  const contenance = Number(article?.contenance ?? 0);
  const pieces = Number(article?.piece_par_carton ?? 0);
  return contenance > 0 && pieces > 0 ? contenance * pieces : 0;
}

export type CodesVracPrets =
  | { ok: true; codes: CodeVracDisponible[]; vracNom: string | null; kgParCarton: number }
  | { ok: false; message: string };

// Les codes vrac que cette ligne peut conditionner : ceux du VRAC de son article (ex : LAIT WHITE SECRET 200 ml -> "vrac lait white secret", donc
// aussi les codes fabriques pour le 300 ml et le 500 ml) dont la Fabrication est deja ENTREE, avec le Test labo fait et sans statut "A recuperer"
// / "A detruire", et qui ont encore du vrac. Le reste de chaque code = vrac fabrique (entrees Fabrication, recuperations comprises) - quantites
// deja choisies sur une ligne - cartons deja conditionnes sous son propre code par une ligne qui n'a PAS fait de choix (ancien fonctionnement :
// carton x contenance x pieces par carton).
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

  const tousLesChoix = await lireTousLesChoix();
  if (!tousLesChoix.ok) {
    return {
      ok: false,
      message: tousLesChoix.tableAbsente
        ? "Le script SQL create_conditionnement_codes_vrac.sql n'a pas encore ete lance dans Supabase."
        : tousLesChoix.erreur,
    };
  }
  const choixPlats = [...tousLesChoix.parLigneCode.values()].flat();
  const lignesAvecChoix = new Set(choixPlats.map((c) => cleChoix(c.ligneId, c.code)));

  type Suivi = { fabrique: number; choisi: number; ancien: number; derniereDate: string | null; testLabo: boolean; bloque: boolean };
  const parCode = new Map<string, Suivi>();
  const suivi = (code: string) => {
    let s = parCode.get(code);
    if (!s) { s = { fabrique: 0, choisi: 0, ancien: 0, derniereDate: null, testLabo: false, bloque: false }; parCode.set(code, s); }
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
  for (const choix of choixPlats) {
    if (parCode.has(choix.codeVrac)) suivi(choix.codeVrac).choisi += choix.quantite;
  }
  // Ancien fonctionnement : cartons deja conditionnes sous le code de la ligne (sans choix de code vrac) = vrac deja consomme
  for (const entree of entreesCarton) {
    const code = (entree.code ?? "").trim();
    if (!code || !parCode.has(code)) continue;
    if (lignesAvecChoix.has(cleChoix(entree.programme_ligne_id, code))) continue;
    suivi(code).ancien += Number(entree.quantite ?? 0) * kgParCarton(articleDeLigne.get(entree.programme_ligne_id));
  }

  // Code dont le Conditionnement est TERMINE ("Fin programme") sur toutes les lignes ou il est le code du programme : ce qui reste est clos
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
  // ce sont les pertes habituelles d'un lot deja conditionne (sinon des centaines de vieux codes avec quelques kg seraient proposes).
  const seuilCarton = Math.max(kgParCarton(article), 1);
  const codes: CodeVracDisponible[] = [];
  for (const [code, s] of parCode) {
    if (s.fabrique <= 0 || !s.testLabo || s.bloque || codeClos(code)) continue;
    const disponible = arrondi3(s.fabrique - s.choisi - s.ancien);
    if (disponible < seuilCarton || disponible < s.fabrique * 0.05) continue;
    codes.push({ code, disponible, fabrique: arrondi3(s.fabrique), derniereDate: s.derniereDate });
  }
  codes.sort((a, b) => (b.derniereDate ?? "").localeCompare(a.derniereDate ?? "") || a.code.localeCompare(b.code));

  return { ok: true, codes, vracNom, kgParCarton: kgParCarton(article) };
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
