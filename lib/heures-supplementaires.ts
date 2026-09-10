import { supabaseServer } from "@/lib/supabase-server";
import { fetchAllRowsParallel } from "@/lib/fetch-all-rows-parallel";
import { hhmmDiffMinutes, ddmmHhmmToInterval } from "@/lib/suivi-tirage-time";

// Regle actee avec l'utilisateur (demande explicite) : par FOURNEE/rapport
// individuel (pas par jour cumule) - une chaine qui fait 2 equipes le meme
// jour (ex: 8h-16h puis 16h-22h) apparait deja comme 2 fournees SEPAREES en
// base (chacune avec son propre horaire et son propre nb_journaliers), donc
// chacune reste sous les 8h de base et n'a pas besoin d'etre "detectee"
// comme un cas special - seule une fournee dont la DUREE PROPRE depasse 8h
// (peu importe l'heure de debut, ex: 6h-15h = 1h sup) genere des heures sup.
// Le samedi est un cas a part : TOUTE la duree d'une fournee ce jour-la est
// "jour sup", jamais decoupee en normal/sup comme en semaine.
const NORMAL_MINUTES_PAR_FOURNEE = 8 * 60;

export type SourceEtape = "fabrication" | "conditionnement" | "emballage" | "manuel";

export const SOURCE_LABELS: Record<SourceEtape, string> = {
  fabrication: "Fabrication",
  conditionnement: "Conditionnement",
  emballage: "Emballage",
  manuel: "Manuel (saisie libre)",
};

export type BlocHeuresSup = {
  source: SourceEtape;
  chaine: string;
  code: string;
  typeArticle: string | null;
  dateJour: string;
  debutLabel: string;
  finLabel: string;
  nbPersonnes: number;
  dureeMinutes: number;
  estSamedi: boolean;
  normalesMinutes: number;
  supMinutes: number;
  joursSupMinutes: number;
};

function classerDuree(dureeMinutes: number, estSamedi: boolean) {
  if (estSamedi) {
    return { normalesMinutes: 0, supMinutes: 0, joursSupMinutes: dureeMinutes };
  }
  return {
    normalesMinutes: Math.min(dureeMinutes, NORMAL_MINUTES_PAR_FOURNEE),
    supMinutes: Math.max(0, dureeMinutes - NORMAL_MINUTES_PAR_FOURNEE),
    joursSupMinutes: 0,
  };
}

// Une preparation Fabrication peut s'etaler sur plusieurs jours calendaires
// (ex: debut vendredi 14h20, vidange dimanche 10h18 - vrai cas trouve en
// donnees) - ca ne veut jamais dire que quelqu'un a travaille sans dormir
// pendant 44h. Demande explicite de l'utilisateur : "il faut prendre que le
// jour c'est 8h, le reste c'est dormir" - decoupe donc l'intervalle en
// tranches par jour calendaire, et chaque jour touche ne compte JAMAIS plus
// de 8h (le reste de ce jour-la est ignore, ni normal ni sup - personne n'a
// travaille 16h+ d'affilee).
//
// Un samedi simplement TRAVERSE par cet etalement (les autres chaines/
// machines ne tournent pas ce jour-la) n'est PAS compte comme du jour sup -
// demande explicite suite au 1er correctif : "si les autres chaine et
// machine ne fonctionnent pas samedi... il ne faut pas compter qu'on a
// travaille le samedi" juste parce que la date tombe dans la fenetre d'une
// longue macceration/attente labo. Ce jour-la est simplement ignore (ni
// normal ni jour sup), comme la nuit. Seule une VRAIE fournee tenant sur
// UN SEUL jour tombant un samedi (classerDuree ci-dessus - Fabrication,
// Conditionnement ou Emballage) reste comptee en jour sup, puisque la
// preuve directe (heure de debut/fin saisie CE jour-la) montre que
// quelqu'un est reellement venu travailler.
function classerFabricationMultiJours(startMs: number, endMs: number) {
  let normalesMinutes = 0;

  const cursor = new Date(startMs);
  cursor.setHours(0, 0, 0, 0);

  while (cursor.getTime() < endMs) {
    const jourDebutMs = cursor.getTime();
    const estSamediCeJour = cursor.getDay() === 6;
    cursor.setDate(cursor.getDate() + 1);
    const jourFinMs = cursor.getTime();

    const segStart = Math.max(startMs, jourDebutMs);
    const segEnd = Math.min(endMs, jourFinMs);
    if (segEnd <= segStart) continue;
    if (estSamediCeJour) continue;

    const segMinutes = Math.round((segEnd - segStart) / 60000);
    normalesMinutes += Math.min(segMinutes, NORMAL_MINUTES_PAR_FOURNEE);
  }

  return { normalesMinutes, supMinutes: 0, joursSupMinutes: 0 };
}

