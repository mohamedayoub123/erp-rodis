// Type de machine d'un article plastique (Statistique Article Plastique E3) : le procede de fabrication, choisi a la main
// dans une liste fixe. Le code est ce qui est enregistre (articles_matiere_premiere.type_machine_plastique, colonne creee par
// scripts/sql/add_type_machine_plastique.sql).
export const TYPES_MACHINE_PLASTIQUE = [
  { code: "INJECTION", libelle: "Injection" },
  { code: "SOUFFLAGE", libelle: "Soufflage" },
  { code: "PET", libelle: "PET" },
] as const;

export type CodeTypeMachine = (typeof TYPES_MACHINE_PLASTIQUE)[number]["code"];

export const SQL_TYPE_MACHINE_PLASTIQUE = "scripts/sql/add_type_machine_plastique.sql";

// Type choisi dans la liste : null si rien n'est choisi ; une valeur hors liste est refusee
export function lireTypeMachine(valeur: FormDataEntryValue | null): CodeTypeMachine | null {
  const texte = String(valeur ?? "").trim().toUpperCase();
  if (!texte) return null;
  const trouve = TYPES_MACHINE_PLASTIQUE.find((type) => type.code === texte);
  if (!trouve) throw new Error("Type de machine invalide : choisis Injection, Soufflage ou PET.");
  return trouve.code;
}

export function libelleTypeMachine(code: string | null | undefined): string {
  return TYPES_MACHINE_PLASTIQUE.find((type) => type.code === code)?.libelle ?? "-";
}
