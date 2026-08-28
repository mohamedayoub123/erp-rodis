import { notFound } from "next/navigation";
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

type LigneRow = {
  id: number;
  article_id: number;
  nom_article: string;
  categorie: string | null;
  gamme: string | null;
  qt_avis: string | null;
  stock_actuel: number;
};

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

export default async function CommandeArticlePlastiqueDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  const { data: commande } = await supabaseServer
    .from("commandes_article_plastique")
    .select("id, code, created_at, created_by")
    .eq("code", code)
    .maybeSingle();

  if (!commande) notFound();

  const { data: lignesData } = await supabaseServer
    .from("commandes_article_plastique_lignes")
    .select("id, article_id, nom_article, categorie, gamme, qt_avis, stock_actuel")
    .eq("commande_id", (commande as CommandeRow).id)
    .order("nom_article", { ascending: true });
  const lignes = (lignesData ?? []) as LigneRow[];

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">
                Production Plastique
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Commande {(commande as CommandeRow).code}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                {formatDate((commande as CommandeRow).created_at.slice(0, 10))}
                {(commande as CommandeRow).created_by ? ` - ${(commande as CommandeRow).created_by}` : ""}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production-plastique/commandes" label="Retour commandes" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {lignes.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-500">Aucun article dans cette commande.</p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-semibold">Article</th>
                  <th className="px-6 py-4 font-semibold">Gamme</th>
                  <th className="px-6 py-4 font-semibold">Categorie</th>
                  <th className="px-6 py-4 font-semibold">Qt avis</th>
                  <th className="px-6 py-4 font-semibold">Stock actuel</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((ligne) => (
                  <tr key={ligne.id} className="border-t border-slate-100">
                    <td className="px-6 py-4 font-medium text-slate-900">{ligne.nom_article}</td>
                    <td className="px-6 py-4 text-slate-600">{ligne.gamme || "-"}</td>
                    <td className="px-6 py-4 text-slate-600">{ligne.categorie || "-"}</td>
                    <td className="px-6 py-4 font-semibold text-emerald-700">{ligne.qt_avis || "-"}</td>
                    <td className="px-6 py-4 text-slate-600">{formatNumber(ligne.stock_actuel)}</td>
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
