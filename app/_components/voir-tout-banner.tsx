// Bandeau sous un long tableau qui n'affiche que les premieres lignes : les
// pages de rapport rendaient plusieurs milliers de lignes d'un coup (jusqu'a
// 16 Mo de HTML a chaque ouverture). Le tableau montre les premieres lignes
// de la liste triee, "Voir tout" affiche le reste (les filtres et l'export
// Excel portent toujours sur tout).
export function VoirToutBanner({
  affiches,
  total,
  href,
}: {
  affiches: number;
  total: number;
  href: string;
}) {
  if (affiches >= total) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4 text-sm text-slate-600">
      <span>
        {affiches} premiers affiches sur {total}.
      </span>
      <a href={href} className="font-semibold text-sky-700 underline">
        Voir tout ({total})
      </a>
    </div>
  );
}
