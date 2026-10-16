"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { avancementVoyage, routeGrandCercle } from "@/lib/geo-route";
import type { Lieu, PhaseSuivi } from "@/lib/suivi-conteneur";

export type MarqueurConteneur = {
  id: number;
  conteneur: string;
  dossier: string;
  phase: PhaseSuivi;
  navire: string | null;
  pol: Lieu | null;
  pod: Lieu | null;
  atd: string | null;
  eta: string | null;
  ata: string | null;
};

function aCoordonnees(lieu: Lieu | null): lieu is Lieu & { lat: number; lon: number } {
  return Boolean(lieu) && lieu!.lat !== null && lieu!.lon !== null;
}

// Carte (Leaflet + OpenStreetMap) des conteneurs suivis : port de depart, port d'arrivee, route, et le navire. La position du
// navire est ESTIMEE (avancement entre le depart reel et l'arrivee prevue le long de la route la plus courte) : le service de suivi
// n'envoie pas la position en direct. Le lien "Suivre le navire en direct" de chaque conteneur donne la vraie position.
export function CarteConteneurs({ marqueurs }: { marqueurs: MarqueurConteneur[] }) {
  const conteneur = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let carte: import("leaflet").Map | null = null;
    let annule = false;

    (async () => {
      const leafletModule = await import("leaflet");
      const L = ((leafletModule as unknown as { default?: typeof import("leaflet") }).default ?? leafletModule) as typeof import("leaflet");
      if (annule || !conteneur.current) return;

      carte = L.map(conteneur.current, { worldCopyJump: true, scrollWheelZoom: false, minZoom: 2 }).setView([10, 10], 2);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(carte);

      const points: [number, number][] = [];
      const portsDejaMarques = new Set<string>();

      const iconePort = (couleur: string) =>
        L.divIcon({
          className: "",
          html: `<div style="width:14px;height:14px;border-radius:9999px;background:${couleur};border:2px solid #fff;box-shadow:0 0 0 1px ${couleur}"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
      const iconeNavire = L.divIcon({
        className: "",
        html: '<div style="font-size:24px;line-height:24px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))">🚢</div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      for (const m of marqueurs) {
        const { pol, pod } = m;
        for (const [lieu, couleur] of [[pol, "#0f172a"], [pod, "#0369a1"]] as const) {
          if (!aCoordonnees(lieu)) continue;
          points.push([lieu.lat, lieu.lon]);
          const cle = `${lieu.lat},${lieu.lon}`;
          if (portsDejaMarques.has(cle)) continue;
          portsDejaMarques.add(cle);
          L.marker([lieu.lat, lieu.lon], { icon: iconePort(couleur) }).addTo(carte).bindTooltip(lieu.nom);
        }

        if (!aCoordonnees(pol) || !aCoordonnees(pod)) continue;

        const routePoints = routeGrandCercle(pol, pod);
        const route = routePoints.map((p) => [p.lat, p.lon] as [number, number]);
        L.polyline(route, { color: "#94a3b8", weight: 2, dashArray: "6 6" }).addTo(carte);

        const arrive = m.phase !== "attente_depart" && m.phase !== "en_mer";
        const avancement = arrive ? 1 : m.phase === "attente_depart" ? 0 : avancementVoyage(m.atd, m.ata ?? m.eta);
        if (avancement === null) continue;

        // Le navire est pris SUR la route deja tracee (longitudes continues, pas de saut de l'autre cote de la carte)
        const indice = Math.round(avancement * (routePoints.length - 1));
        const position = routePoints[indice];

        if (indice > 0 && indice < routePoints.length - 1) {
          L.polyline(route.slice(0, indice + 1), { color: "#0369a1", weight: 3 }).addTo(carte);
        }
        const etiquette =
          avancement >= 1
            ? `${m.conteneur} - arrive`
            : avancement <= 0
              ? `${m.conteneur} - pas encore parti`
              : `${m.conteneur}${m.navire ? ` - ${m.navire}` : ""} (position estimee, ${Math.round(avancement * 100)} % du trajet)`;
        L.marker([position.lat, position.lon], { icon: iconeNavire }).addTo(carte).bindTooltip(etiquette);
      }

      if (points.length > 0) carte.fitBounds(points, { padding: [40, 40], maxZoom: 6 });
    })();

    return () => {
      annule = true;
      carte?.remove();
    };
  }, [marqueurs]);

  return <div ref={conteneur} className="relative z-0 h-[34rem] w-full overflow-hidden rounded-[1.5rem] border border-slate-200" />;
}
