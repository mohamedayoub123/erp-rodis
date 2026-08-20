// Rapproche un nom de machine saisi en texte libre (production_rapports.machine,
// .emballage_machine, ou programme_lignes.chaine) au nom exact d'une machine
// dans la table `machines` - simple normalisation (minuscule + espaces
// retires aux extremites), pas de correction de faute de frappe. Un nom
// saisi qui ne correspond a aucune machine ne matchera pas a tort, a
// corriger a la saisie si ca arrive. Extrait de
// app/production/rapport/machines-capacite/page.tsx pour etre reutilise par
// lib/cout-production-reel.ts sans dupliquer la logique.
export function normalizeMachineName(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}
