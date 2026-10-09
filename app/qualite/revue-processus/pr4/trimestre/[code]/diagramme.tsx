import type { DiagrammeProc, NoeudProc, Pt } from "./procedures-donnees";

// Dessine un schema de procedure (cases, losanges, ovales, fleches...) en vectoriel : les textes restent nets et
// lisibles a toutes les tailles. Les donnees (positions, textes) sont dans procedures-donnees.ts.
const POLICE = 'Arial, "Helvetica Neue", Helvetica, sans-serif';

const THEMES = {
  noir: { trait: "#111111", epaisseur: 3, fond: "#ffffff", texte: "#111111", lien: "#111111", epLien: 2.4, fleche: "ouverte" },
  orange: { trait: "#f2a100", epaisseur: 2.2, fond: "#fff4d6", texte: "#1e1e1e", lien: "#f2a100", epLien: 2.2, fleche: "pleine" },
  bleu: { trait: "#4472c4", epaisseur: 2, fond: "#ffffff", texte: "#3b62b4", lien: "#4472c4", epLien: 2, fleche: "pleine" },
} as const;

const STYLES_SPECIAUX = {
  vert: { trait: "#70ad47", texte: "#5f9a3a" },
  jaune: { trait: "#ffc000", texte: "#e0a500" },
} as const;

function milieu(n: NoeudProc): Pt {
  return [(n.x1 + n.x2) / 2, (n.y1 + n.y2) / 2];
}

function points(liste: Pt[]) {
  return liste.map((p) => p.join(",")).join(" ");
}

function etoile(n: NoeudProc): string {
  const [cx, cy] = milieu(n);
  const rExt = Math.min(n.x2 - n.x1, n.y2 - n.y1) / 2;
  const rInt = rExt * 0.42;
  const pts: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? rExt : rInt;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([Math.round((cx + r * Math.cos(angle)) * 10) / 10, Math.round((cy + r * Math.sin(angle)) * 10) / 10]);
  }
  return points(pts);
}

function engrenage(n: NoeudProc): string {
  const [cx, cy] = milieu(n);
  const rExt = Math.min(n.x2 - n.x1, n.y2 - n.y1) / 2;
  const rInt = rExt * 0.8;
  const dents = 8;
  const pts: Pt[] = [];
  for (let i = 0; i < dents; i++) {
    const base = (i * 2 * Math.PI) / dents - Math.PI / 2;
    const pas = (2 * Math.PI) / dents;
    for (const [fraction, r] of [[0.1, rInt], [0.22, rExt], [0.5, rExt], [0.62, rInt]] as const) {
      const a = base + pas * fraction;
      pts.push([Math.round((cx + r * Math.cos(a)) * 10) / 10, Math.round((cy + r * Math.sin(a)) * 10) / 10]);
    }
  }
  return points(pts);
}

function Forme({ n, theme }: { n: NoeudProc; theme: (typeof THEMES)[keyof typeof THEMES] }) {
  const special = n.style ? STYLES_SPECIAUX[n.style] : null;
  const commun = {
    fill: special ? "#ffffff" : theme.fond,
    stroke: special ? special.trait : theme.trait,
    strokeWidth: theme.epaisseur,
    strokeLinejoin: "round" as const,
  };
  const [cx, cy] = milieu(n);
  const w = n.x2 - n.x1;
  const h = n.y2 - n.y1;
  switch (n.forme) {
    case "ellipse":
      return <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} {...commun} />;
    case "losange":
      return <polygon points={points([[cx, n.y1], [n.x2, cy], [cx, n.y2], [n.x1, cy]])} {...commun} />;
    case "arrondi":
      return <rect x={n.x1} y={n.y1} width={w} height={h} rx={Math.min(16, h / 3)} {...commun} />;
    case "etoile":
      return <polygon points={etoile(n)} {...commun} />;
    case "engrenage":
      return <polygon points={engrenage(n)} {...commun} />;
    case "chevron":
      return <polygon points={points([[n.x1, n.y1], [n.x2, cy], [n.x1, n.y2], [n.x1 + w * 0.5, cy]])} {...commun} />;
    default:
      return <rect x={n.x1} y={n.y1} width={w} height={h} {...commun} />;
  }
}

export function Diagramme({ diagramme, identifiant }: { diagramme: DiagrammeProc; identifiant: string }) {
  const theme = THEMES[diagramme.theme];
  const taille = diagramme.taille;
  const couleurs = [...new Set(diagramme.liens.map((l) => l.couleur ?? theme.lien))];
  const marqueur = (couleur: string) => `fleche-${identifiant}-${couleur.replace("#", "")}`;
  const [vx, vy, vw, vh] = diagramme.vue;

  return (
    <svg
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      role="img"
      aria-label={diagramme.titre}
      style={{ display: "block", width: "100%", height: "auto", fontFamily: POLICE }}
    >
      <defs>
        {couleurs.map((couleur) => (
          <marker key={couleur} id={marqueur(couleur)} viewBox="0 0 14 14" refX={theme.fleche === "pleine" ? 12 : 11} refY="7" markerWidth="14" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto">
            {theme.fleche === "pleine" ? (
              <path d="M0,1 L13,7 L0,13 z" fill={couleur} />
            ) : (
              <path d="M1,1 L12,7 L1,13" fill="none" stroke={couleur} strokeWidth="2.2" strokeLinejoin="miter" />
            )}
          </marker>
        ))}
      </defs>

      {/* liens */}
      {diagramme.liens.map((lien, i) => (
        <polyline
          key={i}
          points={points(lien.pts)}
          fill="none"
          stroke={lien.couleur ?? theme.lien}
          strokeWidth={theme.epLien}
          strokeLinejoin="round"
          markerEnd={lien.fleche ? `url(#${marqueur(lien.couleur ?? theme.lien)})` : undefined}
        />
      ))}

      {/* formes + textes */}
      {diagramme.noeuds.map((n) => {
        const special = n.style ? STYLES_SPECIAUX[n.style] : null;
        const t = n.taille ?? taille;
        const lh = t * 1.22;
        const [cx, cy] = milieu(n);
        const debutY = cy - ((n.lignes.length - 1) * lh) / 2 + t * 0.35;
        const gauche = n.alignement === "gauche";
        return (
          <g key={n.id}>
            <Forme n={n} theme={theme} />
            <text
              x={gauche ? n.x1 + 16 : cx}
              y={debutY}
              textAnchor={gauche ? "start" : "middle"}
              fontSize={t}
              fill={special ? special.texte : theme.texte}
            >
              {n.lignes.map((ligne, i) => (
                <tspan key={i} x={gauche ? n.x1 + 16 : cx} dy={i === 0 ? 0 : lh}>
                  {ligne}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}

      {/* etiquettes libres (Oui / Non / C / NC ...) */}
      {diagramme.etiquettes.map((e, i) => (
        <text
          key={i}
          x={e.x}
          y={e.y}
          textAnchor="middle"
          fontSize={e.taille ?? taille}
          fontWeight={e.gras ? 700 : 400}
          fill={e.couleur ?? theme.texte}
        >
          {e.texte}
        </text>
      ))}
    </svg>
  );
}
