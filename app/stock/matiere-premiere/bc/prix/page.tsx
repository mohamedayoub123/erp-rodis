import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { DeviseTauxFormField } from "@/app/_components/devise-taux-input";
import { formatDate } from "@/lib/format-date";
import { updateCommandeBcLigneAction } from "../actions";

type CommandeBcRow = {
  id: number;
  code: string;
  article_label: string | null;
  quantite: number | null;
  prix_unitaire: number | null;
  devise: string | null;
  taux_change: number | null;
  fournisseur: string | null;
  n_doss_4d: string | null;
  n_doss_erp: string | null;
  date_jour: string | null;
};

async function fetchAllCommandesBc() {
  const rows: CommandeBcRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("bons_commande_matiere_premiere")
      .select(
        "id, code, article_label, quantite, prix_unitaire, devise, taux_change, fournisseur, n_doss_4d, n_doss_erp, date_jour"
      )
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as CommandeBcRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

type SearchParams = Promise<{ tous?: string }>;

// Vue dediee pour retrouver et remplir les BC MP sans prix - les BC crees
// avant l'ajout du prix (ou saisis sans, l'article restant optionnel) n'ont
// sinon aucun endroit centralise ou les repasser en revue en dehors de leur
// fiche BC individuelle.
export default async function CommandeBcMpPrixPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const afficherTous = params.tous === "1";

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "commandeBcMp");

  const { rows: allRows, error } = await fetchAllCommandesBc();
  const rows = afficherTous ? allRows : allRows.filter((row) => row.prix_unitaire === null);
  const nbSansPrix = allRows.filter((row) => row.prix_unitaire === null).length;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">ERP Rodis</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Prix des BC MP</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Retrouve et remplit les lignes de BC matiere premiere sans prix - {nbSansPrix} ligne
              {nbSansPrix > 1 ? "s" : ""} sans prix au total.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <BackButton href="/stock/matiere-premiere/bc" label="Retour Commande MP" />
            <RefreshButton />
          </div>
        </div>

        <section className="rounded-[2rem] border border-black/5 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/stock/matiere-premiere/bc/prix"
              className={`rounded-full px-4 py-2 font-semibold transition ${
                afficherTous
                  ? "border border-slate-200 text-slate-700"
                  : "bg-slate-950 text-white"
              }`}
            >
              Sans prix uniquement
            </Link>
            <Link
              href="/stock/matiere-premiere/bc/prix?tous=1"
              className={`rounded-full px-4 py-2 font-semibold transition ${
                afficherTous
                  ? "bg-slate-950 text-white"
                  : "border border-slate-200 text-slate-700"
              }`}
            >
              Toutes les lignes
            </Link>
          </div>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {error ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error.message}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              {afficherTous ? "Aucune commande pour le moment." : "Toutes les lignes de BC ont deja un prix."}
            </div>
          ) : (
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">BC</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Article</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Fournisseur</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Date</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Qte</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Prix unitaire</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100 align-top">
                      <td className="px-6 py-4 font-semibold">
                        <Link href={`/stock/matiere-premiere/bc/${row.code}`} className="text-sky-700 underline">
                          {row.code}
                        </Link>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-900">{row.article_label || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{row.fournisseur || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{formatDate(row.date_jour)}</td>
                      <td className="px-6 py-4 text-slate-900">{row.quantite ?? "-"}</td>
                      <td className="px-6 py-4">
                        {canEdit ? (
                          <form action={updateCommandeBcLigneAction} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="bc_id" value={row.id} />
                            <input type="hidden" name="quantite" value={row.quantite ?? ""} />
                            <input type="hidden" name="n_doss_4d" value={row.n_doss_4d ?? ""} />
                            <input type="hidden" name="n_doss_erp" value={row.n_doss_erp ?? ""} />
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              name="prix_unitaire"
                              defaultValue={row.prix_unitaire ?? ""}
                              placeholder="Prix unitaire"
                              className="w-32 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
                            />
                            <DeviseTauxFormField deviseDefaultValue={row.devise} tauxDefaultValue={row.taux_change} />
                            <SubmitButton
                              pendingLabel="..."
                              className="rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                            >
                              Enregistrer
                            </SubmitButton>
                          </form>
                        ) : (
                          <span className="text-slate-600">
                            {row.prix_unitaire !== null
                              ? `${row.prix_unitaire.toLocaleString("fr-FR")}${
                                  row.devise && row.devise !== "FCFA" ? ` ${row.devise}` : ""
                                }`
                              : "-"}
                          </span>
                        )}
                      </td>
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
