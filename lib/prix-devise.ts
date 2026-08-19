// Convertit un prix unitaire en FCFA selon la devise et le taux de change
// saisis (fige sur la ligne au moment de la saisie) - le taux n'est utilise
// que quand la devise n'est pas FCFA.
export function convertirEnFcfa(
  prixUnitaire: number | null,
  devise: string | null,
  tauxChange: number | null
): number | null {
  if (prixUnitaire === null) return null;
  if (!devise || devise === "FCFA") return prixUnitaire;
  if (tauxChange === null) return null;
  return prixUnitaire * tauxChange;
}
