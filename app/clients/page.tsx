import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { createClientAction, deleteClientAction, updateClientAction } from "./actions";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";

const TRANSPORT_OPTIONS = ["CAMION", "CONTINAIR", "TC", "TC20", "TC40"];

type ClientRow = {
  id: number;
  nom_client: string;
  pays: string | null;
  mode_transport: string | null;
};

type SearchParams = Promise<{
  q?: string;
  pays?: string;
}>;

// Liste complete (non filtree, non paginee) des valeurs distinctes utilisees
// pour peupler les menus de recherche - separee de la requete principale qui,
// elle, applique les filtres q/pays et sert a l'affichage du tableau.
async function fetchAllDistinctClientValues(column: "nom_client" | "pays") {
  const values = new Set<string>();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("clients")
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

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const currentStockUser = await getCurrentStockUser();
  const canWriteClients = await canWritePageUser(currentStockUser, "clients");
  const canEditClients = await canWritePageUser(currentStockUser, "clients");
  const canDeleteClients = await canDeletePageUser(currentStockUser, "clients");
  const params = await searchParams;
  const q = (params.q || "").trim();
  const pays = (params.pays || "").trim();

  const clients: ClientRow[] = [];
  let error: { message: string } | null = null;
  let from = 0;
  const pageSize = 1000;

  // PostgREST plafonne chaque requete a ~1000 lignes quel que soit le
  // nombre demande - sans cette boucle, les clients au-dela du 1000e
  // (tries par nom) etaient invisibles sur cette page.
  while (true) {
    let clientsQuery = supabaseServer
      .from("clients")
      .select("id, nom_client, pays, mode_transport")
      .order("nom_client", { ascending: true })
      .range(from, from + pageSize - 1);

    if (q) {
      clientsQuery = clientsQuery.ilike("nom_client", `%${q}%`);
    }

    if (pays) {
      clientsQuery = clientsQuery.ilike("pays", `%${pays}%`);
    }

    const { data, error: pageError } = await clientsQuery;

    if (pageError) {
      error = pageError;
      break;
    }

    const chunk = (data as ClientRow[] | null) ?? [];
    clients.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  const [{ values: allClientNames }, { values: allPaysValues }] = await Promise.all([
    fetchAllDistinctClientValues("nom_client"),
    fetchAllDistinctClientValues("pays"),
  ]);
  const clientNameOptions = allClientNames.map((label, index) => ({ id: index, label }));
  const paysOptions = allPaysValues.map((label, index) => ({ id: index, label }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#eef6ff_0%,#f8fbff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Client</h1>
              <p className="mt-2 text-sm text-slate-600">
                Liste des clients enregistres : nom, pays, transport par defaut.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/" label="Retour accueil" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {canWriteClients ? (
          <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <h2 className="text-xl font-bold text-slate-900">Ajouter un client</h2>

            <form action={createClientAction} className="mt-5 grid gap-4 md:grid-cols-3">
              <input
                type="text"
                name="nom_client"
                placeholder="Nom du client"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                required
              />
              <input
                type="text"
                name="pays"
                placeholder="Pays"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
              />
              <select
                name="mode_transport"
                defaultValue=""
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
              >
                <option value="">Transport par defaut (optionnel)</option>
                {TRANSPORT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <div>
                <SubmitButton
                  pendingLabel="Enregistrement..."
                  className="rounded-full bg-sky-700 px-5 py-3 text-sm font-semibold text-white"
                >
                  Enregistrer client
                </SubmitButton>
              </div>
            </form>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-xl font-bold text-slate-900">Liste des clients</h2>
          </div>

          <form className="grid gap-3 border-b border-slate-100 px-6 py-5 md:grid-cols-[1fr_1fr_auto_auto]">
            <SearchableFilterInput
              name="q"
              defaultValue={q}
              options={clientNameOptions}
              placeholder="Rechercher par client..."
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
              href="/clients"
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
          ) : clients.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">Aucun client enregistre.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Nom du client</th>
                    <th className="px-6 py-4 font-semibold">Pays</th>
                    <th className="px-6 py-4 font-semibold">Transport par defaut</th>
                    {canEditClients || canDeleteClients ? (
                      <th className="px-6 py-4 font-semibold">Actions</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr key={client.id} className="border-t border-slate-100 align-top">
                      <td className="px-6 py-4 font-medium text-slate-900">{client.nom_client}</td>
                      <td className="px-6 py-4 text-slate-600">{client.pays || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{client.mode_transport || "-"}</td>
                      {canEditClients || canDeleteClients ? (
                        <td className="px-6 py-4">
                          <details className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                              Modifier
                            </summary>

                            {canEditClients ? (
                            <form action={updateClientAction} className="mt-4 grid gap-3">
                              <input type="hidden" name="client_id" value={client.id} />
                              <input
                                type="text"
                                name="nom_client"
                                defaultValue={client.nom_client}
                                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                                required
                              />
                              <input
                                type="text"
                                name="pays"
                                defaultValue={client.pays || ""}
                                placeholder="Pays"
                                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                              />
                              <select
                                name="mode_transport"
                                defaultValue={client.mode_transport || ""}
                                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                              >
                                <option value="">Transport par defaut (optionnel)</option>
                                {TRANSPORT_OPTIONS.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
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

                            {canDeleteClients ? (
                            <form action={deleteClientAction} className="mt-2">
                              <input type="hidden" name="client_id" value={client.id} />
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
