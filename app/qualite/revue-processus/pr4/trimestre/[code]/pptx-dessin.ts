import type PptxGenJS from "pptxgenjs";
import { FORMES_ORGANIGRAMME, LIENS_ORGANIGRAMME } from "./organigramme-donnees";
import type { DiagrammeProc, NoeudProc } from "./procedures-donnees";

// Dessin de l'organigramme et des schemas de procedures de l'ERP avec de VRAIS objets PowerPoint (formes, textes,
// traits avec fleches) : nets a tout zoom, modifiables, et places dans le rectangle voulu de la diapositive.
export type Pt = [number, number];
export type Rect = { x: number; y: number; w: number; h: number };

const POLICE = "Arial";
const formeDe = (pres: PptxGenJS) => pres.ShapeType as unknown as Record<string, PptxGenJS.SHAPE_NAME>;

// Place la zone [vue] du dessin dans le rectangle [zone] (sans deformer, centre)
function placement(vue: Rect, zone: Rect) {
  const echelle = Math.min(zone.w / vue.w, zone.h / vue.h);
  const ox = zone.x + (zone.w - vue.w * echelle) / 2;
  const oy = zone.y + (zone.h - vue.h * echelle) / 2;
  const convertir = (x: number, y: number): Pt => [ox + (x - vue.x) * echelle, oy + (y - vue.y) * echelle];
  return { echelle, convertir };
}

// Polygone a partir de points ABSOLUS en pouces
function polygone(
  slide: PptxGenJS.Slide,
  pres: PptxGenJS,
  points: Pt[],
  options: { fill: string; ligne?: string; epaisseurLigne?: number; texte?: string; police?: Partial<PptxGenJS.TextPropsOptions> }
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
    fill: { color: options.fill },
    line: options.ligne ? { color: options.ligne, width: options.epaisseurLigne ?? 0.75 } : { type: "none" },
  } as PptxGenJS.ShapeProps;
  if (options.texte) {
    slide.addText(options.texte, {
      ...(formeSurMesure as unknown as PptxGenJS.TextPropsOptions),
      shape: formeDe(pres).custGeom,
      align: "center",
      valign: "middle",
      margin: 0,
      ...(options.police ?? {}),
    } as PptxGenJS.TextPropsOptions);
  } else {
    slide.addShape(formeDe(pres).custGeom, formeSurMesure);
  }
}

// Segment limite a un rectangle (Liang-Barsky) : null si le segment est entierement dehors
function couper(a: Pt, b: Pt, rect: { x0: number; y0: number; x1: number; y1: number }): [Pt, Pt] | null {
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

// Polyligne en pouces (segment par segment) ; la fleche est sur le dernier segment
function trace(
  slide: PptxGenJS.Slide,
  pres: PptxGenJS,
  points: Pt[],
  options: { couleur: string; epaisseur: number; fleche?: boolean; tirets?: boolean; ouverte?: boolean; cadre?: { x0: number; y0: number; x1: number; y1: number } }
) {
  for (let i = 0; i < points.length - 1; i++) {
    let a = points[i];
    let b = points[i + 1];
    if (options.cadre) {
      const coupe = couper(a, b, options.cadre);
      if (!coupe) continue;
      [a, b] = coupe;
    }
    const w = Math.abs(b[0] - a[0]);
    const h = Math.abs(b[1] - a[1]);
    if (w < 0.002 && h < 0.002) continue;
    const dernier = i === points.length - 2;
    slide.addShape(pres.ShapeType.line, {
      x: Math.min(a[0], b[0]),
      y: Math.min(a[1], b[1]),
      w,
      h,
      flipH: b[0] < a[0],
      flipV: b[1] < a[1],
      line: {
        color: options.couleur,
        width: options.epaisseur,
        dashType: options.tirets ? "dash" : "solid",
        endArrowType: dernier && options.fleche ? (options.ouverte ? "arrow" : "triangle") : undefined,
      },
    } as PptxGenJS.ShapeProps);
  }
}

// ---------------------------------------------------------------- organigramme
const BORNES_ORG: Rect = (() => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const f of FORMES_ORGANIGRAMME) {
    x0 = Math.min(x0, f.x);
    y0 = Math.min(y0, f.y);
    x1 = Math.max(x1, f.x + f.w);
    y1 = Math.max(y1, f.y + f.h);
  }
  return { x: x0 - 8, y: y0 - 8, w: x1 - x0 + 16, h: y1 - y0 + 16 };
})();