// Une ligne saisie dans Heures Sup Manuel (activites hors suivi automatique
// - Sleevage, Impression, Recuperation...) EST du supplementaire par
// definition (demande explicite, voir app/production/heures-sup-manuel) -
// jamais de part "normale" a en retirer comme pour une vraie fournee.
function classerManuel(dureeMinutes: number, estSamedi: boolean) {
  if (estSamedi) {
    return { normalesMinutes: 0, supMinutes: 0, joursSupMinutes: dureeMinutes };
  }
  return { normalesMinutes: 0, supMinutes: dureeMinutes, joursSupMinutes: 0 };
}

type CartonRow = {
  code: string;
  programme_ligne_id: number | null;
  date_jour: string;
  chaine: string | null;
  temps_demarage_lot: string | null;
  temps_arret_batch: string | null;
  nb_journaliers_conditionnement: number | null;
};

type EmballageRow = {
  code: string;
  programme_ligne_id: number | null;
  date_jour: string;
  emballage_machine: string | null;
  emballage_temps_demarrer: string | null;
  emballage_temps_arret: string | null;
  nb_journaliers_emballage: number | null;
};

type RapportRow = {
  code: string;
  programme_ligne_id: number | null;
  machine: string | null;
  temps_debut_preparation: string | null;
  temps_vidange: string | null;
  nb_journaliers_fabrication: number | null;
  date_fabrication_conditionnement: string | null;
};

type ActiviteRow = { id: number; nom: string };
type ManuelRow = {
  date_jour: string;
  nb_journaliers: number;
  nb_heures: number;
  heures_sup_activites: ActiviteRow | ActiviteRow[] | null;
};

function nomActivite(value: ActiviteRow | ActiviteRow[] | null): string {
  const row = Array.isArray(value) ? (value[0] ?? null) : value;
  return row?.nom || "-";
}

