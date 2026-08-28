import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";

type CommandeRow = {
  id: number;
  code: string;
  created_at: string;
  created_by: string | null;
};

export default async function CommandesArticlePlastiquePage() {
  noStore();

  const { data: commandesData } = await supabaseServer
    .from("commandes_article_plastique")
    .select("id, code, created_at, created_by")
    .order("created_at", { ascending: false });
  const commandes = (commandesData ?? []) as CommandeRow[];

  const { data: lignesData } = await supabaseServer
    .from("commandes_article_plastique_lignes")
    .select("commande_id");
  const countByCommandeId = new Map<number, number>();
  for (const ligne of (lignesData ?? []) as { commande_id: number }[]) {
    countByCommandeId.set(ligne.commande_id, (countByCommandeId.get(ligne.commande_id) ?? 0) + 1);
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">
                Production Plastique
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Commandes Article Plastique</h1>
              <p className="mt-2 text-sm text-slate-600">
                Enregistrees depuis Statistique Article Plastique (E3) - chaque Save cree une nouvelle commande.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production-plastique" label="Retour" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {commandes.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-500">Aucune commande enregistree pour le moment.</p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-semibold">Code</th>
                  <th className="px-6 py-4 font-semibold">Date</th>
                  <th className="px-6 py-4 font-semibold">Cree par</th>
                  <th className="px-6 py-4 font-semibold">Articles</th>
                </tr>
              </thead>
              <tbody>
                {commandes.map((commande) => (
                  <tr key={commande.id} className="border-t border-slate-100">
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      <Link
                        href={`/production-plastique/commandes/${commande.code}`}
                        className="text-blue-700 underline"
                      >
                        {commande.code}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{formatDate(commande.created_at.slice(0, 10))}</td>
                    <td className="px-6 py-4 text-slate-600">{commande.created_by || "-"}</td>
                    <td className="px-6 py-4 text-slate-600">{countByCommandeId.get(commande.id) ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
