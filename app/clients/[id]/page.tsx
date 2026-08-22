import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";
import { fetchMontantFactureCommande, formatStatus } from "@/app/commandes/[id]/page";

type ClientRow = {
  id: number;
  nom_client: string;
  pays: string | null;
  mode_transport: string | null;
};

type CommandeRow = {
  id: number;
  numero_proforma: string;
  statut: string;
  created_at: string | null;
};

type CommandePaiementRow = { commande_id: number; montant: number };

function formatFcfa(value: number) {
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FCFA`;
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clientId = Number(id);

  const { data: clientData } = await supabaseServer
    .from("clients")
    .select("id, nom_client, pays, mode_transport")
    .eq("id", clientId)
    .maybeSingle();

  const client = (clientData as ClientRow | null) ?? null;

  if (!client) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#eef6ff_0%,#f8fbff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
        <div className="mx-auto w-full space-y-6">
          <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <p className="text-sm font-medium text-slate-600">Client introuvable.</p>
            <div className="mt-4">
              <BackButton href="/clients" label="Retour aux clients" />
            </div>
          </section>
        </div>
      </main>
    );
  }

  // commandes.client est un texte libre (pas une FK) - meme convention que
  // fetchFinancesParClient dans app/clients/page.tsx : match exact contre
  // client.nom_client, sans normalisation.
  const { data: commandesData } = await supabaseServer
    .from("commandes")
    .select("id, numero_proforma, statut, created_at")
    .eq("client", client.nom_client)
    .order("created_at", { ascending: false });

  const commandes = (commandesData as CommandeRow[] | null) ?? [];
  const commandeIds = commandes.map((commande) => commande.id);

  // Montant facture = meme requete par-commande que la page de detail
  // commande (411000 debit, source commande_vente) - importee de la plutot
  // que re-derivee pour ne pas dupliquer cette logique comptable.
  const factureByCommandeId = new Map<number, number>();
  await Promise.all(
    commandeIds.map(async (commandeId) => {
      const montant = await fetchMontantFactureCommande(commandeId);
      if (montant !== null) {
        factureByCommandeId.set(commandeId, montant);
      }
    })
  );

  const payeByCommandeId = new Map<number, number>();
  if (commandeIds.length > 0) {
    const { data: paiementsData } = await supabaseServer
      .from("commande_paiements")
      .select("commande_id, montant")
      .in("commande_id", commandeIds);

    for (const paiement of (paiementsData as CommandePaiementRow[] | null) ?? []) {
      payeByCommandeId.set(
        paiement.commande_id,
        (payeByCommandeId.get(paiement.commande_id) ?? 0) + Number(paiement.montant ?? 0)
      );
    }
  }

  let totalFacture = 0;
  let totalPaye = 0;
  const commandeRows = commandes.map((commande) => {
    const facture = factureByCommandeId.get(commande.id) ?? 0;
    const paye = payeByCommandeId.get(commande.id) ?? 0;
    totalFacture += facture;
    totalPaye += paye;
    return { ...commande, facture, paye, reste: facture - paye };
  });
  const totalReste = totalFacture - totalPaye;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#eef6ff_0%,#f8fbff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                {client.nom_client}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Pays : {client.pays || "-"} | Transport par defaut : {client.mode_transport || "-"}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/clients" label="Retour aux clients" />
              <RefreshButton />
            </div>
          </div>

          <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 sm:grid-cols-3">
            <div>Facture : {formatFcfa(totalFacture)}</div>
            <div>Paye : {formatFcfa(totalPaye)}</div>
            <div>
              Reste a payer :{" "}
              <span className={`font-semibold ${totalReste > 0 ? "text-red-600" : "text-emerald-700"}`}>
                {formatFcfa(totalReste)}
              </span>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-xl font-bold text-slate-900">Proformas de ce client</h2>
          </div>

          {commandeRows.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">Aucune proforma pour ce client.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Proforma</th>
                    <th className="px-6 py-4 font-semibold">Statut</th>
                    <th className="px-6 py-4 font-semibold">Date</th>
                    <th className="px-6 py-4 font-semibold">Facture</th>
                    <th className="px-6 py-4 font-semibold">Paye</th>
                    <th className="px-6 py-4 font-semibold">Reste a payer</th>
                    <th className="px-6 py-4 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {commandeRows.map((commande) => (
                    <tr key={commande.id} className="border-t border-slate-100 align-top">
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {commande.numero_proforma}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{formatStatus(commande.statut)}</td>
                      <td className="px-6 py-4 text-slate-600">{formatDate(commande.created_at)}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {commande.facture > 0 ? formatFcfa(commande.facture) : "-"}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {commande.facture > 0 ? formatFcfa(commande.paye) : "-"}
                      </td>
                      <td
                        className={`px-6 py-4 font-semibold ${
                          commande.facture > 0
                            ? commande.reste > 0
                              ? "text-red-600"
                              : "text-emerald-700"
                            : "text-slate-600"
                        }`}
                      >
                        {commande.facture > 0 ? formatFcfa(commande.reste) : "-"}
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/commandes/${commande.id}`}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:border-slate-400"
                        >
                          Ouvrir
                        </Link>
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
