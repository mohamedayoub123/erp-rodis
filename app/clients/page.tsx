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

type ClientFinancials = { facture: number; paye: number };

type SourceEcritureRow = { id: number; source_id: string };

async function fetchEcrituresParSourceType(sourceType: string) {
  const rows: SourceEcritureRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("ecritures_comptables")
      .select("id, source_id")
      .eq("source_type", sourceType)
      .range(from, from + pageSize - 1);

    if (error) break;
    const chunk = (data ?? []) as SourceEcritureRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

type LigneCompteRow = {
  ecriture_id: number;
  debit: number;
  credit: number;
  comptes_comptables: { code: string } | { code: string }[] | null;
};

// Montant (debit ou credit selon `champ`) par ecriture, uniquement pour les
// lignes rattachees au compte `compteCode` - meme jointure ecriture_lignes ->
// comptes_comptables que fetchLignesForEcritures dans
// app/comptabilite/journal/page.tsx (comptes_comptables revient en objet ou
// en tableau d'un element selon la relation, gere comme la-bas).
async function fetchMontantParEcriture(ecritureIds: number[], compteCode: string, champ: "debit" | "credit") {
  const montantByEcriture = new Map<number, number>();
  if (ecritureIds.length === 0) return montantByEcriture;

  const idChunkSize = 500;
  const pageSize = 1000;

  for (let i = 0; i < ecritureIds.length; i += idChunkSize) {
    const idsChunk = ecritureIds.slice(i, i + idChunkSize);
    let from = 0;

    while (true) {
      const { data, error } = await supabaseServer
        .from("ecriture_lignes")
        .select("ecriture_id, debit, credit, comptes_comptables(code)")
        .in("ecriture_id", idsChunk)
        .range(from, from + pageSize - 1);

      if (error) break;
      const chunk = (data ?? []) as unknown as LigneCompteRow[];
      for (const ligne of chunk) {
        const compte = Array.isArray(ligne.comptes_comptables) ? ligne.comptes_comptables[0] : ligne.comptes_comptables;
        if (compte?.code !== compteCode) continue;
        const montant = champ === "debit" ? Number(ligne.debit ?? 0) : Number(ligne.credit ?? 0);
        montantByEcriture.set(ligne.ecriture_id, (montantByEcriture.get(ligne.ecriture_id) ?? 0) + montant);
      }

      if (chunk.length < pageSize) break;
      from += pageSize;
    }
  }

  return montantByEcriture;
}

// commandes.client est un texte libre (pas une FK) - meme caveat que
// fournisseurs plus bas : on resout id de commande -> nom de client tel
// qu'ecrit, sans normalisation.
async function fetchCommandeClientMap(commandeIds: number[]) {
  const map = new Map<number, string>();
  if (commandeIds.length === 0) return map;

  const idChunkSize = 500;
  const pageSize = 1000;

  for (let i = 0; i < commandeIds.length; i += idChunkSize) {
    const idsChunk = commandeIds.slice(i, i + idChunkSize);
    let from = 0;

    while (true) {
      const { data, error } = await supabaseServer
        .from("commandes")
        .select("id, client")
        .in("id", idsChunk)
        .range(from, from + pageSize - 1);

      if (error) break;
      const chunk = (data ?? []) as { id: number; client: string | null }[];
      for (const row of chunk) {
        if (row.client) map.set(row.id, row.client);
      }

      if (chunk.length < pageSize) break;
      from += pageSize;
    }
  }

  return map;
}

type CommandePaiementRow = { commande_id: number; montant: number };

async function fetchAllCommandePaiements() {
  const rows: CommandePaiementRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("commande_paiements")
      .select("commande_id, montant")
      .range(from, from + pageSize - 1);

    if (error) break;
    const chunk = (data ?? []) as CommandePaiementRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

// Facture (411000 debit, source commande_vente) et paye (commande_paiements),
// agreges par nom de client tel qu'ecrit dans commandes.client - match
// exact/case-sensible contre clients.nom_client (pas de FK reelle, pas de
// normalisation floue ici, comme demande).
async function fetchFinancesParClient(): Promise<Map<string, ClientFinancials>> {
  const ecritures = await fetchEcrituresParSourceType("commande_vente");
  const debitByEcriture = await fetchMontantParEcriture(
    ecritures.map((e) => e.id),
    "411000",
    "debit"
  );

  const factureByCommandeId = new Map<number, number>();
  for (const ecriture of ecritures) {
    const montant = debitByEcriture.get(ecriture.id);
    if (!montant) continue;
    const commandeId = Number(ecriture.source_id);
    if (!Number.isFinite(commandeId)) continue;
    factureByCommandeId.set(commandeId, (factureByCommandeId.get(commandeId) ?? 0) + montant);
  }

  const paiements = await fetchAllCommandePaiements();
  const payeByCommandeId = new Map<number, number>();
  for (const paiement of paiements) {
    payeByCommandeId.set(
      paiement.commande_id,
      (payeByCommandeId.get(paiement.commande_id) ?? 0) + Number(paiement.montant ?? 0)
    );
  }

  const commandeIds = [...new Set([...factureByCommandeId.keys(), ...payeByCommandeId.keys()])];
  const commandeClientMap = await fetchCommandeClientMap(commandeIds);

  const financesByClient = new Map<string, ClientFinancials>();
  function addTo(clientName: string, key: "facture" | "paye", montant: number) {
    const current = financesByClient.get(clientName) ?? { facture: 0, paye: 0 };
    current[key] += montant;
    financesByClient.set(clientName, current);
  }

  for (const [commandeId, montant] of factureByCommandeId) {
    const clientName = commandeClientMap.get(commandeId);
    if (clientName) addTo(clientName, "facture", montant);
  }
  for (const [commandeId, montant] of payeByCommandeId) {
    const clientName = commandeClientMap.get(commandeId);
    if (clientName) addTo(clientName, "paye", montant);
  }

  return financesByClient;
}

function formatFcfa(value: number) {
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FCFA`;
}

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

  const [{ values: allClientNames }, { values: allPaysValues }, financesByClient] = await Promise.all([
    fetchAllDistinctClientValues("nom_client"),
    fetchAllDistinctClientValues("pays"),
    fetchFinancesParClient(),
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
                    <th className="px-6 py-4 font-semibold">Facture</th>
                    <th className="px-6 py-4 font-semibold">Paye</th>
                    <th className="px-6 py-4 font-semibold">Reste a payer</th>
                    {canEditClients || canDeleteClients ? (
                      <th className="px-6 py-4 font-semibold">Actions</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => {
                    const financials = financesByClient.get(client.nom_client);
                    const facture = financials?.facture ?? 0;
                    const paye = financials?.paye ?? 0;
                    const reste = facture - paye;
                    return (
                    <tr key={client.id} className="border-t border-slate-100 align-top">
                      <td className="px-6 py-4 font-medium text-slate-900">
                        <Link href={`/clients/${client.id}`} className="text-sky-700 hover:underline">
                          {client.nom_client}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{client.pays || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{client.mode_transport || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{facture > 0 ? formatFcfa(facture) : "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{facture > 0 ? formatFcfa(paye) : "-"}</td>
                      <td
                        className={`px-6 py-4 font-semibold ${
                          facture > 0 ? (reste > 0 ? "text-red-600" : "text-emerald-700") : "text-slate-600"
                        }`}
                      >
                        {facture > 0 ? formatFcfa(reste) : "-"}
                      </td>
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
