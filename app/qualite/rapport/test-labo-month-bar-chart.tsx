"use client";

// Tendance dans le temps (nombre de tests par mois) - complement du
// camembert (repartition du filtre actuel) : l'un montre "combien de
// quoi maintenant", l'autre "combien par mois". Barres verticales, SVG
// fait maison (pas de bibliotheque de graphiques dans ce projet).
export function TestLaboMonthBarChart({
  data,
}: {
  data: { label: string; count: number }[];
}) {
  const maxCount = Math.max(1, ...data.map((d) => d.count));
  const barColor = "#4338ca";

  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-4 text-lg font-bold text-slate-900">Tests par mois</h2>
      {data.length === 0 ? (
        <p className="text-sm text-slate-500">Aucune preparation pour ce filtre.</p>
      ) : (
        <div className="flex flex-1 items-end justify-center gap-3 sm:gap-5">
          {data.map((entry) => {
            const heightPct = (entry.count / maxCount) * 100;
            return (
              <div key={entry.label} className="flex h-64 flex-1 flex-col items-center justify-end gap-2">
                <span className="text-sm font-bold text-slate-900">{entry.count}</span>
                <div
                  className="w-full max-w-16 rounded-t-lg"
                  style={{ height: `${Math.max(heightPct, 2)}%`, backgroundColor: barColor }}
                  role="img"
                  aria-label={`${entry.label} : ${entry.count} tests`}
                />
                <span className="text-center text-xs font-semibold text-slate-500">{entry.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
