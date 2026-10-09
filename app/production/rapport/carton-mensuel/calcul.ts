import {
  computeProduitParCode,
  fetchAllCartonEntries,
  fetchAllCodeTermineRows,
  fetchAllProgrammeLignes,
  groupCartonEntriesByLigne,
  splitLigneIntoDisplayRows,
  type ProgrammeLigneRow,
} from "../../suivi/data";

// Rapport Carton mensuel : par mois (date programme), total carton commande vs total carton reellement fabrique, et
// le % de programmes (codes) termines ce mois-la. Calcul partage par la page du rapport et par la diapositive KPI
// "% temps d'arret et production realisee" des trimestres.
type Statut = "Termine" | "Termine Manuel" | "En cours" | "Pas commence";

const MOIS_NOMS = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];

function moisLabel(key: string) {
  const [year, month] = key.split("-");
  const index = Number(month) - 1;
  return `${MOIS_NOMS[index] ?? month} ${year}`;
}

export async function calculerCartonMensuel() {
  const [{ rows: lignes }, cartonEntries] = await Promise.all([
    fetchAllProgrammeLignes(),
    fetchAllCartonEntries(),
  ]);

  const codeTermineRows = await fetchAllCodeTermineRows(lignes.map((ligne) => ligne.id));
  const terminatedCodes = new Set(
    codeTermineRows.map((row) => `${row.programme_ligne_id}::${row.code}::${row.stage}`)
  );

  const cartonByLigne = groupCartonEntriesByLigne(cartonEntries);

  function ligneOwnCodes(ligne: ProgrammeLigneRow): string[] {
    return splitLigneIntoDisplayRows(ligne, "qt_vrac", 0).map((split) => split.displayCode);
  }

  const lignesWithLot = lignes.filter((ligne) => ligne.numero_lot);

  const allRows = lignesWithLot.flatMap((ligne) => {
    const codes = ligneOwnCodes(ligne);
    const cartonEntriesForLigne = (cartonByLigne.get(ligne.id) ?? []) as { code: string; quantite: number }[];

    const cartonSplits = splitLigneIntoDisplayRows(ligne, "qt_carton", 0);
    const cartonDemandeByCode = new Map(
      cartonSplits.map((split) => [split.displayCode, split.displayQuantite ?? ligne.qt_carton ?? 0])
    );

    const cartonFabriqueByCode = computeProduitParCode(
      cartonEntriesForLigne,
      codes,
      (code) => cartonDemandeByCode.get(code) ?? 0
    );

    return codes.map((code) => {
      const cartonDemande = cartonDemandeByCode.get(code) ?? 0;
      const cartonFabrique = cartonFabriqueByCode.get(code) ?? 0;

      const cartonManuel = Boolean(
        ligne.programme_termine || ligne.carton_termine || terminatedCodes.has(`${ligne.id}::${code}::carton`)
      );
      const cartonNaturel = cartonDemande <= 0 || cartonFabrique >= cartonDemande;
      const hasStarted = cartonFabrique > 0;
      const statut: Statut =
        cartonManuel || cartonNaturel
          ? cartonNaturel
            ? "Termine"
            : "Termine Manuel"
          : hasStarted
            ? "En cours"
            : "Pas commence";

      return {
        mois: (ligne.date_jour || "").slice(0, 7),
        cartonDemande,
        cartonFabrique,
        statut,
      };
    });
  });

  // Codes sans rien a comparer (jamais rien commande ni fabrique) - meme
  // garde-fou que Rapport Carton, sinon un code 0/0 fausse a la fois le
  // total et le % de programme fait.
  const rows = allRows.filter((row) => !(row.cartonDemande <= 0 && row.cartonFabrique <= 0) && row.mois);

  const byMonth = new Map<
    string,
    { totalCommande: number; totalFabrique: number; nbTotal: number; nbTermines: number }
  >();

  for (const row of rows) {
    const current = byMonth.get(row.mois) ?? {
      totalCommande: 0,
      totalFabrique: 0,
      nbTotal: 0,
      nbTermines: 0,
    };
    current.totalCommande += row.cartonDemande;
    current.totalFabrique += row.cartonFabrique;
    current.nbTotal += 1;
    if (row.statut === "Termine" || row.statut === "Termine Manuel") current.nbTermines += 1;
    byMonth.set(row.mois, current);
  }

  const monthRows = [...byMonth.entries()]
    .map(([mois, stats]) => ({
      mois,
      moisLabel: moisLabel(mois),
      totalCommande: stats.totalCommande,
      totalFabrique: stats.totalFabrique,
      ecart: stats.totalFabrique - stats.totalCommande,
      nbTotal: stats.nbTotal,
      nbTermines: stats.nbTermines,
      pct: stats.nbTotal > 0 ? (stats.nbTermines / stats.nbTotal) * 100 : 0,
    }))
    .sort((a, b) => b.mois.localeCompare(a.mois));

  return monthRows;
}
