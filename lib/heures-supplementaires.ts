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

export type SourceEtape = "fabrication" | "conditionnement" | "emballage";

export const SOURCE_LABELS: Record<SourceEtape, string> = {
  fabrication: "Fabrication",
  conditionnement: "Conditionnement",
  emballage: "Emballage",
};

export type BlocHeuresSup = {
  source: SourceEtape;
  chaine: string;
  code: string;
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
// travaille 16h+ d'affilee). Un jour touche qui est un samedi bascule ses 8h
// (au lieu de moins si le segment est plus court) en jour sup plutot qu'en
// normal - jamais de sup "classique" genere par un etalement multi-jours,
// seule une VRAIE fournee sur un seul jour (classerDuree ci-dessus) peut en
// produire.
function classerFabricationMultiJours(startMs: number, endMs: number) {
  let normalesMinutes = 0;
  let joursSupMinutes = 0;

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

    const segMinutes = Math.round((segEnd - segStart) / 60000);
    const compteMinutes = Math.min(segMinutes, NORMAL_MINUTES_PAR_FOURNEE);

    if (estSamediCeJour) joursSupMinutes += compteMinutes;
    else normalesMinutes += compteMinutes;
  }

  return { normalesMinutes, supMinutes: 0, joursSupMinutes };
}

type CartonRow = {
  code: string;
  date_jour: string;
  chaine: string | null;
  temps_demarage_lot: string | null;
  temps_arret_batch: string | null;
  nb_journaliers_conditionnement: number | null;
};

type EmballageRow = {
  code: string;
  date_jour: string;
  emballage_machine: string | null;
  emballage_temps_demarrer: string | null;
  emballage_temps_arret: string | null;
  nb_journaliers_emballage: number | null;
};

type RapportRow = {
  code: string;
  machine: string | null;
  temps_debut_preparation: string | null;
  temps_vidange: string | null;
  nb_journaliers_fabrication: number | null;
  date_fabrication_conditionnement: string | null;
};

export async function fetchBlocsHeuresSup(periode: {
  dateFrom: string;
  dateTo: string;
}): Promise<BlocHeuresSup[]> {
  const [cartonRows, emballageRows, rapportRows] = await Promise.all([
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
          .select("code, date_jour, chaine, temps_demarage_lot, temps_arret_batch, nb_journaliers_conditionnement")
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
          .select("code, date_jour, emballage_machine, emballage_temps_demarrer, emballage_temps_arret, nb_journaliers_emballage")
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
          .select("code, machine, temps_debut_preparation, temps_vidange, nb_journaliers_fabrication, date_fabrication_conditionnement")
          .gte("date_fabrication_conditionnement", periode.dateFrom)
          .lte("date_fabrication_conditionnement", periode.dateTo)
          .order("date_fabrication_conditionnement", { ascending: true })
          .range(from, to)
    ),
  ]);

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
      dateJour: row.date_fabrication_conditionnement,
      debutLabel: row.temps_debut_preparation,
      finLabel: row.temps_vidange,
      nbPersonnes: Number(row.nb_journaliers_fabrication),
      dureeMinutes,
      estSamedi: classement.joursSupMinutes > 0,
      ...classement,
    });
  }

  blocs.sort((a, b) => a.dateJour.localeCompare(b.dateJour) || a.chaine.localeCompare(b.chaine));
  return blocs;
}
