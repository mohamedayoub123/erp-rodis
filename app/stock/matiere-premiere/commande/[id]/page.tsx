import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";
import { decodeDossierId } from "../dossier-id";

type ImportRow = {
  id: number;
  bc_ligne_id: number;
  quantite_importee: number;
  date_import: string | null;
};

type BcLigneRow = {
  id: number;
  code: string;
  article_label: string | null;
};

async function fetchImportsForDossier(nDoss4d: string | null, nDossErp: string | null) {
  let query = supabaseServer
    .from("bons_commande_mp_imports")
    .select("id, bc_ligne_id, quantite_importee, date_import")
    .order("date_import", { ascending: false });

  query = nDoss4d ? query.eq("n_doss_4d_import", nDoss4d) : query.is("n_doss_4d_import", null);
  query = nDossErp ? query.eq("n_doss_erp_import", nDossErp) : query.is("n_doss_erp_import", null);

  const { data, error } = await query;

  return { rows: (data ?? []) as ImportRow[], error };
}

async function fetchBcLignes(ligneIds: number[]) {
  if (ligneIds.length === 0) return [] as BcLigneRow[];

  const { data } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .select("id, code, article_label")
    .in("id", ligneIds);

  return (data ?? []) as BcLigneRow[];
}

export default async function ImportMpDossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  noStore();
  const { id } = await params;
  const { nDoss4d, nDossErp } = decodeDossierId(id);

  const { rows, error } = await fetchImportsForDossier(nDoss4d, nDossErp);

  if (!error && rows.length === 0) {
    notFound();
  }

  const bcLignes = await fetchBcLignes(rows.map((row) => row.bc_ligne_id));
  const ligneById = new Map(bcLignes.map((ligne) => [ligne.id, ligne]));

  const quantiteTotale = rows.reduce((sum, row) => sum + Number(row.quantite_importee ?? 0), 0);

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
                {nDoss4d || "Sans dossier 4D"}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Doss. ERP : {nDossErp || "-"} - {rows.length} import(s) - {quantiteTotale} au total
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/stock/matiere-premiere/commande" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error.message}
            </p>
          </section>
        ) : (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">BC</th>
                    <th className="px-4 py-3 font-semibold">Article</th>
                    <th className="px-4 py-3 font-semibold">Qte importee</th>
                    <th className="px-4 py-3 font-semibold">Date import</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const ligne = ligneById.get(row.bc_ligne_id);

                    return (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-semibold text-sky-700">
                          {ligne?.code || "-"}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {ligne?.article_label || "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-900">{row.quantite_importee}</td>
                        <td className="px-4 py-3 text-slate-600">{formatDate(row.date_import)}</td>
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
