import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";

type SearchParams = Promise<{
  client?: string;
  mois?: string;
}>;

type CommandeRow = {
  id: number;
  client: string | null;
  statut: string | null;
  commentaire: string | null;
  created_at: string | null;
};

type ClientStat = {
  client: string;
  cree: number;
  livree: number;
  livreeRapide: number;
};

function extractTransitionDate(commentaire: string | null | undefined, transitionKey: string) {
  if (!commentaire) return "";

  const parts = commentaire.split("|").map((part) => part.trim());
  const token = parts.find((part) => part.startsWith(`DATE_TRANSITION_${transitionKey}:`));
  return token ? token.replace(`DATE_TRANSITION_${transitionKey}:`, "").trim() : "";
}

function daysBetween(fromValue: string, toValue: string) {
  const fromDate = new Date(fromValue);
  const toDate = new Date(toValue);
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
}

export default async function StatistiqueLivraisonClientPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const clientQuery = (params.client || "").trim();
  const moisQuery = (params.mois || "").trim();

  const { data, error } = await supabaseServer
    .from("commandes")
    .select("id, client, statut, commentaire, created_at")
    .order("client", { ascending: true });

  const allCommandes = (data as CommandeRow[] | null) ?? [];

  const commandes = allCommandes.filter((commande) => {
    if (clientQuery && !String(commande.client || "").toLowerCase().includes(clientQuery.toLowerCase())) {
      return false;
    }
    if (moisQuery && !String(commande.created_at || "").startsWith(moisQuery)) {
      return false;
    }
    return true;
  });

  const statsByClient = new Map<string, ClientStat>();

  function getClientStat(client: string) {
    const current = statsByClient.get(client) ?? {
      client,
      cree: 0,
      livree: 0,
      livreeRapide: 0,
    };
    statsByClient.set(client, current);
    return current;
  }

  for (const commande of commandes) {
    const client = String(commande.client || "").trim() || "Sans nom";
    getClientStat(client).cree += 1;

    const statut = String(commande.statut || "").toUpperCase();
    if (statut !== "LIVREE") continue;

    const clientStat = getClientStat(client);
    clientStat.livree += 1;

    const standDate = extractTransitionDate(commande.commentaire, "STAND_ENCOURS");
    const blDate = extractTransitionDate(commande.commentaire, "ENCOURS_BLTRANSFORME");

    if (standDate && blDate) {
      const jours = daysBetween(standDate, blDate);
      if (jours >= 0 && jours < 10) {
        clientStat.livreeRapide += 1;
      }
    }
  }

  const clients = [...statsByClient.values()].sort((a, b) => b.cree - a.cree);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f9ff_0%,#fbfdff_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-fuchsia-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Statistique livraison client
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Commandes ecrites, livrees et livrees rapidement (moins de 10 jours hors stand), par
                client.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/statistique" label="Retour" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-[2fr_1fr_auto_auto]">
            <input
              type="text"
              name="client"
              defaultValue={clientQuery}
              placeholder="Filtrer par client..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <input
              type="month"
              name="mois"
              defaultValue={moisQuery}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <button
              type="submit"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Filtrer
            </button>
            <Link
              href="/statistique-livraison-client"
              className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
            >
              Effacer
            </Link>
          </form>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {error ? (
            <div className="p-6">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : clients.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">Aucune commande trouvee.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Client</th>
                    <th className="px-4 py-3 font-semibold">Commandes ecrites</th>
                    <th className="px-4 py-3 font-semibold">Commandes livrees</th>
                    <th className="px-4 py-3 font-semibold">Livrees en moins de 10j (hors stand)</th>
                    <th className="px-4 py-3 font-semibold">Livrees / ecrites</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => {
                    const ratio =
                      client.cree > 0 ? Math.round((client.livree / client.cree) * 100) : null;

                    return (
                      <tr key={client.client} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-semibold text-slate-900">{client.client}</td>
                        <td className="px-4 py-3 text-slate-900">{client.cree}</td>
                        <td className="px-4 py-3 font-semibold text-emerald-700">{client.livree}</td>
                        <td className="px-4 py-3 text-slate-900">{client.livreeRapide}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {ratio === null ? "-" : `${ratio}%`}
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
