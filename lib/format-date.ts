// Format unique pour tout le systeme : JJ-MM-AAAA. L'ancre T00:00:00 evite
// qu'une date "YYYY-MM-DD" (minuit UTC) ne recule d'un jour une fois relue
// en heure locale dans un fuseau derriere UTC.
export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}
