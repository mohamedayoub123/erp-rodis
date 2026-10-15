import { supabaseServer } from "@/lib/supabase-server";
import { fetchMachinesConditionnement } from "@/lib/machines-conditionnement";
import { hhmmDiffMinutes } from "@/lib/suivi-tirage-time";

// Rapport Conditionnement mensuel : une ligne par mois (date de la saisie Conditionnement, production_carton_entries).
//  - machines demarrees : TOTAL des machines de tous les jours du mois = somme, pour chaque jour travaille, du nombre de machines
//    (zone + chaine) qui ont produit ce jour-la (ex : 30 machines pendant 10 jours = 300) ; on garde aussi le nombre de machines
//    differentes du mois et la moyenne par jour ;
//  - jours travailles : nombre de jours differents avec une production ;
//  - heures : somme des durees "demarrage du lot -> arret du batch" de chaque saisie (cumul de toutes les machines), dont les
//    arrets declares (minutes) ;
//  - cartons : total des cartons fabriques ;
//  - kg : cartons x pieces par carton x contenance (kg par piece), le poids reel releve en Conditionnement primant sur la
//    contenance de la fiche article - meme conversion que le rapport Balance Matiere.

const ARRET_COLONNES = [
  "arret_depot",
  "arret_consommable_non_livre",
  "arret_manque_conditionnement",
  "arret_manque_vrac",
  "arret_technique",
  "arret_coupure_courant",
  "arret_raclage_vrac",
  "arret_changement_lot",
  "arret_flacons_nc",
  "arret_autre",
] as const;

type EntreeCarton = {
  programme_ligne_id: number;
  code: string | null;
  date_jour: string | null;
  zone: string | null;
  chaine: string | null;
  quantite: number | string | null;
  temps_demarage_lot: string | null;
  temps_arret_batch: string | null;
} & Record<(typeof ARRET_COLONNES)[number], number | string | null>;

export type LigneMois = {
  mois: string; // AAAA-MM
  moisLabel: string;
  machinesJours: number; // total des machines de tous les jours du mois
  machines: number; // machines differentes du mois
  machinesParJourMoyen: number;
  jours: number;
  minutesTravaillees: number;
  minutesArrets: number;
  cartons: number;
  kg: number;
  cartonsSansKg: number;
};

export type RapportConditionnementMensuel = {
  lignes: LigneMois[]; // du plus recent au plus ancien
  total: Omit<LigneMois, "mois" | "moisLabel">;
  nbMachinesConditionnement: number;
};

const MOIS = ["Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin", "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre"];

function libelleMois(cle: string) {
  const [annee, mois] = cle.split("-").map(Number);
  return `${MOIS[(mois || 1) - 1]} ${annee}`;
}

async function lirePages<T>(lecteur: (debut: number, fin: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const lignes: T[] = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await lecteur(debut, debut + 999);
    if (error) break;
    const page = data ?? [];
    lignes.push(...page);
    if (page.length < 1000) break;
  }
  return lignes;
}

