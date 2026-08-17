"use client";

type Slice = { label: string; value: number; color: string };

const SIZE = 260;
const RADIUS = 110;
const CENTER = SIZE / 2;

function polarToCartesian(angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + RADIUS * Math.cos(angleRad), y: CENTER + RADIUS * Math.sin(angleRad) };
}

function describeSlice(startAngle: number, endAngle: number) {
  const start = polarToCartesian(endAngle);
  const end = polarToCartesian(startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${CENTER} ${CENTER} L ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
}

// Repartition du carton fabrique par gamme, en camembert - SVG fait maison
// (meme principe que CartonMensuelLineChart, pas de bibliotheque de
// graphiques dans ce projet). Une seule part si tout appartient a une seule
// gamme (evite un arc degenere a 360deg, que la formule ci-dessus ne sait
// pas dessiner correctement).
export function CartonGammePieChart({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (total <= 0 || slices.length === 0) {
    return <p className="text-sm text-slate-500">Aucune donnee pour le moment.</p>;
  }

  let cumulativeAngle = 0;
  const arcs = slices.map((slice) => {
    const fraction = slice.value / total;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + fraction * 360;
    cumulativeAngle = endAngle;
    return { ...slice, fraction, startAngle, endAngle };
  });

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-56 w-56 shrink-0" role="img" aria-label="Repartition du carton fabrique par gamme">
        {arcs.length === 1 ? (
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill={arcs[0].color} />
        ) : (
          arcs.map((arc) => (
            <path key={arc.label} d={describeSlice(arc.startAngle, arc.endAngle)} fill={arc.color} stroke="#fff" strokeWidth={1.5} />
          ))
        )}
      </svg>

      <ul className="grid w-full grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {arcs.map((arc) => (
          <li key={arc.label} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: arc.color }} aria-hidden="true" />
            <span className="truncate font-medium text-slate-700">{arc.label}</span>
            <span className="ml-auto shrink-0 font-semibold text-slate-500">{Math.round(arc.fraction * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
