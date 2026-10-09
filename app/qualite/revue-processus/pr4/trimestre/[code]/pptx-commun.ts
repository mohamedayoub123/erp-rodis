import type PptxGenJS from "pptxgenjs";

// Aides communes a la generation du PowerPoint du rapport de revue de processus PR4 : decor des diapositives,
// polygones, traits (liaisons avec fleche) et conversions d'unites. Tout est dessine avec de VRAIS objets PowerPoint
// (formes, traits, tableaux, graphiques) : le fichier reste modifiable et net a tout zoom.

export const LARGEUR = 13.333; // pouces (16/9)
export const HAUTEUR = 7.5;
export const POLICE = "Century Gothic";
export const POLICE_SURE = "Arial";
export const BLEU = "4472C4";

export type Pt = [number, number];

// Polygone a partir de points ABSOLUS en pouces
export function polygone(
  slide: PptxGenJS.Slide,
  pres: PptxGenJS,
  points: Pt[],
  options: { fill: string; transparence?: number; ligne?: string; epaisseurLigne?: number; texte?: string; police?: Partial<PptxGenJS.TextPropsOptions> }
) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const w = Math.max(0.01, Math.max(...xs) - x);
  const h = Math.max(0.01, Math.max(...ys) - y);
  const pts = points.map(([px, py], i) => ({ x: px - x, y: py - y, moveTo: i === 0 })) as unknown as PptxGenJS.ShapeProps["points"];
  const formeSurMesure = {
    x,
    y,
    w,
    h,
    points: [...(pts as object[]), { close: true }] as unknown as PptxGenJS.ShapeProps["points"],
    fill: { color: options.fill, transparency: options.transparence ?? 0 },
    line: options.ligne ? { color: options.ligne, width: options.epaisseurLigne ?? 0.75 } : { type: "none" },
  } as PptxGenJS.ShapeProps;
  if (options.texte) {
    slide.addText(options.texte, {
      ...(formeSurMesure as unknown as PptxGenJS.TextPropsOptions),
      shape: (pres.ShapeType as unknown as Record<string, PptxGenJS.SHAPE_NAME>).custGeom,
      align: "center",
      valign: "middle",
      margin: 0,
      ...(options.police ?? {}),
    } as PptxGenJS.TextPropsOptions);
  } else {
    slide.addShape((pres.ShapeType as unknown as Record<string, PptxGenJS.SHAPE_NAME>).custGeom, formeSurMesure);
  }
}

// Decor des diapositives (triangle bleu a gauche, bandes orange / bleues a droite) - memes formes que la page web.
export function decor(slide: PptxGenJS.Slide, pres: PptxGenJS, variante: "garde" | "contenu" | "leger") {
  const ex = LARGEUR / 2000;
  const ey = HAUTEUR / 1123;
  const p = (liste: [number, number][]): Pt[] => liste.map(([x, y]) => [x * ex, y * ey]);
  if (variante === "garde") polygone(slide, pres, p([[5, 0], [142, 0], [5, 925]]), { fill: "6288CE" });
  else polygone(slide, pres, p([[0, 645], [72, 1123], [0, 1123]]), { fill: "6288CE" });
  if (variante === "leger") return;
  polygone(slide, pres, p([[1625, 250], [1845, 835], [1500, 1123], [1535, 1010]]), { fill: "C9D6EF" });
  polygone(slide, pres, p([[1535, 0], [1800, 0], [1835, 830]]), { fill: "C9824F" });
  polygone(slide, pres, p([[1800, 0], [1965, 0], [1840, 830]]), { fill: "6F78A0" });
  polygone(slide, pres, p([[1925, 0], [2000, 0], [2000, 600], [1835, 835]]), { fill: "5B82C6" });
  polygone(slide, pres, p([[1470, 1123], [1860, 690], [1905, 830], [1700, 1123]]), { fill: "E0955F", transparence: 8 });
  polygone(slide, pres, p([[2000, 590], [2000, 1123], [1710, 1123]]), { fill: "4A74C6" });
}

// Titre d'une diapositive (en haut a gauche, bleu leger)
export function titre(slide: PptxGenJS.Slide, texte: string, options: { taille?: number; x?: number; w?: number; align?: "left" | "center" } = {}) {
  slide.addText(texte, {
    x: options.x ?? 0.5,
    y: 0.25,
    w: options.w ?? 9,
    h: 0.7,
    fontFace: POLICE,
    fontSize: options.taille ?? 32,
    color: BLEU,
    align: options.align ?? "left",
    valign: "middle",
    margin: 0,
  });
}

// Segment limite a un rectangle (Liang-Barsky) : null si le segment est entierement dehors
export function couper(a: Pt, b: Pt, rect: { x0: number; y0: number; x1: number; y1: number }): [Pt, Pt] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const tests: [number, number][] = [
    [-dx, a[0] - rect.x0],
    [dx, rect.x1 - a[0]],
    [-dy, a[1] - rect.y0],
    [dy, rect.y1 - a[1]],
  ];
  for (const [p, q] of tests) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
}

// Trace une polyligne en pouces (segment par segment) ; la fleche est mise sur le dernier segment
export function trace(
  slide: PptxGenJS.Slide,
  pres: PptxGenJS,
  points: Pt[],
  options: { couleur: string; epaisseur?: number; fleche?: boolean; tirets?: boolean; ouverte?: boolean; cadre?: { x0: number; y0: number; x1: number; y1: number } }
) {
  for (let i = 0; i < points.length - 1; i++) {
    let a = points[i];
    let b = points[i + 1];
    if (options.cadre) {
      const coupe = couper(a, b, options.cadre);
      if (!coupe) continue;
      [a, b] = coupe;
    }
    const x = Math.min(a[0], b[0]);
    const y = Math.min(a[1], b[1]);
    const w = Math.abs(b[0] - a[0]);
    const h = Math.abs(b[1] - a[1]);
    if (w < 0.002 && h < 0.002) continue;
    const dernier = i === points.length - 2;
    slide.addShape(pres.ShapeType.line, {
      x,
      y,
      w,
      h,
      flipH: b[0] < a[0],
      flipV: b[1] < a[1],
      line: {
        color: options.couleur,
        width: options.epaisseur ?? 1,
        dashType: options.tirets ? "dash" : "solid",
        endArrowType: dernier && options.fleche ? (options.ouverte ? "arrow" : "triangle") : undefined,
      },
    } as PptxGenJS.ShapeProps);
  }
}
