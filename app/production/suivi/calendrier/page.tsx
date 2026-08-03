import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { fetchAllProgrammeLignes, formatQty, type ProgrammeLigneRow } from "../data";

const MOIS_LABELS = [
  "Janvier",
  "Fevrier",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Aout",
  "Septembre",
  "Octobre",
  "Novembre",
  "Decembre",
];

const JOURS_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseMonthParam(value: string | undefined): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (match) {
    return { year: Number(match[1]), month: Number(match[2]) - 1 };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

function buildCalendarWeeks(year: number, month: number): Date[][] {
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);

  // Semaine commence lundi : decale de 0 (lundi) a 6 (dimanche).
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - firstWeekday);

  const lastWeekday = (lastOfMonth.getDay() + 6) % 7;
  const gridEnd = new Date(year, month, lastOfMonth.getDate() + (6 - lastWeekday));

  const weeks: Date[][] = [];
  let currentWeek: Date[] = [];
  const cursor = new Date(gridStart);

  while (cursor <= gridEnd) {
    currentWeek.push(new Date(cursor));
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return weeks;
}

type SearchParams = Promise<{ month?: string }>;

export default async function PlanningCalendrierPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const params = await searchParams;
  const { year, month } = parseMonthParam(params.month);

  const { rows: lignes } = await fetchAllProgrammeLignes({ activeOnly: true });

  const byDate = new Map<string, ProgrammeLigneRow[]>();
  for (const ligne of lignes) {
    if (ligne.programme_termine) continue;
    const key = String(ligne.date_jour).slice(0, 10);
    const list = byDate.get(key) ?? [];
    list.push(ligne);
    byDate.set(key, list);
  }

  const weeks = buildCalendarWeeks(year, month);
  const todayKey = dateKey(new Date());

  const prevMonthDate = new Date(year, month - 1, 1);
  const nextMonthDate = new Date(year, month + 1, 1);
  const prevMonthParam = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const nextMonthParam = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}`;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Calendrier Production
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Ce qui est programme, jour par jour, chaine par chaine.
              </p>
            </div>

            <BackButton href="/production/suivi" label="Retour planning production" />
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <Link
              href={`/production/suivi/calendrier?month=${prevMonthParam}`}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              {"< Precedent"}
            </Link>
            <h2 className="text-xl font-bold text-slate-900">
              {MOIS_LABELS[month]} {year}
            </h2>
            <Link
              href={`/production/suivi/calendrier?month=${nextMonthParam}`}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              {"Suivant >"}
            </Link>
          </div>

          {(
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[900px] table-fixed border-collapse">
                <thead>
                  <tr>
                    {JOURS_LABELS.map((label) => (
                      <th
                        key={label}
                        className="w-[14.28%] border border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((week, weekIndex) => (
                    <tr key={weekIndex}>
                      {week.map((day) => {
                        const key = dateKey(day);
                        const isCurrentMonth = day.getMonth() === month;
                        const dayLignes = byDate.get(key) ?? [];
                        const isToday = key === todayKey;

                        return (
                          <td
                            key={key}
                            className={`align-top border border-slate-200 p-0 ${
                              isCurrentMonth ? "bg-white" : "bg-slate-50/60"
                            }`}
                            style={{ height: "7rem" }}
                          >
                            <Link
                              href={`/production/suivi/calendrier/${key}`}
                              className="block h-full w-full p-2 transition hover:bg-sky-50"
                            >
                              <p
                                className={`text-xs font-semibold ${
                                  isToday
                                    ? "inline-block rounded-full bg-sky-600 px-2 py-0.5 text-white"
                                    : isCurrentMonth
                                      ? "text-slate-700"
                                      : "text-slate-400"
                                }`}
                              >
                                {day.getDate()}
                              </p>
                              <div className="mt-1 space-y-1 overflow-y-auto" style={{ maxHeight: "5rem" }}>
                                {dayLignes.map((ligne) => (
                                  <p
                                    key={ligne.id}
                                    className="rounded-lg bg-sky-50 px-1.5 py-1 text-[11px] leading-tight text-sky-900"
                                    title={`${ligne.zone} / ${ligne.chaine} - ${ligne.produit || "-"}`}
                                  >
                                    <span className="font-semibold">{ligne.chaine}</span> :{" "}
                                    {ligne.produit || "-"}
                                    {ligne.qt_carton !== null ? (
                                      <>
                                        {" "}
                                        - {formatQty(ligne.qt_carton).toLocaleString("fr-FR")} carton
                                      </>
                                    ) : null}
                                    {ligne.vrac_a_fabriquer !== null ? (
                                      <>
                                        {" "}
                                        / {formatQty(ligne.vrac_a_fabriquer).toLocaleString("fr-FR")} vrac
                                      </>
                                    ) : null}
                                  </p>
                                ))}
                              </div>
                            </Link>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
