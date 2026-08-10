import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { PersistPageFilters } from "@/app/_components/persist-page-filters";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";

const PAGE_SIZE = 100;

type SearchParams = Promise<{
  page?: string;
  proforma?: string;
}>;

type WebFifoRow = {
  id: number;
  commande_id: number;
  numero_lot: string | null;
  date_fabrication: string | null;
  chambre: string | null;
  quantite_chargee: number;
  regle_appliquee: string | null;
  articles: { nom_article: string } | { nom_article: string }[] | null;
  commandes:
    | { id: number; numero_proforma: string; client: string; mode_chargement: string | null }
    | { id: number; numero_proforma: string; client: string; mode_chargement: string | null }[]
    | null;
};

function getNomArticle(
  relation: { nom_article: string } | { nom_article: string }[] | null | undefined
) {
  if (Array.isArray(relation)) {
    return relation[0]?.nom_article || "-";
  }

  return relation?.nom_article || "-";
}

async function fetchAllProformaNumbers() {
  const values = new Set<string>();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("commandes")
      .select("numero_proforma")
      .range(from, from + pageSize - 1);

    if (error) return { values: [...values], error };

    const chunk = (data ?? []) as { numero_proforma: string | null }[];
    for (const row of chunk) {
      if (row.numero_proforma) values.add(row.numero_proforma);
    }

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { values: [...values], error: null };
}

function getCommandeInfo(
  relation:
    | { id: number; numero_proforma: string; client: string; mode_chargement: string | null }
    | { id: number; numero_proforma: string; client: string; mode_chargement: string | null }[]
    | null
    | undefined
) {
  if (Array.isArray(relation)) {
    return relation[0] || null;
  }

  return relation || null;
}

export default async function FifoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const currentPage = Math.max(1, Number(params.page || "1") || 1);
  const proforma = (params.proforma || "").trim();
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let fifoQuery = supabaseServer
    .from("fifo_resultats")
    .select(
      "id, commande_id, numero_lot, date_fabrication, chambre, quantite_chargee, regle_appliquee, articles(nom_article), commandes!inner(id, numero_proforma, client, mode_chargement)"
    )
    .order("id", { ascending: false });

  let countQuery = supabaseServer
    .from("fifo_resultats")
    .select("id, commandes!inner(numero_proforma)", { count: "exact", head: true });

  if (proforma) {
    fifoQuery = fifoQuery.ilike("commandes.numero_proforma", `%${proforma}%`);
    countQuery = countQuery.ilike("commandes.numero_proforma", `%${proforma}%`);
  }

  const [{ data, error }, { count, error: countError }, { values: proformaValues }] =
    await Promise.all([fifoQuery.range(from, to), countQuery, fetchAllProformaNumbers()]);

  const rows = (data as WebFifoRow[] | null) ?? [];
  const effectiveError = error ?? countError;
  const totalRows = count ?? 0;
  const proformaOptions = proformaValues.map((label, index) => ({ id: index, label }));
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const totalChargee = rows.reduce((sum, row) => sum + Number(row.quantite_chargee || 0), 0);
  const lotsVisibles = new Set(rows.map((row) => row.numero_lot).filter(Boolean)).size;
  const proformasVisibles = new Set(
    rows.map((row) => getCommandeInfo(row.commandes)?.numero_proforma).filter(Boolean)
  ).size;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#faf0ff_0%,#fcf7ff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <PersistPageFilters />
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-fuchsia-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              FIFO
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
              Cette page montre seulement le FIFO web des commandes ouvertes. Pour faire
              le FIFO, ouvre d&apos;abord la commande puis clique sur calculer.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <BackButton href="/" label="Retour accueil" />
            <RefreshButton />
            <Link
              href="/commandes"
              className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Ouvrir commandes
            </Link>
          </div>
        </div>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 md:grid-cols-[2fr_auto_auto]">
            <SearchableFilterInput
              name="proforma"
              defaultValue={proforma}
              options={proformaOptions}
              placeholder="Chercher numero proforma..."
            />
            <button
              type="submit"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            >
              Filtrer
            </button>
            <Link
              href="/fifo"
              className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
            >
              Effacer
            </Link>
          </form>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm uppercase tracking-[0.16em] text-slate-500">Lignes FIFO</p>
            <p className="mt-3 text-3xl font-black text-slate-900">{rows.length}</p>
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm uppercase tracking-[0.16em] text-slate-500">Qt chargee</p>
            <p className="mt-3 text-3xl font-black text-slate-900">{totalChargee}</p>
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm uppercase tracking-[0.16em] text-slate-500">Proformas visibles</p>
            <p className="mt-3 text-3xl font-black text-slate-900">{proformasVisibles}</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {effectiveError ? (
            <div className="p-6">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {effectiveError.message}
              </p>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              Aucun FIFO web trouve. Ouvre une commande puis clique sur calculer.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Proforma</th>
                    <th className="px-4 py-3 font-semibold">Client</th>
                    <th className="px-4 py-3 font-semibold">Mode</th>
                    <th className="px-4 py-3 font-semibold">Article</th>
                    <th className="px-4 py-3 font-semibold">Code</th>
                    <th className="px-4 py-3 font-semibold">Date fab.</th>
                    <th className="px-4 py-3 font-semibold">Chambre</th>
                    <th className="px-4 py-3 font-semibold">Qt chargee</th>
                    <th className="px-4 py-3 font-semibold">Regle</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const commande = getCommandeInfo(row.commandes);

                    return (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {commande?.numero_proforma || "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{commande?.client || "-"}</td>
                        <td className="px-4 py-3 text-slate-700">
                          {commande?.mode_chargement || "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{getNomArticle(row.articles)}</td>
                        <td className="px-4 py-3 text-slate-700">{row.numero_lot || "-"}</td>
                        <td className="px-4 py-3 text-slate-700">{formatDate(row.date_fabrication)}</td>
                        <td className="px-4 py-3 text-slate-700">{row.chambre || "-"}</td>
                        <td className="px-4 py-3 font-semibold text-emerald-700">
                          {row.quantite_chargee}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{row.regle_appliquee || "-"}</td>
                        <td className="px-4 py-3">
                          {commande ? (
                            <Link
                              href={`/commandes/${commande.id}`}
                              className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white"
                            >
                              Ouvrir commande
                            </Link>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!effectiveError && totalRows > 0 ? (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-4 text-sm">
              <p className="text-slate-500">
                Lignes {from + 1} a {Math.min(from + PAGE_SIZE, totalRows)} sur {totalRows} | Lots visibles {lotsVisibles}
              </p>

              <div className="flex gap-3">
                <Link
                  href={`/fifo?page=${Math.max(1, currentPage - 1)}&proforma=${encodeURIComponent(proforma)}`}
                  className={`rounded-full px-4 py-2 font-semibold ${
                    currentPage === 1
                      ? "pointer-events-none bg-slate-100 text-slate-400"
                      : "bg-slate-950 text-white"
                  }`}
                >
                  Precedent
                </Link>
                <Link
                  href={`/fifo?page=${Math.min(totalPages, currentPage + 1)}&proforma=${encodeURIComponent(proforma)}`}
                  className={`rounded-full px-4 py-2 font-semibold ${
                    currentPage >= totalPages
                      ? "pointer-events-none bg-slate-100 text-slate-400"
                      : "bg-slate-950 text-white"
                  }`}
                >
                  Suivant
                </Link>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
