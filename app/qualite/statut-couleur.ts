// Couleur des statuts NC / TAF (tableaux et pages de detail) : vert = realise / cloture, orange = en cours, rouge = en
// attente / pas d'action / non realise. Les autres valeurs (vide, "NOUVELLE NC OUVERTE ANNEE N+1"...) restent neutres.
function normaliser(valeur: string | number | null | undefined): string {
  return String(valeur ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’`]/g, "'");
}

const FAIT = new Set(["REALISEE", "CLOTUREE"]);
const EN_COURS = new Set(["EN COURS"]);
const ROUGE = new Set(["EN ATTENTE", "PAS D'ACTION", "NON REALISEE"]);

export function statusColorClasses(valeur: string | number | null | undefined): string {
  const cle = normaliser(valeur);
  if (FAIT.has(cle)) return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (EN_COURS.has(cle)) return "border-amber-300 bg-amber-50 text-amber-800";
  if (ROUGE.has(cle)) return "border-red-300 bg-red-50 text-red-800";
  return "border-slate-200 bg-white text-slate-700";
}