// L'organigramme complet de l'ERP, dans le rectangle [zone]
export function dessinerOrganigramme(pres: PptxGenJS, slide: PptxGenJS.Slide, zone: Rect) {
  const { echelle, convertir } = placement(BORNES_ORG, zone);
  const cadre = { x0: zone.x - 0.05, y0: zone.y - 0.05, x1: zone.x + zone.w + 0.05, y1: zone.y + zone.h + 0.05 };

  // liaisons d'abord (derriere les cases)
  for (const lien of LIENS_ORGANIGRAMME) {
    trace(slide, pres, lien.pts.map(([x, y]) => convertir(x, y)), {
      couleur: lien.couleur === "noir" ? "1B1B1B" : "4A72C0",
      epaisseur: 0.75,
      fleche: lien.fleche,
      tirets: lien.tirets,
      cadre,
    });
  }

  for (const f of FORMES_ORGANIGRAMME) {
    const [x, y] = convertir(f.x, f.y);
    const w = f.w * echelle;
    const h = f.h * echelle;
    const texte = f.lignes.join("\n");
    const commun = {
      fontFace: POLICE,
      fontSize: Math.max(2, f.taille * echelle * 72),
      bold: true,
      color: f.texteCouleur.replace("#", "").toUpperCase(),
      align: "center" as const,
      valign: "middle" as const,
      margin: 0,
    };
    const fill = { color: f.fill.replace("#", "").toUpperCase() };
    const ligne = { color: f.stroke.replace("#", "").toUpperCase(), width: 0.75 };
    if (f.forme === "polygone" && f.points) {
      polygone(slide, pres, f.points.map(([px, py]) => convertir(px, py)), {
        fill: fill.color,
        ligne: ligne.color,
        epaisseurLigne: 0.75,
        texte,
        police: commun,
      });
    } else if (f.forme === "ellipse") {
      slide.addText(texte, { shape: pres.ShapeType.ellipse, x, y, w, h, fill, line: ligne, ...commun });
    } else if (f.forme === "arrondi" || f.forme === "cylindre") {
      slide.addText(texte, {
        shape: pres.ShapeType.roundRect,
        rectRadius: Math.min((f.rayon ?? 6) * echelle, Math.min(w, h) / 2),
        x,
        y,
        w,
        h,
        fill,
        line: ligne,
        ...commun,
      });
    } else {
      slide.addText(texte, { shape: pres.ShapeType.rect, x, y, w, h, fill, line: ligne, ...commun });
    }
  }
}

// ---------------------------------------------------------------- schemas de procedures
const THEMES = {
  noir: { trait: "111111", fond: "FFFFFF", texte: "111111", lien: "111111", epaisseur: 2, ouverte: true },
  orange: { trait: "F2A100", fond: "FFF4D6", texte: "1E1E1E", lien: "F2A100", epaisseur: 1.5, ouverte: false },
  bleu: { trait: "4472C4", fond: "FFFFFF", texte: "3B62B4", lien: "4472C4", epaisseur: 1.5, ouverte: false },
} as const;
const SPECIAUX = {
  vert: { trait: "70AD47", texte: "5F9A3A" },
  jaune: { trait: "FFC000", texte: "E0A500" },
} as const;

function pointsEtoile(n: NoeudProc): Pt[] {
  const cx = (n.x1 + n.x2) / 2;
  const cy = (n.y1 + n.y2) / 2;
  const re = Math.min(n.x2 - n.x1, n.y2 - n.y1) / 2;
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? re : re * 0.42;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt;
  });
}

