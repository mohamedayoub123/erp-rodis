import type PptxGenJS from "pptxgenjs";
import { FORMES_ORGANIGRAMME, LIENS_ORGANIGRAMME, ZONES_ORGANIGRAMME } from "./organigramme-donnees";
import type { DiagrammeProc, NoeudProc } from "./procedures-donnees";
import { HAUTEUR, LARGEUR, POLICE_SURE, polygone, titre, trace, type Pt } from "./pptx-commun";

// Dessin de l'organigramme et des schemas de procedures avec de vrais objets PowerPoint (formes + traits).

type Rect = { x: number; y: number; w: number; h: number };

function placement(vue: Rect, zone: Rect) {
  const echelle = Math.min(zone.w / vue.w, zone.h / vue.h);
  const ox = zone.x + (zone.w - vue.w * echelle) / 2;
  const oy = zone.y + (zone.h - vue.h * echelle) / 2;
  const convertir = (x: number, y: number): Pt => [ox + (x - vue.x) * echelle, oy + (y - vue.y) * echelle];
  return { echelle, convertir };
}

// ---------------------------------------------------------------- organigramme
const BORNES_ORG = (() => {
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

function dessinerOrganigramme(pres: PptxGenJS, slide: PptxGenJS.Slide, vue: Rect, zone: Rect, epaisseur: number) {
  const { echelle, convertir } = placement(vue, zone);
  const cadre = { x0: zone.x - 0.05, y0: zone.y - 0.05, x1: zone.x + zone.w + 0.05, y1: zone.y + zone.h + 0.05 };

  const tol = 14;
  const dedans = (x: number, y: number) => x >= vue.x - tol && x <= vue.x + vue.w + tol && y >= vue.y - tol && y <= vue.y + vue.h + tol;
  const longueur = (pts: [number, number][], seulementDedans: boolean) => {
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      if (seulementDedans && !(dedans(pts[i][0], pts[i][1]) && dedans(pts[i + 1][0], pts[i + 1][1]))) continue;
      total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    }
    return total;
  };

  // liaisons d abord (derriere les formes) : seulement celles qui concernent cette zone, sans fleche orpheline
  for (const lien of LIENS_ORGANIGRAMME) {
    const total = longueur(lien.pts, false);
    if (total <= 0 || longueur(lien.pts, true) / total < 0.6) continue;
    const dernier = lien.pts[lien.pts.length - 1];
    // une fleche dont la case cible est hors de la zone n est pas dessinee (pas de trait orphelin)
    if (lien.fleche && !dedans(dernier[0], dernier[1])) continue;
    trace(slide, pres, lien.pts.map(([x, y]) => convertir(x, y)), {
      couleur: lien.couleur === "noir" ? "1B1B1B" : "4A72C0",
      epaisseur,
      fleche: lien.fleche && dedans(dernier[0], dernier[1]),
      tirets: lien.tirets,
      cadre,
    });
  }

  for (const f of FORMES_ORGANIGRAMME) {
    // une forme n est dessinee que si elle tient ENTIEREMENT dans la zone
    if (!dedans(f.x, f.y) || !dedans(f.x + f.w, f.y + f.h)) continue;
    const [x, y] = convertir(f.x, f.y);
    const w = f.w * echelle;
    const h = f.h * echelle;
    const texte = f.lignes.join("\n");
    const taillePt = Math.max(2, f.taille * echelle * 72);
    const commun = {
      fontFace: POLICE_SURE,
      fontSize: taillePt,
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
        rectRadius: Math.min(((f.rayon ?? 6) * echelle), Math.min(w, h) / 2),
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

// Diapositive d'ensemble + une diapositive par grande zone (texte lisible a l'ecran)
export function ajouterOrganigramme(pres: PptxGenJS, nouvelleDiapo: () => PptxGenJS.Slide) {
  const ensemble = nouvelleDiapo();
  titre(ensemble, "Organigramme");
  dessinerOrganigramme(pres, ensemble, BORNES_ORG, { x: 0.25, y: 1.0, w: LARGEUR - 0.5, h: HAUTEUR - 1.2 }, 0.75);

  for (const zone of ZONES_ORGANIGRAMME) {
    const diapo = nouvelleDiapo();
    titre(diapo, `Organigramme – ${zone.nom}`, { taille: 24, w: 12 });
    dessinerOrganigramme(
      pres,
      diapo,
      { x: zone.x - 10, y: zone.y - 10, w: zone.w + 20, h: zone.h + 20 },
      { x: 0.25, y: 1.0, w: LARGEUR - 0.5, h: HAUTEUR - 1.2 },
      1.25
    );
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

export function ajouterProcedure(pres: PptxGenJS, slide: PptxGenJS.Slide, d: DiagrammeProc) {
  const [vx, vy, vw, vh] = d.vue;
  const theme = THEMES[d.theme];
  // schema haut et etroit : titre a gauche, schema sur toute la hauteur (texte plus grand)
  const haut = vw / vh < 0.8;
  if (haut) {
    slide.addText(d.titre, { x: 0.4, y: 0.4, w: 3.2, h: 1.6, fontFace: "Century Gothic", fontSize: 26, color: "4472C4", valign: "top", margin: 0 });
  } else {
    titre(slide, d.titre);
  }
  const zone: Rect = haut ? { x: 3.7, y: 0.2, w: LARGEUR - 4.2, h: HAUTEUR - 0.4 } : { x: 0.4, y: 1.0, w: LARGEUR - 0.8, h: HAUTEUR - 1.2 };
  const { echelle, convertir } = placement({ x: vx, y: vy, w: vw, h: vh }, zone);

  for (const lien of d.liens) {
    trace(slide, pres, lien.pts.map(([x, y]) => convertir(x, y)), {
      couleur: (lien.couleur ?? `#${theme.lien}`).replace("#", "").toUpperCase(),
      epaisseur: theme.epaisseur,
      fleche: lien.fleche,
      ouverte: theme.ouverte,
    });
  }

  for (const n of d.noeuds) {
    const special = n.style ? SPECIAUX[n.style] : null;
    const [x1, y1] = convertir(n.x1, n.y1);
    const [x2, y2] = convertir(n.x2, n.y2);
    const x = x1;
    const y = y1;
    const w = x2 - x1;
    const h = y2 - y1;
    const taillePt = Math.max(3, (n.taille ?? d.taille) * echelle * 72);
    const commun = {
      fontFace: POLICE_SURE,
      fontSize: taillePt,
      color: special ? special.texte : theme.texte,
      align: (n.alignement === "gauche" ? "left" : "center") as "left" | "center",
      valign: "middle" as const,
      margin: (n.alignement === "gauche" ? [0, 0, 0, 6] : 0) as number | [number, number, number, number],
    };
    const fill = { color: special ? "FFFFFF" : theme.fond };
    const ligne = { color: special ? special.trait : theme.trait, width: d.theme === "noir" ? 2 : 1.25 };
    const texte = n.lignes.join("\n");
    switch (n.forme) {
      case "ellipse":
        slide.addText(texte, { shape: pres.ShapeType.ellipse, x, y, w, h, fill, line: ligne, ...commun });
        break;
      case "losange":
        slide.addText(texte, { shape: pres.ShapeType.diamond, x, y, w, h, fill, line: ligne, ...commun });
        break;
      case "arrondi":
        slide.addText(texte, { shape: pres.ShapeType.roundRect, rectRadius: Math.min(0.25, h / 2), x, y, w, h, fill, line: ligne, ...commun });
        break;
      case "etoile":
        polygone(slide, pres, pointsEtoile(n).map(([px, py]) => convertir(px, py)), { fill: "FFFFFF", ligne: ligne.color, epaisseurLigne: 1.25, texte, police: commun as Partial<PptxGenJS.TextPropsOptions> });
        break;
      case "engrenage":
        polygone(slide, pres, pointsEngrenage(n).map(([px, py]) => convertir(px, py)), { fill: "FFFFFF", ligne: ligne.color, epaisseurLigne: 1.25, texte, police: commun as Partial<PptxGenJS.TextPropsOptions> });
        break;
      case "chevron": {
        const cy = (n.y1 + n.y2) / 2;
        const largeur = n.x2 - n.x1;
        polygone(slide, pres, [[n.x1, n.y1], [n.x2, cy], [n.x1, n.y2], [n.x1 + largeur * 0.5, cy]].map(([px, py]) => convertir(px, py)), { fill: "FFFFFF", ligne: ligne.color, epaisseurLigne: 1.25 });
        break;
      }
      default:
        slide.addText(texte, { shape: pres.ShapeType.rect, x, y, w, h, fill, line: ligne, ...commun });
    }
  }

  for (const e of d.etiquettes) {
    const [x, y] = convertir(e.x, e.y);
    const taillePt = Math.max(4, (e.taille ?? d.taille) * echelle * 72);
    slide.addText(e.texte, {
      x: x - 0.6,
      y: y - taillePt / 72,
      w: 1.2,
      h: (taillePt / 72) * 1.4,
      align: "center",
      valign: "middle",
      fontFace: POLICE_SURE,
      fontSize: taillePt,
      bold: e.gras,
      color: (e.couleur ?? `#${theme.texte}`).replace("#", "").toUpperCase(),
      margin: 0,
    });
  }
}
