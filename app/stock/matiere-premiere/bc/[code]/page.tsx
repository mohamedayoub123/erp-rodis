import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { formatDate } from "@/lib/format-date";
import {
  createImportEvenementAction,
  deleteCommandeBcLigneAction,
  deleteImportEvenementAction,
  markCommandeBcLigneTermineAction,
  updateCommandeBcGroupAction,
  updateCommandeBcLigneAction,
  updateImportEvenementAction,
} from "../actions";
import { computeStatutBc, statutBcBadgeClass } from "../constants";
import { AddArticleForm } from "./add-article-form";

async function fetchArticleOptions() {
  const options: string[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("nom_article")
      .order("nom_article", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as { nom_article: string }[];
    options.push(...chunk.map((row) => row.nom_article));

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return options;
}

type CommandeBcRow = {
  id: number;
  code: string;
  article_label: string | null;
  quantite: number | null;
  n_doss_4d: string | null;
  n_doss_erp: string | null;
  fournisseur: string | null;
  date_jour: string | null;
  statut: string | null;
};

type ImportEvenementRow = {
  id: number;
  bc_ligne_id: number;
  quantite_importee: number;
  n_doss_4d_import: string | null;
  n_doss_erp_import: string | null;
  date_import: string | null;
};

async function fetchGroup(code: string) {
  const { data, error } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .select("id, code, article_label, quantite, n_doss_4d, n_doss_erp, fournisseur, date_jour, statut")
    .eq("code", code)
    .order("id", { ascending: true });

  if (error) return { rows: [] as CommandeBcRow[], error };

  return { rows: (data ?? []) as CommandeBcRow[], error: null };
}

async function fetchImportsForLignes(ligneIds: number[]) {
  if (ligneIds.length === 0) return [] as ImportEvenementRow[];

  // Exclut les evenements issus d'une Reception (lot_stock_id renseigne) -
  // "Creer import" et "Reception" sont deux suivis distincts depuis que la
  // Reception credite le stock reel ; melanger les deux ici faussait "Qte
  // importee"/"Reste a importer" du BC (double comptage).
  const { data } = await supabaseServer
    .from("bons_commande_mp_imports")
    .select("id, bc_ligne_id, quantite_importee, n_doss_4d_import, n_doss_erp_import, date_import")
    .in("bc_ligne_id", ligneIds)
    .is("lot_stock_id", null)
    .order("id", { ascending: true });

  return (data ?? []) as ImportEvenementRow[];
}

export default async function CommandeBcMpDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  noStore();
  const { code } = await params;
  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "commandeBcMp");
  const canDelete = await canDeletePageUser(currentUser, "commandeBcMp");

  const { rows, error } = await fetchGroup(code);

  if (!error && rows.length === 0) {
    notFound();
  }

  const first = rows[0];
  const [imports, articleOptions] = await Promise.all([
    fetchImportsForLignes(rows.map((row) => row.id)),
    fetchArticleOptions(),
  ]);
  const importsByLigne = new Map<number, ImportEvenementRow[]>();
  for (const imp of imports) {
    const list = importsByLigne.get(imp.bc_ligne_id) ?? [];
    list.push(imp);
    importsByLigne.set(imp.bc_ligne_id, list);
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{code}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {rows.length} article(s) - {formatDate(first?.date_jour ?? null)}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/stock/matiere-premiere/bc" />
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
          <>
            {canEdit ? (
              <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <h2 className="mb-3 text-lg font-bold text-slate-900">Dossier commande</h2>
                <form action={updateCommandeBcGroupAction} className="grid gap-4 md:grid-cols-3">
                  <input type="hidden" name="code" value={code} />
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Dossier BC 4D
                    <input
                      type="text"
                      name="n_doss_4d"
                      defaultValue={first?.n_doss_4d || ""}
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Dossier BC ERP
                    <input
                      type="text"
                      name="n_doss_erp"
                      defaultValue={first?.n_doss_erp || ""}
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      Enregistrer
                    </button>
                  </div>
                </form>
              </section>
            ) : null}

            <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Article</th>
                      <th className="px-4 py-3 font-semibold">Fournisseur</th>
                      <th className="px-4 py-3 font-semibold">Dossier 4D</th>
                      <th className="px-4 py-3 font-semibold">Qte commandee</th>
                      <th className="px-4 py-3 font-semibold">Qte importee</th>
                      <th className="px-4 py-3 font-semibold">Reste a importer</th>
                      <th className="px-4 py-3 font-semibold">Historique import</th>
                      <th className="px-4 py-3 font-semibold">Statut</th>
                      {canEdit || canDelete ? <th className="px-4 py-3 font-semibold">Action</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const quantite = Number(row.quantite ?? 0);
                      const ligneImports = importsByLigne.get(row.id) ?? [];
                      const quantiteImportee = ligneImports.reduce(
                        (sum, imp) => sum + Number(imp.quantite_importee ?? 0),
                        0
                      );
                      const statut = computeStatutBc(quantite, quantiteImportee, row.statut);
                      const reste = quantite - quantiteImportee;

                      return (
                        <tr key={row.id} className="border-t border-slate-100 align-top">
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {row.article_label || "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{row.fournisseur || "-"}</td>
                          <td className="px-4 py-3 text-slate-600">{row.n_doss_4d || "-"}</td>
                          <td className="px-4 py-3 text-slate-900">{quantite}</td>
                          <td className="px-4 py-3 text-slate-600">{quantiteImportee}</td>
                          <td className="px-4 py-3 font-semibold text-slate-900">{reste}</td>
                          <td className="px-4 py-3 text-slate-600">
                            {ligneImports.length === 0 ? (
                              "-"
                            ) : (
                              <ul className="space-y-1.5">
                                {ligneImports.map((imp) => (
                                  <li key={imp.id} className="flex items-start gap-1.5 text-xs">
                                    <span className="pt-0.5">
                                      {imp.quantite_importee} - {imp.n_doss_4d_import || "-"} /{" "}
                                      {imp.n_doss_erp_import || "-"} -{" "}
                                      {formatDate(imp.date_import)}
                                    </span>
                                    {canEdit ? (
                                      <details className="rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-0.5">
                                        <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                                          Modifier
                                        </summary>
                                        <form
                                          action={updateImportEvenementAction}
                                          className="mt-2 grid w-52 gap-2"
                                        >
                                          <input type="hidden" name="import_id" value={imp.id} />
                                          <label className="grid gap-1 text-xs text-slate-500">
                                            Doss import 4D
                                            <input
                                              type="text"
                                              name="n_doss_4d_import"
                                              defaultValue={imp.n_doss_4d_import || ""}
                                              className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
                                            />
                                          </label>
                                          <label className="grid gap-1 text-xs text-slate-500">
                                            Doss import ERP
                                            <input
                                              type="text"
                                              name="n_doss_erp_import"
                                              defaultValue={imp.n_doss_erp_import || ""}
                                              className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
                                            />
                                          </label>
                                          <button
                                            type="submit"
                                            className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                                          >
                                            Enregistrer
                                          </button>
                                        </form>
                                      </details>
                                    ) : null}
                                    {canDelete ? (
                                      <form action={deleteImportEvenementAction}>
                                        <input type="hidden" name="import_id" value={imp.id} />
                                        <DeleteIconButton label="Supprimer cet import" />
                                      </form>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${statutBcBadgeClass(
                                statut
                              )}`}
                            >
                              {statut}
                            </span>
                          </td>
                          {canEdit || canDelete ? (
                            <td className="px-4 py-3">
                              <div className="flex items-start gap-2">
                                {canEdit ? (
                                  <details className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
                                    <summary className="cursor-pointer text-xs font-semibold text-slate-800">
                                      Modifier
                                    </summary>
                                    <form
                                      action={updateCommandeBcLigneAction}
                                      className="mt-2 grid w-60 gap-2"
                                    >
                                      <input type="hidden" name="bc_id" value={row.id} />
                                      <label className="grid gap-1 text-xs text-slate-500">
                                        Qte commandee
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          name="quantite"
                                          defaultValue={quantite}
                                          className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
                                          required
                                        />
                                      </label>
                                      <label className="grid gap-1 text-xs text-slate-500">
                                        Doss 4D
                                        <input
                                          type="text"
                                          name="n_doss_4d"
                                          defaultValue={row.n_doss_4d || ""}
                                          className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
                                        />
                                      </label>
                                      <label className="grid gap-1 text-xs text-slate-500">
                                        Doss ERP
                                        <input
                                          type="text"
                                          name="n_doss_erp"
                                          defaultValue={row.n_doss_erp || ""}
                                          className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
                                        />
                                      </label>
                                      <button
                                        type="submit"
                                        className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                                      >
                                        Enregistrer
                                      </button>
                                    </form>
                                  </details>
                                ) : null}

                                {canEdit ? (
                                  <details className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
                                    <summary className="cursor-pointer text-xs font-semibold text-slate-800">
                                      Creer import
                                    </summary>
                                    <form
                                      action={createImportEvenementAction}
                                      className="mt-2 grid w-60 gap-2"
                                    >
                                      <input type="hidden" name="bc_ligne_id" value={row.id} />
                                      <label className="grid gap-1 text-xs text-slate-500">
                                        Qte importee (reste {reste})
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          name="quantite_importee"
                                          className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
                                          required
                                        />
                                      </label>
                                      <label className="grid gap-1 text-xs text-slate-500">
                                        Doss import 4D
                                        <input
                                          type="text"
                                          name="n_doss_4d_import"
                                          className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
                                        />
                                      </label>
                                      <label className="grid gap-1 text-xs text-slate-500">
                                        Doss import ERP
                                        <input
                                          type="text"
                                          name="n_doss_erp_import"
                                          className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
                                        />
                                      </label>
                                      <SubmitButton
                                        pendingLabel="Enregistrement..."
                                        className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        Enregistrer
                                      </SubmitButton>
                                    </form>
                                  </details>
                                ) : null}

                                {canEdit && statut !== "Termine" ? (
                                  <form action={markCommandeBcLigneTermineAction}>
                                    <input type="hidden" name="bc_id" value={row.id} />
                                    <button
                                      type="submit"
                                      className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
                                    >
                                      Termine
                                    </button>
                                  </form>
                                ) : null}

                                {canDelete ? (
                                  <form action={deleteCommandeBcLigneAction}>
                                    <input type="hidden" name="bc_id" value={row.id} />
                                    <DeleteIconButton label="Supprimer ligne" />
                                  </form>
                                ) : null}
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {canEdit ? (
              <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <h2 className="mb-3 text-lg font-bold text-slate-900">Ajouter un article a ce BC</h2>
                <AddArticleForm code={code} articleOptions={articleOptions} />
              </section>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
