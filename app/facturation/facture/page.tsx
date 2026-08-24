import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";

type FactureRow = {
  id: number;
  numero: number | null;
  date_jour: string;
  bon_livraison_id: number;
  montant: number | null;
};

export default async function FacturationFactureListPage() {
  noStore();

  const { data: facturesData } = await supabaseServer
    .from("factures")
    .select("id, numero, date_jour, bon_livraison_id, montant")
    .order("id", { ascending: false });
  const factures = (facturesData ?? []) as FactureRow[];

  const blIds = [...new Set(factures.map((f) => f.bon_livraison_id))];
  const { data: blData } = await supabaseServer
    .from("bons_livraison")
    .select("id, numero, date_jour, commande_id")
    .in("id", blIds.length > 0 ? blIds : [0]);
  const bls = (blData ?? []) as { id: number; numero: number | null; date_jour: string; commande_id: number }[];
  const blById = new Map(bls.map((bl) => [bl.id, bl]));

  const commandeIds = [...new Set(bls.map((bl) => bl.commande_id))];
  const { data: commandesData } = await supabaseServer
    .from("facturation_commandes")
    .select("id, client")
    .in("id", commandeIds.length > 0 ? commandeIds : [0]);
  const commandeById = new Map(((commandesData ?? []) as { id: number; client: string }[]).map((c) => [c.id, c]));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Facture</h1>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/facturation" label="Retour Facturation" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {factures.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              Aucune Facture pour le moment - cree en depuis{" "}
              <Link href="/facturation/bl" className="font-semibold text-sky-700 underline">
                un Bon de Livraison livre
              </Link>
              .
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Facture</th>
                    <th className="px-6 py-4 font-semibold">Date</th>
                    <th className="px-6 py-4 font-semibold">Client</th>
                    <th className="px-6 py-4 font-semibold">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {factures.map((facture) => {
                    const bl = blById.get(facture.bon_livraison_id);
                    const commande = bl ? commandeById.get(bl.commande_id) : undefined;
                    return (
                      <tr key={facture.id} className="border-t border-slate-100">
                        <td className="px-6 py-4 font-semibold text-slate-900">
                          <Link href={`/facturation/facture/${facture.id}`} className="text-sky-700 underline">
                            {`FAC.${facture.date_jour.slice(0, 4)}.${facture.numero ?? facture.id}`}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-slate-600">{formatDate(facture.date_jour)}</td>
                        <td className="px-6 py-4 text-slate-600">{commande?.client ?? "-"}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {facture.montant !== null ? facture.montant.toLocaleString("fr-FR") : "-"}
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
