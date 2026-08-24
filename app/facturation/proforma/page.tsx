import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";
import { createBonLivraisonAction } from "../bl/actions";

// Lecture seule sur "commandes" - ce module ne modifie jamais rien la-bas,
// il lit juste les commandes livrees pour proposer de les transformer en
// Bon de Livraison.
type CommandeRow = {
  id: number;
  numero_proforma: string;
  client: string;
  statut: string;
  created_at: string | null;
};

export default async function FacturationProformaPage() {
  noStore();
  const currentUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentUser, "facturationBl");

  const [{ data: commandesData }, { data: blData }] = await Promise.all([
    supabaseServer
      .from("commandes")
      .select("id, numero_proforma, client, statut, created_at")
      .eq("statut", "LIVREE")
      .order("created_at", { ascending: false }),
    supabaseServer.from("bons_livraison").select("commande_id, id"),
  ]);

  const commandes = (commandesData ?? []) as CommandeRow[];
  const blIdByCommandeId = new Map(
    ((blData ?? []) as { commande_id: number; id: number }[]).map((row) => [row.commande_id, row.id])
  );

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Proforma</h1>
              <p className="mt-2 text-sm text-slate-600">
                Commandes livrees - transforme en Bon de Livraison des qu&apos;elle est prete.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/facturation" label="Retour Facturation" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {commandes.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">Aucune commande livree pour le moment.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Proforma</th>
                    <th className="px-6 py-4 font-semibold">Client</th>
                    <th className="px-6 py-4 font-semibold">Livree le</th>
                    <th className="px-6 py-4 font-semibold">Bon de Livraison</th>
                  </tr>
                </thead>
                <tbody>
                  {commandes.map((commande) => {
                    const blId = blIdByCommandeId.get(commande.id);
                    return (
                      <tr key={commande.id} className="border-t border-slate-100">
                        <td className="px-6 py-4 font-semibold text-slate-900">{commande.numero_proforma}</td>
                        <td className="px-6 py-4 text-slate-600">{commande.client}</td>
                        <td className="px-6 py-4 text-slate-600">{formatDate(commande.created_at)}</td>
                        <td className="px-6 py-4">
                          {blId ? (
                            <Link href={`/facturation/bl/${blId}`} className="font-semibold text-sky-700 underline">
                              Voir le BL
                            </Link>
                          ) : canWrite ? (
                            <form action={createBonLivraisonAction}>
                              <input type="hidden" name="commande_id" value={commande.id} />
                              <button
                                type="submit"
                                className="rounded-full bg-sky-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-sky-600"
                              >
                                Creer le BL
                              </button>
                            </form>
                          ) : (
                            <span className="text-xs text-slate-400">Pas encore de BL</span>
                          )}
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