export async function fetchBlocsHeuresSup(periode: {
  dateFrom: string;
  dateTo: string;
}): Promise<BlocHeuresSup[]> {
  const [cartonRows, emballageRows, rapportRows, manuelRows] = await Promise.all([
    fetchAllRowsParallel<CartonRow>(
      () =>
        supabaseServer
          .from("production_carton_entries")
          .select("id", { count: "exact", head: true })
          .gte("date_jour", periode.dateFrom)
          .lte("date_jour", periode.dateTo),
      (from, to) =>
        supabaseServer
          .from("production_carton_entries")
          .select(
            "code, programme_ligne_id, date_jour, chaine, temps_demarage_lot, temps_arret_batch, nb_journaliers_conditionnement"
          )
          .gte("date_jour", periode.dateFrom)
          .lte("date_jour", periode.dateTo)
          .order("date_jour", { ascending: true })
          .range(from, to)
    ),
    fetchAllRowsParallel<EmballageRow>(
      () =>
        supabaseServer
          .from("production_emballage_entries")
          .select("id", { count: "exact", head: true })
          .gte("date_jour", periode.dateFrom)
          .lte("date_jour", periode.dateTo),
      (from, to) =>
        supabaseServer
          .from("production_emballage_entries")
          .select(
            "code, programme_ligne_id, date_jour, emballage_machine, emballage_temps_demarrer, emballage_temps_arret, nb_journaliers_emballage"
          )
          .gte("date_jour", periode.dateFrom)
          .lte("date_jour", periode.dateTo)
          .order("date_jour", { ascending: true })
          .range(from, to)
    ),
    // date_fabrication_conditionnement sert deja d'ancre pour interpreter
    // temps_debut_preparation/temps_vidange (format "JJ/MM HH:MM" sans annee)
    // partout ailleurs dans le moteur de cout (lib/cout-production-reel.ts) -
    // meme convention reprise ici pour filtrer la periode et determiner le
    // vrai jour calendaire (donc si c'est un samedi).
    fetchAllRowsParallel<RapportRow>(
      () =>
        supabaseServer
          .from("production_rapports")
          .select("id", { count: "exact", head: true })
          .gte("date_fabrication_conditionnement", periode.dateFrom)
          .lte("date_fabrication_conditionnement", periode.dateTo),
      (from, to) =>
        supabaseServer
          .from("production_rapports")
          .select(
            "code, programme_ligne_id, machine, temps_debut_preparation, temps_vidange, nb_journaliers_fabrication, date_fabrication_conditionnement"
          )
          .gte("date_fabrication_conditionnement", periode.dateFrom)
          .lte("date_fabrication_conditionnement", periode.dateTo)
          .order("date_fabrication_conditionnement", { ascending: true })
          .range(from, to)
    ),
    // Heures Sup Manuel (app/production/heures-sup-manuel) : demande explicite
    // de fusionner ces lignes dans ce meme rapport, plutot que de les laisser
    // separees.
    fetchAllRowsParallel<ManuelRow>(
      () =>
        supabaseServer
          .from("heures_sup_manuel")
          .select("id", { count: "exact", head: true })
          .gte("date_jour", periode.dateFrom)
          .lte("date_jour", periode.dateTo),
      (from, to) =>
        supabaseServer
          .from("heures_sup_manuel")
          .select("date_jour, nb_journaliers, nb_heures, heures_sup_activites(id, nom)")
          .gte("date_jour", periode.dateFrom)
          .lte("date_jour", periode.dateTo)
          .order("date_jour", { ascending: true })
          .range(from, to)
    ),
  ]);

  // Type de produit (clarifiant, gel douche, hydratant...) affiche a cote du
  // code pour clarifier de quel article il s'agit. Le code texte seul
  // (production_carton_entries.code etc.) NE PEUT PAS servir de cle vers
  // articles.code_auto/code_manu : ce sont des codes de PRODUCTION incrementes
  // a chaque nouveau lot (voir lib/article-code-family.ts), alors que
  // articles.code_auto/code_manu ne garde que le code courant/le plus recent
  // - verifie sur donnees reelles, a peine 10% des codes historiques
  // matchaient encore. Le vrai lien stable est programme_ligne_id ->
  // programme_lignes.article_id -> articles.type_article.
  const ligneIds = [
    ...new Set(
      [...cartonRows, ...emballageRows, ...rapportRows]
        .map((r) => r.programme_ligne_id)
        .filter((id): id is number => id != null)
    ),
  ];
  const articleIdParLigneId = new Map<number, number>();
  for (let i = 0; i < ligneIds.length; i += 1000) {
    const chunk = ligneIds.slice(i, i + 1000);
    const { data } = await supabaseServer.from("programme_lignes").select("id, article_id").in("id", chunk);
    for (const row of (data ?? []) as { id: number; article_id: number | null }[]) {
      if (row.article_id != null) articleIdParLigneId.set(row.id, row.article_id);
    }
  }
  const articleIds = [...new Set(articleIdParLigneId.values())];
  const typeArticleParArticleId = new Map<number, string | null>();
  for (let i = 0; i < articleIds.length; i += 1000) {
    const chunk = articleIds.slice(i, i + 1000);
    const { data } = await supabaseServer.from("articles").select("id, type_article").in("id", chunk);
    for (const row of (data ?? []) as { id: number; type_article: string | null }[]) {
      typeArticleParArticleId.set(row.id, row.type_article);
    }
  }
  function resolveTypeArticle(ligneId: number | null): string | null {
    if (ligneId == null) return null;
    const articleId = articleIdParLigneId.get(ligneId);
    if (articleId == null) return null;
    return typeArticleParArticleId.get(articleId) ?? null;
  }

  const blocs: BlocHeuresSup[] = [];

  for (const row of cartonRows) {
    if (!row.temps_demarage_lot || !row.temps_arret_batch || !row.nb_journaliers_conditionnement) continue;
    const dureeMinutes = hhmmDiffMinutes(row.temps_demarage_lot, row.temps_arret_batch);
    if (dureeMinutes <= 0) continue;
    const estSamedi = new Date(`${row.date_jour}T00:00:00`).getDay() === 6;
    blocs.push({
      source: "conditionnement",
      chaine: row.chaine || "-",
      code: row.code,
      typeArticle: resolveTypeArticle(row.programme_ligne_id),
      dateJour: row.date_jour,
      debutLabel: row.temps_demarage_lot,
      finLabel: row.temps_arret_batch,
      nbPersonnes: Number(row.nb_journaliers_conditionnement),
      dureeMinutes,
      estSamedi,
      ...classerDuree(dureeMinutes, estSamedi),
    });
  }

  for (const row of emballageRows) {
    if (!row.emballage_temps_demarrer || !row.emballage_temps_arret || !row.nb_journaliers_emballage) continue;
    const dureeMinutes = hhmmDiffMinutes(row.emballage_temps_demarrer, row.emballage_temps_arret);
    if (dureeMinutes <= 0) continue;
    const estSamedi = new Date(`${row.date_jour}T00:00:00`).getDay() === 6;
    blocs.push({
      source: "emballage",
      chaine: row.emballage_machine || "-",
      code: row.code,
      typeArticle: resolveTypeArticle(row.programme_ligne_id),
      dateJour: row.date_jour,
      debutLabel: row.emballage_temps_demarrer,
      finLabel: row.emballage_temps_arret,
      nbPersonnes: Number(row.nb_journaliers_emballage),
      dureeMinutes,
      estSamedi,
      ...classerDuree(dureeMinutes, estSamedi),
    });
  }

  for (const row of rapportRows) {
    if (
      !row.temps_debut_preparation ||
      !row.temps_vidange ||
      !row.nb_journaliers_fabrication ||
      !row.date_fabrication_conditionnement
    )
      continue;
    const anneeRef = Number(row.date_fabrication_conditionnement.slice(0, 4));
    const interval = ddmmHhmmToInterval(row.temps_debut_preparation, row.temps_vidange, anneeRef);
    if (!interval) continue;
    const dureeMinutes = Math.round((interval.endMs - interval.startMs) / 60000);
    if (dureeMinutes <= 0) continue;
    // Garde-fou : une saisie ou la vidange tombe (jour/mois) avant le debut
    // sur la meme partie d'annee se fait interpreter par ddmmHhmmToInterval
    // comme un vrai changement decembre -> janvier, et lui ajoute 1 an entier
    // - vrai cas trouve en donnees (ecart de quelques heures dans l'intention,
    // devient ~365 jours calcules). Une macceration/preparation reelle peut
    // durer plusieurs jours (confirme : jusqu'a 10 jours pour un serum en
    // donnees reelles) mais jamais des mois - au-dela de 60 jours, ignore la
    // ligne plutot que d'afficher un total absurde.
    if (dureeMinutes > 60 * 24 * 60) continue;
    const dateDebut = new Date(interval.startMs);
    const dateFin = new Date(interval.endMs);
    const estMultiJours =
      dateDebut.getFullYear() !== dateFin.getFullYear() ||
      dateDebut.getMonth() !== dateFin.getMonth() ||
      dateDebut.getDate() !== dateFin.getDate();
    const classement = estMultiJours
      ? classerFabricationMultiJours(interval.startMs, interval.endMs)
      : classerDuree(dureeMinutes, dateDebut.getDay() === 6);
    blocs.push({
      source: "fabrication",
      chaine: row.machine || "-",
      code: row.code,
      typeArticle: resolveTypeArticle(row.programme_ligne_id),
      dateJour: row.date_fabrication_conditionnement,
      debutLabel: row.temps_debut_preparation,
      finLabel: row.temps_vidange,
      nbPersonnes: Number(row.nb_journaliers_fabrication),
      dureeMinutes,
      estSamedi: classement.joursSupMinutes > 0,
      ...classement,
    });
  }

  for (const row of manuelRows) {
    const dureeMinutes = Math.round(Number(row.nb_heures) * 60);
    if (dureeMinutes <= 0 || !(Number(row.nb_journaliers) > 0)) continue;
    const estSamedi = new Date(`${row.date_jour}T00:00:00`).getDay() === 6;
    blocs.push({
      source: "manuel",
      chaine: nomActivite(row.heures_sup_activites),
      code: "-",
      typeArticle: null,
      dateJour: row.date_jour,
      debutLabel: "-",
      finLabel: "-",
      nbPersonnes: Number(row.nb_journaliers),
      dureeMinutes,
      estSamedi,
      ...classerManuel(dureeMinutes, estSamedi),
    });
  }

  blocs.sort((a, b) => a.dateJour.localeCompare(b.dateJour) || a.chaine.localeCompare(b.chaine));
  return blocs;
}

