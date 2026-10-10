import { statusColorClasses } from "./statut-couleur";

// Statut NC / TAF en pastille de couleur (pages de detail) : meme couleurs que dans les tableaux.
export function StatutBadge({ valeur }: { valeur: string | null | undefined }) {
  return (
    <span className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${statusColorClasses(valeur)}`}>
      {valeur || "-"}
    </span>
  );
}
