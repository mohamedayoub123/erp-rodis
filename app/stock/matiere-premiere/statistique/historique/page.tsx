import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { canViewPageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { formatDateTime } from "@/lib/format-date";
import { GAMME_CONFIGS } from "../gamme-config";
import { statistiqueChangedKeys } from "../audit-diff";

type AuditRow = {
  id: number;
  created_at: string;
  utilisateur: string | null;
  action: "creation" | "modification" | "suppression";
  cible: string | null;
  resume: string;
  donnees_avant: Record<string, unknown> | null;
  donnees_apres: Record<string, unknown> | null;
};

// cible = "Gamme - Designation" (voir statistiqueMpCible dans actions.ts) -
// retrouve la gamme en cherchant laquelle des cles connues de
// GAMME_CONFIGS est bien le prefixe, plutot que de couper au premier " - "
// (une designation d'article peut elle-meme contenir " - ").
function parseCible(cible: string | null): { gamme: string | null; designation: string } {
  if (!cible) return { gamme: null, designation: "-" };
  for (const gammeKey of Object.keys(GAMME_CONFIGS)) {
    const prefix = `${gammeKey} - `;
    if (cible.startsWith(prefix)) {
      return { gamme: gammeKey, designation: cible.slice(prefix.length) };
    }
  }
  return { gamme: null, designation: cible };
}

function columnLabel(gamme: string | null, key: string): string {
  if (key === "ordre") return "Ordre";
  if (key === "remarque_libre") return "Remarque";
  const config = gamme ? GAMME_CONFIGS[gamme] : undefined;
  return config?.columns.find((col) => col.key === key)?.label || key;
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

// Ne montre que ce qui a vraiment change entre avant/apres - meme principe
// que ModificationDiff sur /admin/historique, avec les libelles de colonne
// propres a chaque gamme statistique au lieu d'un dictionnaire fixe.
function ChangedFields({
  gamme,
  avant,
  apres,
}: {
  gamme: string | null;
  avant: Record<string, unknown> | null;
  apres: Record<string, unknown> | null;
}) {
  if (!avant || !apres) {
    return <p className="text-sm text-slate-500">Aucun detail enregistre.</p>;
  }

  const changed = statistiqueChangedKeys(avant, apres);

  if (changed.length === 0) {
    return <p className="text-sm text-slate-500">Aucun changement detecte.</p>;
  }

  return (
    <div className="grid gap-1.5">
      {changed.map((key) => (
        <div key={key} className="grid grid-cols-[10rem_1fr_1.5rem_1fr] items-start gap-2 text-sm">
          <p className="font-semibold text-slate-600">{columnLabel(gamme, key)}</p>
          <p className="text-red-700 line-through">{formatFieldValue(avant[key])}</p>
          <span className="text-center text-slate-400">-&gt;</span>
          <p className="font-medium text-emerald-700">{formatFieldValue(apres[key])}</p>
        </div>
      ))}
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const className =
    action === "creation" ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800";
  const label = action === "creation" ? "Ajout" : "Modification";
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}

type SearchParams = Promise<{ gammeStatistique?: string }>;

const PAGE_SIZE = 200;

export default async function StatistiqueMpHistoriquePage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const gammeStatistique = String(params.gammeStatistique || "").trim();
  const currentUser = await getCurrentStockUser();

  if (!(await canViewPageUser(currentUser, "statistiqueMp"))) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#f5f3ff_0%,#fbfaff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
        <div className="mx-auto w-full max-w-3xl">
          <section className="rounded-[2rem] border border-red-200 bg-white p-8 text-center shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700">Acces reserve</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Historique Statistique MP</h1>
          </section>
        </div>
      </main>
    );
  }

  let query = supabaseServer
    .from("audit_log")
    .select("id, created_at, utilisateur, action, cible, resume, donnees_avant, donnees_apres")
    .eq("module", "StatistiqueMp")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (gammeStatistique) {
    query = query.ilike("cible", `${gammeStatistique} - %`);
  }

  const { data, error } = await query;

  const rows = (data as AuditRow[] | null) ?? [];

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f3ff_0%,#fbfaff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Historique Statistique MP{gammeStatistique ? ` - ${gammeStatistique}` : ""}
              </h1>
              <p className="mt-2 text-sm text-slate-600">Qui a modifie quoi, et le changement exact.</p>
            </div>
            <div className="flex items-center gap-3">
              <BackButton
                href={
                  gammeStatistique
                    ? `/stock/matiere-premiere/statistique?gammeStatistique=${encodeURIComponent(gammeStatistique)}`
                    : "/stock/matiere-premiere/statistique"
                }
                label="Retour"
              />
              <RefreshButton />
            </div>
          </div>
        </section>

        {gammeStatistique ? (
          <Link
            href="/stock/matiere-premiere/statistique/historique"
            className="inline-block rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Voir l&apos;historique de toutes les gammes
          </Link>
        ) : null}

        {error ? (
          <section className="rounded-[1.75rem] border border-amber-200 bg-white p-6 text-center shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm text-amber-700">Journal indisponible : {error.message}</p>
          </section>
        ) : rows.length === 0 ? (
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            Aucune modification enregistree pour le moment.
          </div>
        ) : (
          <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Date / heure</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Utilisateur</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Gamme</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Article</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Action</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Changement</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const { gamme, designation } = parseCible(row.cible);
                    return (
                      <tr key={row.id} className="border-t border-slate-100 align-top">
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {formatDateTime(row.created_at)}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">{row.utilisateur || "-"}</td>
                        <td className="px-4 py-3 text-slate-600">{gamme || "-"}</td>
                        <td className="px-4 py-3 text-slate-800">{designation}</td>
                        <td className="px-4 py-3">
                          <ActionBadge action={row.action} />
                        </td>
                        <td className="px-4 py-3">
                          {row.action === "creation" ? (
                            <p className="text-sm text-slate-500">Article ajoute au rapport.</p>
                          ) : (
                            <ChangedFields gamme={gamme} avant={row.donnees_avant} apres={row.donnees_apres} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
