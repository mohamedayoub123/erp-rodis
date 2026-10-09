// Graphique en courbes (SVG) des diapositives KPI : plusieurs series, valeur ecrite sur chaque point, legende en
// haut, trous (null) laisses vides - un mois sans chiffre n'est pas trace comme "0".
const POLICE = 'Arial, "Helvetica Neue", Helvetica, sans-serif';

export type SerieGraphique = {
  cle: string;
  nom: string;
  couleur: string;
  valeurs: (number | null)[];
  // texte ecrit sur le point
  etiquette: (valeur: number) => string;
  marqueur?: "rond" | "carre" | "losange";
  // decalage vertical de l'etiquette (negatif = au-dessus du point)
  decalage?: number;
};

export function GraphiqueLignes({
  categories,
  series,
  yMax,
  yPas,
  formatY,
  largeur = 1600,
  hauteur = 780,
  tailleEtiquette = 17,
  couleurEtiquette = "#6f6f6f",
}: {
  // lignes de texte de chaque categorie ; null = espace vide (ex: entre 2025 et 2026)
  categories: (string[] | null)[];
  series: SerieGraphique[];
  yMax: number;
  yPas: number;
  formatY: (valeur: number) => string;
  largeur?: number;
  hauteur?: number;
  tailleEtiquette?: number;
  couleurEtiquette?: string;
}) {
  const margeGauche = 96;
  const margeDroite = 36;
  const margeBas = 84;

  // legende : on remplit les lignes une a une
  const tailleLegende = 17;
  const largeurTexte = (texte: string) => texte.length * tailleLegende * 0.56;
  const lignesLegende: { serie: SerieGraphique; x: number; ligne: number }[] = [];
  {
    let x = margeGauche;
    let ligne = 0;
    for (const serie of series) {
      const w = 52 + largeurTexte(serie.nom) + 26;
      if (x + w > largeur - margeDroite && x > margeGauche) {
        x = margeGauche;
        ligne++;
      }
      lignesLegende.push({ serie, x, ligne });
      x += w;
    }
  }
  const nbLignesLegende = Math.max(...lignesLegende.map((l) => l.ligne)) + 1;
  const margeHaut = 34 + nbLignesLegende * 34;
  const largeurZone = largeur - margeGauche - margeDroite;
  const hauteurZone = hauteur - margeHaut - margeBas;
  const n = categories.length;
  const pas = largeurZone / n;
  const xCentre = (i: number) => margeGauche + (i + 0.5) * pas;
  const y = (valeur: number) => margeHaut + hauteurZone - (valeur / yMax) * hauteurZone;
  const graduations: number[] = [];
  for (let v = 0; v <= yMax + 1e-9; v += yPas) graduations.push(v);

  function Marqueur({ x, yy, couleur, forme, taille }: { x: number; yy: number; couleur: string; forme: SerieGraphique["marqueur"]; taille: number }) {
    if (forme === "carre") return <rect x={x - taille} y={yy - taille} width={taille * 2} height={taille * 2} fill={couleur} />;
    if (forme === "losange")
      return <polygon points={`${x},${yy - taille * 1.25} ${x + taille * 1.25},${yy} ${x},${yy + taille * 1.25} ${x - taille * 1.25},${yy}`} fill={couleur} />;
    return <circle cx={x} cy={yy} r={taille} fill={couleur} />;
  }

  return (
    <svg viewBox={`0 0 ${largeur} ${hauteur}`} role="img" style={{ display: "block", width: "100%", height: "auto", fontFamily: POLICE }}>
      {/* legende */}
      {lignesLegende.map(({ serie, x, ligne }) => (
        <g key={serie.cle}>
          <line x1={x} x2={x + 40} y1={26 + ligne * 34} y2={26 + ligne * 34} stroke={serie.couleur} strokeWidth={3.5} />
          <Marqueur x={x + 20} yy={26 + ligne * 34} couleur={serie.couleur} forme={serie.marqueur} taille={6} />
          <text x={x + 50} y={26 + ligne * 34 + 6} fontSize={tailleLegende} fill="#404040">
            {serie.nom}
          </text>
        </g>
      ))}

      {/* grille */}
      {graduations.map((v) => (
        <g key={v}>
          <line x1={margeGauche} x2={largeur - margeDroite} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#9a9a9a" : "#e1e1e1"} strokeWidth={v === 0 ? 1.5 : 1} />
          <text x={margeGauche - 12} y={y(v) + 6} textAnchor="end" fontSize={17} fill="#6b6b6b">
            {formatY(v)}
          </text>
        </g>
      ))}
      {Array.from({ length: n + 1 }, (_, i) => (
        <line key={i} x1={margeGauche + i * pas} x2={margeGauche + i * pas} y1={margeHaut} y2={margeHaut + hauteurZone} stroke="#e8e8e8" strokeWidth={1} />
      ))}

      {/* categories */}
      {categories.map((lignes, i) =>
        lignes ? (
          <text key={i} x={xCentre(i)} y={margeHaut + hauteurZone + 26} textAnchor="middle" fontSize={16} fill="#555">
            {lignes.map((ligne, k) => (
              <tspan key={k} x={xCentre(i)} dy={k === 0 ? 0 : 20}>
                {ligne}
              </tspan>
            ))}
          </text>
        ) : null
      )}

      {/* courbes */}
      {series.map((serie) => {
        const segments: { i: number; v: number }[][] = [];
        let courant: { i: number; v: number }[] = [];
        serie.valeurs.forEach((v, i) => {
          if (v === null || v === undefined || Number.isNaN(v)) {
            if (courant.length) segments.push(courant);
            courant = [];
          } else {
            courant.push({ i, v });
          }
        });
        if (courant.length) segments.push(courant);
        return (
          <g key={serie.cle}>
            {segments.map((segment, k) => (
              <polyline
                key={k}
                points={segment.map((p) => `${xCentre(p.i)},${y(p.v)}`).join(" ")}
                fill="none"
                stroke={serie.couleur}
                strokeWidth={3.5}
                strokeLinejoin="round"
              />
            ))}
            {segments.flat().map((p) => (
              <Marqueur key={p.i} x={xCentre(p.i)} yy={y(p.v)} couleur={serie.couleur} forme={serie.marqueur} taille={6.5} />
            ))}
          </g>
        );
      })}

      {/* valeurs ecrites sur les points (au-dessus de tous les traits) */}
      {series.map((serie) =>
        serie.valeurs.map((v, i) =>
          v === null || v === undefined || Number.isNaN(v) ? null : (
            <text
              key={`${serie.cle}-${i}`}
              x={xCentre(i)}
              y={y(v) + (serie.decalage ?? -16)}
              textAnchor="middle"
              fontSize={tailleEtiquette}
              fontWeight={700}
              fill={couleurEtiquette}
              stroke="#ffffff"
              strokeWidth={4}
              paintOrder="stroke"
            >
              {serie.etiquette(v)}
            </text>
          )
        )
      )}
    </svg>
  );
}
