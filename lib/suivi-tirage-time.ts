// Duree entre deux heures "HH:MM" (temps_demarage_lot -> temps_arret_batch),
// en minutes. Si la fin est plus petite que le debut, on suppose un passage
// a minuit (rare mais possible sur un poste de nuit).
export function hhmmDiffMinutes(start: string | null, end: string | null): number {
  if (!start || !end) return 0;

  const startParts = start.split(":").map(Number);
  const endParts = end.split(":").map(Number);
  if (startParts.length < 2 || endParts.length < 2) return 0;

  const [startHour, startMinute] = startParts;
  const [endHour, endMinute] = endParts;
  if ([startHour, startMinute, endHour, endMinute].some((n) => Number.isNaN(n))) return 0;

  const startTotal = startHour * 60 + startMinute;
  let endTotal = endHour * 60 + endMinute;
  if (endTotal < startTotal) endTotal += 24 * 60;

  return endTotal - startTotal;
}

export function formatMinutes(totalMinutes: number): string {
  if (!totalMinutes) return "0 min";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

// Une preparation Fabrication peut s'etaler sur plusieurs jours (ex: debut
// un soir, echantillon envoye le lendemain) - chaque "temps" y garde donc
// aussi son jour/mois, stocke en un seul texte "JJ/MM HH:MM" (mois nomme
// cote saisie, meme motif que DateJmaFormField). Extrait de
// app/production/suivi-production/fabrication/[ligneId]/fabrication-form.tsx
// pour etre reutilise par lib/cout-production-reel.ts sans dupliquer le
// format.
export function splitTempsJourMois(value: string | null | undefined) {
  const match = (value || "").match(/^(\d{1,2})\/(\d{2})\s+(\d{2}:\d{2})$/);
  if (match) {
    return { day: match[1], month: match[2], time: match[3] };
  }
  return { day: "", month: "", time: value || "" };
}

export function combineTempsJourMois(day: string, month: string, time: string) {
  if (!time) return "";
  return day && month ? `${day.padStart(2, "0")}/${month} ${time}` : time;
}

// Duree entre 2 temps Fabrication "JJ/MM HH:MM", en minutes - contrairement
// a hhmmDiffMinutes (qui retourne 0 si une valeur manque, correct pour de
// l'affichage), retourne null quand l'un des 2 est manquant/invalide : un
// temps inconnu ne doit jamais devenir silencieusement "0h travaillees"
// dans un calcul de cout (lib/cout-production-reel.ts). anneeRef sert
// d'ancre pour construire une vraie date (le format n'a pas d'annee) ; si la
// fin retombe avant le debut une fois l'annee posee, on suppose un
// changement d'annee (preparation a cheval decembre -> janvier) et on
// ajoute 1 an a la fin.
export function ddmmHhmmDiffMinutes(
  start: string | null | undefined,
  end: string | null | undefined,
  anneeRef: number
): number | null {
  const startParts = splitTempsJourMois(start);
  const endParts = splitTempsJourMois(end);
  if (!startParts.day || !startParts.month || !startParts.time) return null;
  if (!endParts.day || !endParts.month || !endParts.time) return null;

  const startDate = new Date(
    anneeRef,
    Number(startParts.month) - 1,
    Number(startParts.day),
    ...(startParts.time.split(":").map(Number) as [number, number])
  );
  let endDate = new Date(
    anneeRef,
    Number(endParts.month) - 1,
    Number(endParts.day),
    ...(endParts.time.split(":").map(Number) as [number, number])
  );

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;

  if (endDate.getTime() < startDate.getTime()) {
    endDate = new Date(endDate.getFullYear() + 1, endDate.getMonth(), endDate.getDate(), endDate.getHours(), endDate.getMinutes());
  }

  return Math.round((endDate.getTime() - startDate.getTime()) / 60000);
}
