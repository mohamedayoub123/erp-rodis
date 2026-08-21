import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { createFournisseurAction, deleteFournisseurAction, updateFournisseurAction } from "./actions";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";

type FournisseurRow = {
  id: number;
  nom_fournisseur: string;
  pays: string | null;
};

type SearchParams = Promise<{
  q?: string;
  pays?: string;
}>;

async function fetchAllDistinctFournisseurValues(column: "nom_fournisseur" | "pays") {
  const values = new Set<string>();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("fournisseurs")
      .select(column)
      .range(from, from + pageSize - 1);

    if (error) return { values: [...values], error };

    const chunk = (data ?? []) as Record<string, string | null>[];
    for (const row of chunk) {
      const value = row[column];
      if (value) values.add(value);
    }

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { values: [...values], error: null };
}

export default async function FournisseursPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const currentStockUser = await getCurrentStockUser();
  const canWriteFournisseurs = await canWritePageUser(currentStockUser, "fournisseurs");
  const canEditFournisseurs = await canWritePageUser(currentStockUser, "fournisseurs");
  const canDeleteFournisseurs = await canDeletePageUser(currentStockUser, "fournisseurs");
  const params = await searchParams;
  const q = (params.q || "").trim();
  const pays = (params.pays || "").trim();

  const fournisseurs: FournisseurRow[] = [];
  let error: { message: string } | null = null;
  let from = 0;
  const pageSize = 1000;

  while (true) {
    let fournisseursQuery = supabaseServer
      .from("fournisseurs")
      .select("id, nom_fournisseur, pays")
      .order("nom_fournisseur", { ascending: true })
      .range(from, from + pageSize - 1);

    if (q) {
      fournisseursQuery = fournisseursQuery.ilike("nom_fournisseur", `%${q}%`);
    }

    if (pays) {
      fournisseursQuery = fournisseursQuery.ilike("pays", `%${pays}%`);
    }

    const { data, error: pageError } = await fournisseursQuery;

    if (pageError) {
      error = pageError;
      break;
    }

    const chunk = (data as FournisseurRow[] | null) ?? [];
    fournisseurs.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  const [{ values: allFournisseurNames }, { values: allPaysValues }] = await Promise.all([
    fetchAllDistinctFournisseurValues("nom_fournisseur"),
    fetchAllDistinctFournisseurValues("pays"),
  ]);
  const fournisseurNameOptions = allFournisseurNames.map((label, index) => ({ id: index, label }));
  const paysOptions = allPaysValues.map((label, index) => ({ id: index, label }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Fournisseurs</h1>
              <p className="mt-2 text-sm text-slate-600">
                Liste des fournisseurs enregistres : nom, pays.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/comptabilite" label="Retour Comptabilite" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {canWriteFournisseurs ? (
          <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <h2 className="text-xl font-bold text-slate-900">Ajouter un fournisseur</h2>

            <form action={createFournisseurAction} className="mt-5 grid gap-4 md:grid-cols-3">
              <input
                type="text"
                name="nom_fournisseur"
                placeholder="Nom du fournisseur"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                required
              />
              <input
                type="text"
                name="pays"
                placeholder="Pays"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
              />

              <div>
                <SubmitButton
                  pendingLabel="Enregistrement..."
                  className="rounded-full bg-amber-600 px-5 py-3 text-sm font-semibold text-white"
                >
                  Enregistrer fournisseur
                </SubmitButton>
              </div>
            </form>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-xl font-bold text-slate-900">Liste des fournisseurs</h2>
          </div>

          <form className="grid gap-3 border-b border-slate-100 px-6 py-5 md:grid-cols-[1fr_1fr_auto_auto]">
            <SearchableFilterInput
              name="q"
              defaultValue={q}
              options={fournisseurNameOptions}
              placeholder="Rechercher par fournisseur..."
            />
            <SearchableFilterInput
              name="pays"
              defaultValue={pays}
              options={paysOptions}
              placeholder="Rechercher par pays..."
            />
            <button
              type="submit"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            >
              Filtrer
            </button>
            <Link
              href="/fournisseurs"
              className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
            >
              Effacer
            </Link>
          </form>

          {error ? (
            <div className="p-6">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : fournisseurs.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">Aucun fournisseur enregistre.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Nom du fournisseur</th>
                    <th className="px-6 py-4 font-semibold">Pays</th>
                    {canEditFournisseurs || canDeleteFournisseurs ? (
                      <th className="px-6 py-4 font-semibold">Actions</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {fournisseurs.map((fournisseur) => (
                    <tr key={fournisseur.id} className="border-t border-slate-100 align-top">
                      <td className="px-6 py-4 font-medium text-slate-900">{fournisseur.nom_fournisseur}</td>
                      <td className="px-6 py-4 text-slate-600">{fournisseur.pays || "-"}</td>
                      {canEditFournisseurs || canDeleteFournisseurs ? (
                        <td className="px-6 py-4">
                          <details className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                              Modifier
                            </summary>

                            {canEditFournisseurs ? (
                              <form action={updateFournisseurAction} className="mt-4 grid gap-3">
                                <input type="hidden" name="fournisseur_id" value={fournisseur.id} />
                                <input
                                  type="text"
                                  name="nom_fournisseur"
                                  defaultValue={fournisseur.nom_fournisseur}
                                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                                  required
                                />
                                <input
                                  type="text"
                                  name="pays"
                                  defaultValue={fournisseur.pays || ""}
                                  placeholder="Pays"
                                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                                />
                                <div>
                                  <SubmitButton
                                    pendingLabel="Enregistrement..."
                                    className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                                  >
                                    Enregistrer
                                  </SubmitButton>
                                </div>
                              </form>
                            ) : null}

                            {canDeleteFournisseurs ? (
                              <form action={deleteFournisseurAction} className="mt-2">
                                <input type="hidden" name="fournisseur_id" value={fournisseur.id} />
                                <DeleteIconButton />
                              </form>
                            ) : null}
                          </details>
                        </td>
                      ) : null}
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
