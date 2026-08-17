"use client";

type Series = { key: string; label: string; color: string; values: number[] };

const WIDTH = 720;
const HEIGHT = 320;
const PAD_LEFT = 40;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 40;

// Evolution dans le temps par mois, plusieurs series sur le meme axe Y
// (toutes en "nombre de preparations", donc jamais de double-axe) - SVG
// fait maison (pas de bibliotheque de graphiques dans ce projet). Points
// directement etiquetes sur la derniere valeur de chaque courbe (pas sur
// chaque point, pour rester lisible avec 5 series) + legende complete.
export function TestLaboLineChart({
  months,
  series,
  title = "Evolution par mois",
  unit = "",
}: {
  months: string[];
  series: Series[];
  title?: string;
  unit?: string;
}) {
  const maxValue = Math.max(1, ...series.flatMap((s) => s.values));
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  function xFor(index: number) {
    if (months.length <= 1) return PAD_LEFT + plotWidth / 2;
    return PAD_LEFT + (index / (months.length - 1)) * plotWidth;
  }

  function yFor(value: number) {
    return PAD_TOP + plotHeight - (value / maxValue) * plotHeight;
  }

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(maxValue * fraction));

  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-4 text-lg font-bold text-slate-900">{title}</h2>

      {months.length === 0 ? (
        <p className="text-sm text-slate-500">Aucune preparation pour ce filtre.</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label={title}>
            {yTicks.map((tick) => (
              <g key={tick}>
                <line
                  x1={PAD_LEFT}
                  x2={WIDTH - PAD_RIGHT}
                  y1={yFor(tick)}
                  y2={yFor(tick)}
                  stroke="#e2e8f0"
                  strokeWidth={1}
                />
                <text x={PAD_LEFT - 8} y={yFor(tick)} textAnchor="end" dominantBaseline="middle" className="fill-slate-400 text-[10px]">
                  {tick}
                  {unit}
                </text>
              </g>
            ))}

            {months.map((month, index) => (
              <text
                key={month}
                x={xFor(index)}
                y={HEIGHT - PAD_BOTTOM + 20}
                textAnchor="middle"
                className="fill-slate-500 text-[9px] font-semibold"
              >
                {month}
              </text>
            ))}

            {series.map((serie) => {
              const points = serie.values.map((value, index) => `${xFor(index)},${yFor(value)}`).join(" ");
              const lastIndex = serie.values.length - 1;
              return (
                <g key={serie.key}>
                  <polyline points={points} fill="none" stroke={serie.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                  {serie.values.map((value, index) => (
                    <circle key={index} cx={xFor(index)} cy={yFor(value)} r={3.5} fill={serie.color} stroke="#fff" strokeWidth={1.5} />
                  ))}
                  {lastIndex >= 0 ? (
                    <text
                      x={xFor(lastIndex) + 6}
                      y={yFor(serie.values[lastIndex])}
                      dominantBaseline="middle"
                      className="text-[11px] font-bold"
                      fill={serie.color}
                    >
                      {serie.values[lastIndex]}
                      {unit}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>

          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            {series.map((serie) => (
              <li key={serie.key} className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: serie.color }} aria-hidden="true" />
                <span className="font-medium text-slate-700">{serie.label}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
