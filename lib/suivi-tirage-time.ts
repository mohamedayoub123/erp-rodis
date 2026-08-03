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
