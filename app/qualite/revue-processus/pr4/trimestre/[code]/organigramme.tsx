"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FORMES_ORGANIGRAMME,
  ORGANIGRAMME_HAUTEUR,
  ORGANIGRAMME_LARGEUR,
  SEGMENTS_ORGANIGRAMME,
  ZONES_ORGANIGRAMME,
} from "./organigramme-donnees";

// Organigramme redessine en vectoriel (formes, couleurs et noms de l'organigramme d'origine) : les noms restent
// nets a n'importe quel zoom. On le deplace en le faisant glisser ; boutons +/- et "Tout voir", un bouton par
// grande zone (zoom directement dessus) et un mode plein ecran.
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 6;
const ZOOM_DEPART = 2.2;
const NOIR = "#1b1b1b";
const BLEU = "#4a72c0";
const POLICE = 'Arial, "Helvetica Neue", Helvetica, sans-serif';

function limiter(zoom: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

export function Organigramme() {
  const conteneur = useRef<HTMLDivElement>(null);
  const zone = useRef<HTMLDivElement>(null);
  const glisse = useRef<{ x: number; y: number; gauche: number; haut: number } | null>(null);
  const [zoom, setZoom] = useState(ZOOM_DEPART);
  const [pleinEcran, setPleinEcran] = useState(false);

  // Zoom en gardant le meme point du schema au centre de la fenetre
  const appliquerZoom = useCallback((nouveau: number, centre?: { x: number; y: number }) => {
    const fenetre = zone.current;
    if (!fenetre) return;
    const z = limiter(nouveau);
    setZoom((ancien) => {
      const cx = centre?.x ?? (fenetre.scrollLeft + fenetre.clientWidth / 2) / ancien;
      const cy = centre?.y ?? (fenetre.scrollTop + fenetre.clientHeight / 2) / ancien;
      requestAnimationFrame(() => {
        fenetre.scrollLeft = cx * z - fenetre.clientWidth / 2;
        fenetre.scrollTop = cy * z - fenetre.clientHeight / 2;
      });
      return z;
    });
  }, []);

  const toutVoir = useCallback(() => {
    const fenetre = zone.current;
    if (!fenetre) return;
    appliquerZoom(Math.min(fenetre.clientWidth / (ORGANIGRAMME_LARGEUR + 20), fenetre.clientHeight / (ORGANIGRAMME_HAUTEUR + 20)), {
      x: ORGANIGRAMME_LARGEUR / 2,
      y: ORGANIGRAMME_HAUTEUR / 2,
    });
  }, [appliquerZoom]);

  const allerA = useCallback(
    (cible: { x: number; y: number; w: number; h: number }) => {
      const fenetre = zone.current;
      if (!fenetre) return;
      const z = Math.min(4, fenetre.clientWidth / (cible.w + 30), fenetre.clientHeight / (cible.h + 30));
      appliquerZoom(Math.max(1, z), { x: cible.x + cible.w / 2, y: cible.y + cible.h / 2 });
    },
    [appliquerZoom]
  );

  useEffect(() => {
    const suivre = () => setPleinEcran(document.fullscreenElement === conteneur.current);
    document.addEventListener("fullscreenchange", suivre);
    return () => document.removeEventListener("fullscreenchange", suivre);
  }, []);

  function basculerPleinEcran() {
    const element = conteneur.current;
    if (!element) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void element.requestFullscreen?.();
  }

  const bouton =
    "rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:text-violet-700";

  return (
    <div
      ref={conteneur}
      className={`flex flex-col gap-3 bg-white ${pleinEcran ? "h-screen p-4" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={bouton} onClick={() => appliquerZoom(zoom / 1.25)} aria-label="Reduire">
          −
        </button>
        <span className="w-14 text-center text-sm font-semibold text-slate-600">{Math.round(zoom * 100)} %</span>
        <button type="button" className={bouton} onClick={() => appliquerZoom(zoom * 1.25)} aria-label="Agrandir">
          +
        </button>
        <button type="button" className={bouton} onClick={toutVoir}>
          Tout voir
        </button>
        <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" aria-hidden="true" />
        {ZONES_ORGANIGRAMME.map((z) => (
          <button key={z.nom} type="button" className={bouton} onClick={() => allerA(z)}>
            {z.nom}
          </button>
        ))}
        <button type="button" className={`${bouton} ml-auto`} onClick={basculerPleinEcran}>
          {pleinEcran ? "Quitter le plein écran" : "Plein écran"}
        </button>
      </div>

      <div
        ref={zone}
        className="cursor-grab overflow-auto rounded-2xl border border-slate-200 bg-white active:cursor-grabbing"
        style={{ height: pleinEcran ? "calc(100vh - 88px)" : "min(78vh, 900px)", touchAction: "pan-x pan-y" }}
        onPointerDown={(event) => {
          if (event.pointerType === "touch") return; // au doigt, le defilement natif suffit
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
          viewBox={`0 0 ${ORGANIGRAMME_LARGEUR} ${ORGANIGRAMME_HAUTEUR}`}
          width={ORGANIGRAMME_LARGEUR * zoom}
          height={ORGANIGRAMME_HAUTEUR * zoom}
          role="img"
          aria-label="Organigramme"
          style={{ display: "block", fontFamily: POLICE }}
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
                <text
                  x={f.centreX}
                  y={debutY}
                  textAnchor="middle"
                  fontSize={f.taille}
                  fontWeight={700}
                  fill={f.texteCouleur}
                >
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
        Faites glisser le schéma pour le déplacer, ou utilisez les boutons pour agrandir une zone.
      </p>
    </div>
  );
}
