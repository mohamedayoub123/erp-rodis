// Heure du Togo (Africa/Lome = UTC+0 toute l'annee, pas d'heure d'ete) a partir d'un instant en millisecondes,
// quel que soit le fuseau ou le reglage de l'appareil. Sert au bouton "Maintenant" de l'Entree par ligne,
// qui prend l'heure du SERVEUR de l'ERP (synchronisee sur internet) et non celle du telephone.
// Aucun import serveur ici : ce fichier est aussi charge cote navigateur.

function formater(fuseau: string, instantMs: number): string {
  const parties = new Intl.DateTimeFormat("fr-FR", {
    timeZone: fuseau,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instantMs));
  const heures = parties.find((partie) => partie.type === "hour")?.value ?? "00";
  const minutes = parties.find((partie) => partie.type === "minute")?.value ?? "00";
  return `${heures.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

// "HH:MM" au format 24 h, heure du Togo.
export function formaterHeureTogo(instantMs: number): string {
  try {
    return formater("Africa/Lome", instantMs);
  } catch {
    // Fuseau inconnu de cet appareil : le Togo est a UTC+0, donc UTC donne la meme heure.
    return formater("UTC", instantMs);
  }
}

// Ecart (ms) a AJOUTER a l'horloge de l'appareil pour obtenir celle du serveur : la reponse du serveur
// arrive au milieu de l'aller-retour, donc on compare a l'instant du milieu.
export function calculerDecalageHorloge(debutAppelMs: number, finAppelMs: number, heureServeurMs: number): number {
  return heureServeurMs - (debutAppelMs + finAppelMs) / 2;
}
