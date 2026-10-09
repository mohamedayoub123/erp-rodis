import { calculerCartonMensuel } from "@/app/production/rapport/carton-mensuel/calcul";
import { calculerGrapheCharges } from "@/app/charges/graphe-donnees";
import { moisPr4 } from "./indicateurs-trimestre";

// Donnees des diapositives KPI du rapport de revue de processus.

export const MOIS_COURTS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
export const MOIS_LONGS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

// Production realisee (%) des mois d'AVANT l'ERP de production : reprise du graphique "% temps d'arret et production
// realisee" d'origine (le rapport Production > Carton Mensuel n'a pas ces mois). A partir des mois que le rapport
// connait, c'est son chiffre "% programme fait" qui est utilise.
const PRODUCTION_REALISEE_HISTORIQUE: Record<string, number> = {
  "2025-01": 63,
  "2025-02": 62,
  "2025-03": 68,
  "2025-04": 78,
  "2025-05": 70,
  "2025-06": 75,
  "2025-07": 84,
  "2025-08": 76,
  "2025-09": 82,
  "2025-10": 86,
  "2025-11": 75,
  "2025-12": 84,
  "2026-01": 99,
  "2026-02": 97,
  "2026-03": 95,
  "2026-04": 96,
  "2026-05": 91,
};

// Le calcul lit beaucoup de donnees : garde 60 s, partage entre les pages ouvertes dans la foulee
const memoires = new Map<string, { jusqua: number; promesse: Promise<unknown> }>();
function memoire<T>(cle: string, calcul: () => Promise<T>): Promise<T> {
  const existante = memoires.get(cle);
  if (existante && existante.jusqua > Date.now()) return existante.promesse as Promise<T>;
  const promesse = calcul();
  memoires.set(cle, { jusqua: Date.now() + 60_000, promesse });
  promesse.catch(() => memoires.delete(cle));
  return promesse;
}

// Dernier mois a afficher : fin du trimestre de la page, sans depasser le mois en cours
export function dernierMoisAffiche(annee: number, trimestre: number) {
  const finTrimestre = `${annee}-${String(trimestre * 3).padStart(2, "0")}`;
  const enCours = new Date().toISOString().slice(0, 7);
  return finTrimestre < enCours ? finTrimestre : enCours;
}

// ---------------------------------------------------------------- % temps d'arret et production realisee
export async function lireKpiArretProduction(dernierMois: string) {
  const [{ monthRows }, cartonMensuel] = await Promise.all([moisPr4(), memoire("carton-mensuel", () => calculerCartonMensuel())]);
  const arretParMois = new Map(monthRows.map((row) => [row.mois, row.pctArret]));
  const programmeFaitParMois = new Map(cartonMensuel.map((row) => [row.mois, row.pct]));

  // 2025 (12 mois), un espace, 2026 (12 mois)
  const mois: (string | null)[] = [];
  for (let m = 1; m <= 12; m++) mois.push(`2025-${String(m).padStart(2, "0")}`);
  mois.push(null);
  for (let m = 1; m <= 12; m++) mois.push(`2026-${String(m).padStart(2, "0")}`);

  const categories = mois.map((cle) => (cle ? [MOIS_COURTS[Number(cle.slice(5)) - 1], cle.slice(0, 4)] : null));
  const arret = mois.map((cle) => {
    if (!cle || cle > dernierMois) return null;
    const v = arretParMois.get(cle);
    return v === null || v === undefined ? null : v;
  });
  const production = mois.map((cle) => {
    if (!cle || cle > dernierMois) return null;
    if (cle in PRODUCTION_REALISEE_HISTORIQUE) return PRODUCTION_REALISEE_HISTORIQUE[cle];
    return programmeFaitParMois.get(cle) ?? null;
  });
  return { categories, arret, production };
}

// ---------------------------------------------------------------- cout du carton (multi-sources)
export async function lireKpiCoutCarton(annee: number, dernierMois: string) {
  const lignes = await memoire(`graphe-${annee}`, () => calculerGrapheCharges(annee));
  const mois = lignes.map((row) => `${annee}-${String(row.mois).padStart(2, "0")}`);
  const garder = (valeur: number | null, cle: string) => (cle > dernierMois ? null : valeur);
  return {
    categories: mois.map((cle) => [MOIS_LONGS[Number(cle.slice(5)) - 1], String(annee)]),
    r1: lignes.map((row, i) => garder(row.r1, mois[i])),
    r2: lignes.map((row, i) => garder(row.r2, mois[i])),
    r3: lignes.map((row, i) => garder(row.r3, mois[i])),
    r4: lignes.map((row, i) => garder(row.r4, mois[i])),
    r5: lignes.map((row, i) => garder(row.r5, mois[i])),
    r6: lignes.map((row, i) => garder(row.r6, mois[i])),
    // nb de carton fabrique, divise par 100 pour rester sur le meme axe (comme dans le graphe de Charges Usine)
    nbCarton: lignes.map((row, i) => garder(row.nbCarton > 0 ? row.nbCarton / 100 : null, mois[i])),
  };
}
