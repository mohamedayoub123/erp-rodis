import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";

type BonLivraisonRow = {
  id: number;
  numero: number | null;
  date_jour: string;
  commande_id: number;
};

export default async function FacturationBlListPage() {
  noStore();

  const { data: blData } = await supabaseServer
    .from("bons_livraison")
    .select("id, numero, date_jour, commande_id")
    .order("id", { ascending: false });
  const bls = (blData ?? []) as BonLivraisonRow[];

  const commandeIds = [...new Set(bls.map((bl) => bl.commande_id))];
  const { data: commandesData } = await supabaseServer
    .from("commandes")
    .select("id, numero_proforma, client")
    .in("id", commandeIds.length > 0 ? commandeIds : [0]);
  const commandeById = new Map(
    ((commandesData ?? []) as { id: number; numero_proforma: string; client: string }[]).map((c) => [c.id, c])
  );

  const factureIds = [...new Set(bls.map((bl) => bl.id))];
  const { data: facturesData } = await supabaseServer
    .from("factures")
    .select("id, bon_livraison_id")
    .in("bon_livraison_id", factureIds.length > 0 ? factureIds : [0]);
  const factureIdByBlId = new Map(
    ((facturesData ?? []) as { id: number; bon_livraison_id: number }[]).map((f) => [f.bon_livraison_id, f.id])
  );

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Bon de Livraison</h1>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/facturation" label="Retour Facturation" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {bls.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              Aucun Bon de Livraison pour le moment - cree en depuis{" "}
              <Link href="/facturation/proforma" className="font-semibold text-sky-700 underline">
                Proforma
              </Link>
              .
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">BL</th>
                    <th className="px-6 py-4 font-semibold">Date</th>
                    <th className="px-6 py-4 font-semibold">Proforma</th>
                    <th className="px-6 py-4 font-semibold">Client</th>
                    <th className="px-6 py-4 font-semibold">Facture</th>
                  </tr>
                </thead>
                <tbody>
                  {bls.map((bl) => {
                    const commande = commandeById.get(bl.commande_id);
                    const factureId = factureIdByBlId.get(bl.id);
                    return (
                      <tr key={bl.id} className="border-t border-slate-100">
                        <td className="px-6 py-4 font-semibold text-slate-900">
                          <Link href={`/facturation/bl/${bl.id}`} className="text-sky-700 underline">
                            {`BL.${bl.date_jour.slice(0, 4)}.${bl.numero ?? bl.id}`}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-slate-600">{formatDate(bl.date_jour)}</td>
                        <td className="px-6 py-4 text-slate-600">{commande?.numero_proforma ?? "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{commande?.client ?? "-"}</td>
                        <td className="px-6 py-4">
                          {factureId ? (
                            <Link href={`/facturation/facture/${factureId}`} className="font-semibold text-sky-700 underline">
                              Voir
                            </Link>
                          ) : (
                            <span className="text-xs text-slate-400">Pas encore</span>
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