function pointsEngrenage(n: NoeudProc): Pt[] {
  const cx = (n.x1 + n.x2) / 2;
  const cy = (n.y1 + n.y2) / 2;
  const re = Math.min(n.x2 - n.x1, n.y2 - n.y1) / 2;
  const ri = re * 0.8;
  const pts: Pt[] = [];
  for (let i = 0; i < 8; i++) {
    const base = (i * 2 * Math.PI) / 8 - Math.PI / 2;
    const pas = (2 * Math.PI) / 8;
    for (const [f, r] of [[0.1, ri], [0.22, re], [0.5, re], [0.62, ri]] as const) {
      const a = base + pas * f;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return pts;
}

// Un schema de procedure de l'ERP, dans le rectangle [zone] (le titre n'est pas dessine ici)
export function dessinerProcedure(pres: PptxGenJS, slide: PptxGenJS.Slide, d: DiagrammeProc, zone: Rect) {
  const [vx, vy, vw, vh] = d.vue;
  const theme = THEMES[d.theme];
  const { echelle, convertir } = placement({ x: vx, y: vy, w: vw, h: vh }, zone);

  for (const lien of d.liens) {
    trace(slide, pres, lien.pts.map(([x, y]) => convertir(x, y)), {
      couleur: (lien.couleur ?? `#${theme.lien}`).replace("#", "").toUpperCase(),
      epaisseur: Math.max(0.5, theme.epaisseur * Math.min(1, echelle * 70)),
      fleche: lien.fleche,
      ouverte: theme.ouverte,
    });
  }

  for (const n of d.noeuds) {
    const special = n.style ? SPECIAUX[n.style] : null;
    const [x, y] = convertir(n.x1, n.y1);
    const [x2, y2] = convertir(n.x2, n.y2);
    const w = x2 - x;
    const h = y2 - y;
    const commun = {
      fontFace: POLICE,
      fontSize: Math.max(2, (n.taille ?? d.taille) * echelle * 72),
      color: special ? special.texte : theme.texte,
      align: (n.alignement === "gauche" ? "left" : "center") as "left" | "center",
      valign: "middle" as const,
      margin: (n.alignement === "gauche" ? [0, 0, 0, 3] : 0) as number | [number, number, number, number],
    };
    const fill = { color: special ? "FFFFFF" : theme.fond };
    const ligne = { color: special ? special.trait : theme.trait, width: Math.max(0.5, (d.theme === "noir" ? 2 : 1.25) * Math.min(1, echelle * 70)) };
    const texte = n.lignes.join("\n");
    switch (n.forme) {
      case "ellipse":
        slide.addText(texte, { shape: pres.ShapeType.ellipse, x, y, w, h, fill, line: ligne, ...commun });
        break;
      case "losange":
        slide.addText(texte, { shape: pres.ShapeType.diamond, x, y, w, h, fill, line: ligne, ...commun });
        break;
      case "arrondi":
        slide.addText(texte, { shape: pres.ShapeType.roundRect, rectRadius: Math.min(0.1, h / 2), x, y, w, h, fill, line: ligne, ...commun });
        break;
      case "etoile":
        polygone(slide, pres, pointsEtoile(n).map(([px, py]) => convertir(px, py)), { fill: "FFFFFF", ligne: ligne.color, epaisseurLigne: ligne.width, texte, police: commun as Partial<PptxGenJS.TextPropsOptions> });
        break;
      case "engrenage":
        polygone(slide, pres, pointsEngrenage(n).map(([px, py]) => convertir(px, py)), { fill: "FFFFFF", ligne: ligne.color, epaisseurLigne: ligne.width, texte, police: commun as Partial<PptxGenJS.TextPropsOptions> });
        break;
      case "chevron": {
        const cy = (n.y1 + n.y2) / 2;
        const largeur = n.x2 - n.x1;
        polygone(slide, pres, [[n.x1, n.y1], [n.x2, cy], [n.x1, n.y2], [n.x1 + largeur * 0.5, cy]].map(([px, py]) => convertir(px, py)), {
          fill: "FFFFFF",
          ligne: ligne.color,
          epaisseurLigne: ligne.width,
        });
        break;
      }
      default:
        slide.addText(texte, { shape: pres.ShapeType.rect, x, y, w, h, fill, line: ligne, ...commun });
    }
  }

  for (const e of d.etiquettes) {
    const [x, y] = convertir(e.x, e.y);
    const taillePt = Math.max(2, (e.taille ?? d.taille) * echelle * 72);
    slide.addText(e.texte, {
      x: x - 0.4,
      y: y - taillePt / 72,
      w: 0.8,
      h: (taillePt / 72) * 1.4,
      align: "center",
      valign: "middle",
      fontFace: POLICE,
      fontSize: taillePt,
      bold: e.gras,
      color: (e.couleur ?? `#${theme.texte}`).replace("#", "").toUpperCase(),
      margin: 0,
    });
  }
}