export async function calculerConditionnementMensuel(): Promise<RapportConditionnementMensuel> {
  const entrees = await lirePages<EntreeCarton>(
    (debut, fin) =>
      supabaseServer
        .from("production_carton_entries")
        .select(
          `programme_ligne_id, code, date_jour, zone, chaine, quantite, temps_demarage_lot, temps_arret_batch, ${ARRET_COLONNES.join(", ")}`
        )
        .not("date_jour", "is", null)
        .order("id", { ascending: true })
        .range(debut, fin) as unknown as PromiseLike<{ data: EntreeCarton[] | null; error: unknown }>
  );

  // Article de chaque ligne de programme -> pieces par carton et contenance (kg par piece)
  const ligneIds = [...new Set(entrees.map((entree) => entree.programme_ligne_id))];
  const articleParLigne = new Map<number, number | null>();
  for (let debut = 0; debut < ligneIds.length; debut += 150) {
    const { data } = await supabaseServer
      .from("programme_lignes")
      .select("id, article_id")
      .in("id", ligneIds.slice(debut, debut + 150));
    for (const ligne of (data ?? []) as { id: number; article_id: number | null }[]) articleParLigne.set(ligne.id, ligne.article_id);
  }

  const articleIds = [...new Set([...articleParLigne.values()].filter((id): id is number => id !== null))];
  const facteurParArticle = new Map<number, { pieceParCarton: number | null; contenance: number | null }>();
  for (let debut = 0; debut < articleIds.length; debut += 150) {
    const { data } = await supabaseServer
      .from("articles")
      .select("id, piece_par_carton, contenance")
      .in("id", articleIds.slice(debut, debut + 150));
    for (const article of (data ?? []) as { id: number; piece_par_carton: number | null; contenance: number | null }[]) {
      facteurParArticle.set(article.id, { pieceParCarton: article.piece_par_carton, contenance: article.contenance });
    }
  }

  // Poids reel releve en Conditionnement (grammes), par ligne + code
  const poidsReel = new Map<string, number>();
  for (let debut = 0; debut < ligneIds.length; debut += 150) {
    const lot = ligneIds.slice(debut, debut + 150);
    const lignes = await lirePages<{ programme_ligne_id: number; code: string | null; poids_reel: number | null }>(
      (a, b) =>
        supabaseServer
          .from("production_rapports")
          .select("programme_ligne_id, code, poids_reel")
          .in("programme_ligne_id", lot)
          .not("poids_reel", "is", null)
          .range(a, b) as unknown as PromiseLike<{
          data: { programme_ligne_id: number; code: string | null; poids_reel: number | null }[] | null;
          error: unknown;
        }>
    );
    for (const ligne of lignes) {
      if (ligne.poids_reel && ligne.poids_reel > 0) poidsReel.set(`${ligne.programme_ligne_id}::${ligne.code ?? ""}`, ligne.poids_reel);
    }
  }

  type Accumulateur = {
    machines: Set<string>;
    machinesParJour: Map<string, Set<string>>;
    jours: Set<string>;
    minutesTravaillees: number;
    minutesArrets: number;
    cartons: number;
    kg: number;
    cartonsSansKg: number;
  };
  const nouveau = (): Accumulateur => ({
    machines: new Set(),
    machinesParJour: new Map(),
    jours: new Set(),
    minutesTravaillees: 0,
    minutesArrets: 0,
    cartons: 0,
    kg: 0,
    cartonsSansKg: 0,
  });
  const parMois = new Map<string, Accumulateur>();
  const global = nouveau();

  for (const entree of entrees) {
    const jour = (entree.date_jour || "").slice(0, 10);
    if (jour.length !== 10) continue;
    const cle = jour.slice(0, 7);
    const cartons = Number(entree.quantite ?? 0) || 0;
    const minutes = hhmmDiffMinutes(entree.temps_demarage_lot, entree.temps_arret_batch);
    const arrets = ARRET_COLONNES.reduce((somme, colonne) => somme + (Number(entree[colonne] ?? 0) || 0), 0);
    if (cartons <= 0 && minutes <= 0) continue; // saisie vide : ne compte ni comme machine ni comme jour travaille

    const articleId = articleParLigne.get(entree.programme_ligne_id) ?? null;
    const facteur = articleId !== null ? facteurParArticle.get(articleId) : undefined;
    const grammes = poidsReel.get(`${entree.programme_ligne_id}::${entree.code ?? ""}`) ?? null;
    const contenance = grammes !== null ? grammes / 1000 : (facteur?.contenance ?? null);
    const pieces = facteur?.pieceParCarton ?? null;
    const convertible = pieces !== null && pieces > 0 && contenance !== null && contenance > 0;

    const machine = `${entree.zone ?? "-"}::${entree.chaine ?? "-"}`;
    for (const cumul of [parMois.get(cle) ?? (parMois.set(cle, nouveau()), parMois.get(cle)!), global]) {
      cumul.machines.add(machine);
      const duJour = cumul.machinesParJour.get(jour) ?? new Set<string>();
      duJour.add(machine);
      cumul.machinesParJour.set(jour, duJour);
      if (cartons > 0 || minutes > 0) cumul.jours.add(jour);
      cumul.minutesTravaillees += minutes;
      cumul.minutesArrets += arrets;
      cumul.cartons += cartons;
      if (convertible) cumul.kg += cartons * (pieces as number) * (contenance as number);
      else cumul.cartonsSansKg += cartons;
    }
  }

  const versLigne = (cumul: Accumulateur) => {
    const machinesJours = [...cumul.machinesParJour.values()].reduce((somme, jour) => somme + jour.size, 0);
    return {
      machinesJours,
      machines: cumul.machines.size,
      machinesParJourMoyen: cumul.jours.size > 0 ? machinesJours / cumul.jours.size : 0,
      jours: cumul.jours.size,
      minutesTravaillees: cumul.minutesTravaillees,
      minutesArrets: cumul.minutesArrets,
      cartons: cumul.cartons,
      kg: cumul.kg,
      cartonsSansKg: cumul.cartonsSansKg,
    };
  };

  const lignes = [...parMois.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([cle, cumul]) => ({ mois: cle, moisLabel: libelleMois(cle), ...versLigne(cumul) }));

  const machinesConditionnement = await fetchMachinesConditionnement();
  return { lignes, total: versLigne(global), nbMachinesConditionnement: machinesConditionnement.length };
}
