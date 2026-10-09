"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FORMES_ORGANIGRAMME, SEGMENTS_ORGANIGRAMME, ZONES_ORGANIGRAMME } from "./organigramme-donnees";

// Organigramme redessine en vectoriel (formes, couleurs et noms de l'organigramme d'origine) : les noms restent
// nets a n'importe quel zoom. Au depart il est affiche EN ENTIER sur toute la largeur, sans defilement. Les boutons
// +/- et les zones permettent d'agrandir (on le deplace alors en le faisant glisser), "Tout voir" revient a la vue
// complete ; plein ecran disponible.
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 6;
const MARGE = 10;
const NOIR = "#1b1b1b";
const BLEU = "#4a72c0";
const POLICE = 'Arial, "Helvetica Neue", Helvetica, sans-serif';

// Cadre serre autour du dessin (le schema d'origine avait de grandes marges vides)
const BORNES = (() => {
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
  for (const s of SEGMENTS_ORGANIGRAMME) {
    if (s.o === "h") {
      x0 = Math.min(x0, s.a);
      x1 = Math.max(x1, s.b);
      y0 = Math.min(y0, s.p);
      y1 = Math.max(y1, s.p);
    } else {
      y0 = Math.min(y0, s.a);
      y1 = Math.max(y1, s.b);
      x0 = Math.min(x0, s.p);
      x1 = Math.max(x1, s.p);
    }
  }
  return { x: x0 - MARGE, y: y0 - MARGE, w: x1 - x0 + 2 * MARGE, h: y1 - y0 + 2 * MARGE };
})();

