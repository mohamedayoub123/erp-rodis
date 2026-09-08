// Compare deux valeurs de champ "donnees" en ignorant les differences de
// type sans consequence (nombre 100 vs chaine "100", null vs cle absente) -
// le formulaire renormalise TOUJOURS les colonnes editables a chaque
// sauvegarde (voir saveRapportGammeStatistiqueAction), meme sur des lignes
// que l'utilisateur n'a pas touchees ; sans cette tolerance, l'historique
// serait noye de "changements" fantomes a chaque clic sur "Enregistrer".
export function statistiqueFieldsEqual(a: unknown, b: unknown): boolean {
  const na = a === null || a === undefined ? "" : String(a).trim();
  const nb = b === null || b === undefined ? "" : String(b).trim();
  return na === nb;
}

export function statistiqueChangedKeys(
  avant: Record<string, unknown> | null | undefined,
  apres: Record<string, unknown> | null | undefined
): string[] {
  const keys = new Set([...Object.keys(avant ?? {}), ...Object.keys(apres ?? {})]);
  return [...keys].filter((key) => !statistiqueFieldsEqual((avant ?? {})[key], (apres ?? {})[key]));
}
