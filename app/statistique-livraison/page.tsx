import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

type CommandeRow = {
  id: number;
  numero_proforma: string | null;
  client: string | null;
  statut: string | null;
  commentaire: string | null;
  created_at: string | null;
};

type MonthStat = {
  monthKey: string;
  cree: number;
  livree: number;
  livreeRapide: number;
  livreeMoisPrecedent: number;
};

function extractTransitionDate(commentaire: string | null | undefined, transitionKey: string) {
  if (!commentaire) return "";

  const parts = commentaire.split("|").map((part) => part.trim());
  const token = parts.find((part) => part.startsWith(`DATE_TRANSITION_${transitionKey}:`));
  return token ? token.replace(`DATE_TRANSITION_${transitionKey}:`, "").trim() : "";
}

function getMonthKey(value: string | null) {
  if (!value) return "";
  return value.slice(0, 7);
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  if (!year || !month) return monthKey;

  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(date);
}

function daysBetween(fromValue: string, toValue: string) {
  const fromDate = new Date(fromValue);
  const toDate = new Date(toValue);
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
}

export default async function StatistiqueLivraisonPage() {
  const { data, error } = await supabaseServer
    .from("commandes")
    .select("id, numero_proforma, client, statut, commentaire, created_at")
    .order("created_at", { ascending: true });

  const commandes = (data as CommandeRow[] | null) ?? [];

  const statsByMonth = new Map<string, MonthStat>();

  function getMonthStat(monthKey: string) {
    const current = statsByMonth.get(monthKey) ?? {
      monthKey,
      cree: 0,
      livree: 0,
      livreeRapide: 0,
      livreeMoisPrecedent: 0,
    };
    statsByMonth.set(monthKey, current);
    return current;
  }

  for (const commande of commandes) {
    const createdMonth = getMonthKey(commande.created_at);
    if (createdMonth) {
      getMonthStat(createdMonth).cree += 1;
    }

    const statut = String(commande.statut || "").toUpperCase();
    if (statut !== "LIVREE") continue;

    const livreeDate = extractTransitionDate(commande.commentaire, "ENCOURS_LIVREE");
    const livreeMonth = getMonthKey(livreeDate);
    if (!livreeMonth) continue;

    const monthStat = getMonthStat(livreeMonth);
    monthStat.livree += 1;

    if (createdMonth && createdMonth !== livreeMonth) {
      monthStat.livreeMoisPrecedent += 1;
    }

    // Le delai "rapide" ne compte pas le temps passe en stand : on mesure
    // de la sortie du stand (arret stand) jusqu'au BL transforme, pas
    // jusqu'a la livraison.
    const standDate = extractTransitionDate(commande.commentaire, "STAND_ENCOURS");
    const blDate = extractTransitionDate(commande.commentaire, "ENCOURS_BLTRANSFORME");

    if (standDate && blDate) {
      const jours = daysBetween(standDate, blDate);
      if (jours >= 0 && jours < 10) {
        monthStat.livreeRapide += 1;
      }
    }
  }

  const months = [...statsByMonth.values()].sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f9ff_0%,#fbfdff_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Statistique livraison
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Le delai rapide compte de la sortie du stand jusqu&apos;au BL transforme (le temps en
                stand ne compte pas).
              </p>
            </div>

            <Link
              href="/statistique"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Retour
            </Link>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {error ? (
            <div className="p-6">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : months.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">Aucune commande trouvee.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Mois</th>
                    <th className="px-4 py-3 font-semibold">Commandes ecrites</th>
                    <th className="px-4 py-3 font-semibold">Commandes livrees</th>
                    <th className="px-4 py-3 font-semibold">Livrees en moins de 10j (hors stand)</th>
                    <th className="px-4 py-3 font-semibold">Livrees / ecrites</th>
                    <th className="px-4 py-3 font-semibold">Dont commandes d&apos;un mois precedent</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((month) => {
                    const ratio =
                      month.cree > 0 ? Math.round((month.livree / month.cree) * 100) : null;

                    return (
                      <tr key={month.monthKey} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-semibold capitalize text-slate-900">
                          {formatMonthLabel(month.monthKey)}
                        </td>
                        <td className="px-4 py-3 text-slate-900">{month.cree}</td>
                        <td className="px-4 py-3 font-semibold text-emerald-700">{month.livree}</td>
                        <td className="px-4 py-3 text-slate-900">{month.livreeRapide}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {ratio === null ? "-" : `${ratio}%`}
                        </td>
                        <td className="px-4 py-3 text-amber-700">
                          {month.livreeMoisPrecedent > 0 ? month.livreeMoisPrecedent : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