export type JourAgg = {
  source: SourceEtape;
  chaine: string;
  typeArticle: string | null;
  dateJour: string;
  nbBlocs: number;
  nbPersonnes: number;
  dureeMinutes: number;
  estSamedi: boolean;
  normalesMinutes: number;
  supMinutes: number;
  joursSupMinutes: number;
};

// Regroupe les blocs (fournees individuelles) par (etape + chaine + jour) -
// demande explicite : "si machine 1 travaille 4 articles avec des codes
// differents, chacun besoin 8 journaliers, et travaille les 4 de 8h a 16h,
// il faut prendre que le nb journalier c'est 8 seulement, pas 8x4". Une
// meme equipe (meme chaine, meme jour) qui traite plusieurs codes n'est PAS
// 4 equipes differentes - la BASE cree pourtant 1 ligne production_carton_entries/
// production_emballage_entries/production_rapports PAR CODE, meme quand
// c'est en realite la MEME equipe sur le MEME creneau.
//
// Prend le MAX (pas la somme) du nb de personnes sur le groupe, et reprend
// TEL QUEL le classement (normal/sup/jour sup) deja calcule sur le bloc de
// PLUS GRANDE duree du groupe - jamais un nouveau classerDuree() applique a
// une duree "max" recalculee ici, qui casserait le cas Fabrication
// multi-jours (classerFabricationMultiJours, deja plafonne 8h/jour et
// samedi exclu - reappliquer un classerDuree simple sur sa duree brute
// redonnerait un resultat faux). Les lignes "manuel" (Heures Sup Manuel)
// restent JAMAIS regroupees : chacune est une vraie saisie distincte et
// volontaire (pas un artefact du decoupage par code), voir classerManuel
// plus haut.
export function regrouperParChaineJour(blocs: BlocHeuresSup[]): JourAgg[] {
  const groupes = new Map<string, BlocHeuresSup[]>();
  let compteurManuel = 0;

  for (const b of blocs) {
    const key = b.source === "manuel" ? `manuel::${compteurManuel++}` : `${b.source}::${b.chaine}::${b.dateJour}`;
    const list = groupes.get(key) ?? [];
    list.push(b);
    groupes.set(key, list);
  }

  const resultat: JourAgg[] = [];
  for (const groupe of groupes.values()) {
    const nbPersonnes = Math.max(...groupe.map((b) => b.nbPersonnes));
    const representatif = groupe.reduce((max, b) => (b.dureeMinutes > max.dureeMinutes ? b : max), groupe[0]);
    resultat.push({
      source: representatif.source,
      chaine: representatif.chaine,
      typeArticle: representatif.typeArticle,
      dateJour: representatif.dateJour,
      nbBlocs: groupe.length,
      nbPersonnes,
      dureeMinutes: representatif.dureeMinutes,
      estSamedi: representatif.estSamedi,
      normalesMinutes: representatif.normalesMinutes,
      supMinutes: representatif.supMinutes,
      joursSupMinutes: representatif.joursSupMinutes,
    });
  }

  resultat.sort((a, b) => a.dateJour.localeCompare(b.dateJour) || a.chaine.localeCompare(b.chaine));
  return resultat;
}
