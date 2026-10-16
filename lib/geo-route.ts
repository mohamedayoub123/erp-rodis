// Calculs de route maritime pour la carte du Suivi conteneurs : points sur le grand cercle entre 2 ports (la route la plus courte,
// qui apparait courbe sur une carte plate) et position ESTIMEE du navire selon l'avancement du voyage. Fonctions pures, sans
// dependance : la carte (components) les utilise cote navigateur.

export type Point = { lat: number; lon: number };

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

// Point a la fraction t (0 = depart, 1 = arrivee) du grand cercle entre a et b (interpolation spherique).
export function pointSurGrandCercle(a: Point, b: Point, t: number): Point {
  const lat1 = a.lat * RAD;
  const lon1 = a.lon * RAD;
  const lat2 = b.lat * RAD;
  const lon2 = b.lon * RAD;

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
      )
    );
  if (d < 1e-9) return { lat: a.lat, lon: a.lon };

  const f1 = Math.sin((1 - t) * d) / Math.sin(d);
  const f2 = Math.sin(t * d) / Math.sin(d);
  const x = f1 * Math.cos(lat1) * Math.cos(lon1) + f2 * Math.cos(lat2) * Math.cos(lon2);
  const y = f1 * Math.cos(lat1) * Math.sin(lon1) + f2 * Math.cos(lat2) * Math.sin(lon2);
  const z = f1 * Math.sin(lat1) + f2 * Math.sin(lat2);

  return { lat: Math.atan2(z, Math.sqrt(x * x + y * y)) * DEG, lon: Math.atan2(y, x) * DEG };
}

// Suite de points pour tracer la route sans "saut" de l'autre cote de la carte : on corrige les longitudes pour qu'elles se
// suivent (ex: -179 puis 181), Leaflet sait afficher ces longitudes continues.
export function routeGrandCercle(a: Point, b: Point, nbPoints = 64): Point[] {
  const points: Point[] = [];
  let derniereLon = a.lon;
  for (let i = 0; i <= nbPoints; i++) {
    const p = pointSurGrandCercle(a, b, i / nbPoints);
    let lon = p.lon;
    while (lon - derniereLon > 180) lon -= 360;
    while (lon - derniereLon < -180) lon += 360;
    derniereLon = lon;
    points.push({ lat: p.lat, lon });
  }
  return points;
}

// Avancement du voyage entre 0 et 1 : (maintenant - depart reel) / (arrivee - depart reel). Null quand on ne peut pas le calculer
// (pas de depart reel, pas d'arrivee prevue, ou dates incoherentes).
export function avancementVoyage(departReel: string | null, arrivee: string | null, maintenant: Date = new Date()): number | null {
  if (!departReel || !arrivee) return null;
  const debut = new Date(departReel).getTime();
  const fin = new Date(arrivee).getTime();
  if (!Number.isFinite(debut) || !Number.isFinite(fin) || fin <= debut) return null;
  return Math.min(1, Math.max(0, (maintenant.getTime() - debut) / (fin - debut)));
}