function limiter(zoom: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

export function Organigramme() {
  const conteneur = useRef<HTMLDivElement>(null);
  const zone = useRef<HTMLDivElement>(null);
  const glisse = useRef<{ x: number; y: number; gauche: number; haut: number } | null>(null);
  // null = vue complete (ajustee a la largeur, sans defilement)
  const [zoom, setZoom] = useState<number | null>(null);
  const [largeurZone, setLargeurZone] = useState(0);
  const [pleinEcran, setPleinEcran] = useState(false);

  const ajuste = largeurZone > 0 ? largeurZone / BORNES.w : 1;
  const zoomActuel = zoom ?? ajuste;

  useEffect(() => {
    const element = zone.current;
    if (!element) return;
    const observateur = new ResizeObserver((entrees) => {
      for (const entree of entrees) setLargeurZone(entree.contentRect.width);
    });
    observateur.observe(element);
    return () => observateur.disconnect();
  }, []);

  useEffect(() => {
    const suivre = () => setPleinEcran(document.fullscreenElement === conteneur.current);
    document.addEventListener("fullscreenchange", suivre);
    return () => document.removeEventListener("fullscreenchange", suivre);
  }, []);

  // Zoom en gardant le meme point du schema au centre de la fenetre
  const appliquerZoom = useCallback(
    (nouveau: number, centre?: { x: number; y: number }) => {
      const fenetre = zone.current;
      if (!fenetre) return;
      const z = limiter(nouveau);
      const cx = centre?.x ?? BORNES.x + (fenetre.scrollLeft + fenetre.clientWidth / 2) / zoomActuel;
      const cy = centre?.y ?? BORNES.y + (fenetre.scrollTop + fenetre.clientHeight / 2) / zoomActuel;
      setZoom(z);
      requestAnimationFrame(() => {
        fenetre.scrollLeft = (cx - BORNES.x) * z - fenetre.clientWidth / 2;
        fenetre.scrollTop = (cy - BORNES.y) * z - fenetre.clientHeight / 2;
      });
    },
    [zoomActuel]
  );

  const allerA = useCallback(
    (cible: { x: number; y: number; w: number; h: number }) => {
      const fenetre = zone.current;
      if (!fenetre) return;
      const hauteurVue = pleinEcran ? window.innerHeight - 88 : window.innerHeight * 0.78;
      const z = Math.min(4, fenetre.clientWidth / (cible.w + 30), hauteurVue / (cible.h + 30));
      appliquerZoom(Math.max(ajuste, z), { x: cible.x + cible.w / 2, y: cible.y + cible.h / 2 });
    },
    [appliquerZoom, ajuste, pleinEcran]
  );

  function basculerPleinEcran() {
    const element = conteneur.current;
    if (!element) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void element.requestFullscreen?.();
  }

  const bouton =
    "rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:text-violet-700";
  const hauteurSvg = BORNES.h * zoomActuel;
  const limiteHauteur = pleinEcran ? "calc(100vh - 88px)" : "78vh";

  return (
    <div ref={conteneur} className={`flex flex-col gap-3 bg-white ${pleinEcran ? "h-screen p-4" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={bouton} onClick={() => appliquerZoom(zoomActuel / 1.25)} aria-label="Reduire">
          −
        </button>
        <span className="w-14 text-center text-sm font-semibold text-slate-600">
          {largeurZone > 0 ? `${Math.round(zoomActuel * 100)} %` : ""}
        </span>
        <button type="button" className={bouton} onClick={() => appliquerZoom(zoomActuel * 1.25)} aria-label="Agrandir">
          +
        </button>
        <button type="button" className={bouton} onClick={() => setZoom(null)}>
          Tout voir
        </button>
        <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" aria-hidden="true" />
        {ZONES_ORGANIGRAMME.map((z) => (
          <button key={z.nom} type="button" className={bouton} onClick={() => allerA(z)}>
            Agrandir : {z.nom}
          </button>
        ))}
        <button type="button" className={`${bouton} ml-auto`} onClick={basculerPleinEcran}>
          {pleinEcran ? "Quitter le plein écran" : "Plein écran"}
        </button>
      </div>

      <div
        ref={zone}
        className={`overflow-auto rounded-2xl border border-slate-200 bg-white ${zoom === null ? "" : "cursor-grab active:cursor-grabbing"}`}
        style={zoom === null ? undefined : { height: `min(${hauteurSvg + 2}px, ${limiteHauteur})`, touchAction: "pan-x pan-y" }}
        onPointerDown={(event) => {
          if (zoom === null || event.pointerType === "touch") return;
          const fenetre = zone.current;
          if (!fenetre) return;
          glisse.current = { x: event.clientX, y: event.clientY, gauche: fenetre.scrollLeft, haut: fenetre.scrollTop };
          fenetre.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const depart = glisse.current;
          const fenetre = zone.current;
          if (!depart || !fenetre) return;
          fenetre.scrollLeft = depart.gauche - (event.clientX - depart.x);
          fenetre.scrollTop = depart.haut - (event.clientY - depart.y);
        }}
        onPointerUp={() => {
          glisse.current = null;
        }}
        onPointerCancel={() => {
          glisse.current = null;
        }}
      >
        <svg
          viewBox={`${BORNES.x} ${BORNES.y} ${BORNES.w} ${BORNES.h}`}
          width={zoom === null ? "100%" : BORNES.w * zoom}
          height={zoom === null ? undefined : BORNES.h * zoom}
          role="img"
          aria-label="Organigramme"
          style={{ display: "block", height: zoom === null ? "auto" : undefined, fontFamily: POLICE }}
        >
          {/* Connecteurs (derriere les formes) */}
          <g strokeLinecap="butt" fill="none">
            {SEGMENTS_ORGANIGRAMME.map((s, i) => {
              const couleur = s.c === "noir" ? NOIR : BLEU;
              const tracer = s.o === "v" ? { x1: s.p, y1: s.a, x2: s.p, y2: s.b } : { x1: s.a, y1: s.p, x2: s.b, y2: s.p };
              return <line key={i} {...tracer} stroke={couleur} strokeWidth={1.3} />;
            })}
          </g>
          <g>
            {SEGMENTS_ORGANIGRAMME.flatMap((s, i) => {
              const couleur = s.c === "noir" ? NOIR : BLEU;
              const fleches: React.ReactNode[] = [];
              if (s.o === "v") {
                if (s.fb) fleches.push(<polygon key={`${i}b`} points={`${s.p - 3.2},${s.b - 3} ${s.p + 3.2},${s.b - 3} ${s.p},${s.b + 3.5}`} fill={couleur} />);
                if (s.fa) fleches.push(<polygon key={`${i}a`} points={`${s.p - 3.2},${s.a + 3} ${s.p + 3.2},${s.a + 3} ${s.p},${s.a - 3.5}`} fill={couleur} />);
              } else {
                if (s.fb) fleches.push(<polygon key={`${i}b`} points={`${s.b - 3},${s.p - 3.2} ${s.b - 3},${s.p + 3.2} ${s.b + 3.5},${s.p}`} fill={couleur} />);
                if (s.fa) fleches.push(<polygon key={`${i}a`} points={`${s.a + 3},${s.p - 3.2} ${s.a + 3},${s.p + 3.2} ${s.a - 3.5},${s.p}`} fill={couleur} />);
              }
              return fleches;
            })}
          </g>

          {/* Formes + noms */}
          {FORMES_ORGANIGRAMME.map((f) => {
            const style = { fill: f.fill, stroke: f.stroke, strokeWidth: 0.8 };
            const debutY = f.centreY - ((f.lignes.length - 1) * f.taille * 1.16) / 2 + f.taille * 0.35;
            return (
              <g key={f.id}>
                <title>{f.texte}</title>
                {f.forme === "polygone" && f.points ? (
                  <polygon points={f.points.map((p) => p.join(",")).join(" ")} {...style} />
                ) : f.forme === "ellipse" ? (
                  <ellipse cx={f.x + f.w / 2} cy={f.y + f.h / 2} rx={f.w / 2} ry={f.h / 2} {...style} />
                ) : f.forme === "cylindre" ? (
                  <>
                    <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={5} {...style} />
                    <ellipse cx={f.x + f.w - 5} cy={f.y + f.h / 2} rx={5} ry={f.h / 2} fill="none" stroke={f.stroke} strokeWidth={0.8} />
                  </>
                ) : (
                  <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={f.rayon ?? 0} {...style} />
                )}
                <text x={f.centreX} y={debutY} textAnchor="middle" fontSize={f.taille} fontWeight={700} fill={f.texteCouleur}>
                  {f.lignes.map((ligne, i) => (
                    <tspan key={i} x={f.centreX} dy={i === 0 ? 0 : f.taille * 1.16}>
                      {ligne}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-xs text-slate-500">
        Tout l&apos;organigramme est visible. Pour lire de plus près : boutons +, − ou « Agrandir » une zone (puis faire glisser le schéma).
      </p>
    </div>
  );
}
