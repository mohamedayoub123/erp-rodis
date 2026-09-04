import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import {
  computeCartonsPossiblesTotal,
  computeLignesCapacite,
  fetchStockActuelMp,
  findLigneLimitante,
} from "../capacite-lib";

type ArticlePfRow = {
  id: number;
  nom_article: string;
  gamme: string | null;
  nature: string | null;
  quantite_recette_base: number | null;
};

type RecetteLigneRow = {
  id: number;
  article_mp_id: number;
  quantite: number;
};

export default async function CapaciteConditionnementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  noStore();
  const { id } = await params;
  const articlePfId = Number(id);

  const { data: articlePf } = await supabaseServer
    .from("articles")
    .select("id, nom_article, gamme, nature, quantite_recette_base")
    .eq("id", articlePfId)
    .maybeSingle();

  if (!articlePf || (articlePf as ArticlePfRow).nature === "vrac") {
    notFound();
  }

  const pf = articlePf as ArticlePfRow;

  const [{ data: lignesData, error: lignesError }, stockActuelRows] = await Promise.all([
    supabaseServer
      .from("recettes_pf")
      .select("id, article_mp_id, quantite")
      .eq("article_pf_id", articlePfId)
      .order("id", { ascending: true }),
    fetchStockActuelMp(),
  ]);

  const lignes = (lignesData ?? []) as RecetteLigneRow[];
  const stockById = new Map(stockActuelRows.map((row) => [row.article_id, row]));
  const quantiteRecetteBase = pf.quantite_recette_base;

  const lignesCapacite = computeLignesCapacite(lignes, quantiteRecetteBase, stockById);
  const cartonsPossiblesTotal = computeCartonsPossiblesTotal(lignesCapacite);
  const ligneLimitante = findLigneLimitante(lignesCapacite, cartonsPossiblesTotal);

  const lignesTriees = [...lignesCapacite].sort((a, b) => {
    if (a.cartonsPossibles === null) return 1;
    if (b.cartonsPossibles === null) return -1;
    return a.cartonsPossibles - b.cartonsPossibles;
  });

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff7ed_0%,#fffaf3_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{pf.nom_article}</h1>
              {pf.gamme ? <p className="mt-1 text-sm text-slate-600">{pf.gamme}</p> : null}
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/stock/matiere-premiere/rapport/capacite-conditionnement" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {lignesError ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {lignesError.message}
            </p>
          </section>
        ) : lignes.length === 0 ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm text-slate-500">Aucune recette Conditionnement pour ce produit.</p>
          </section>
        ) : !quantiteRecetteBase ? (
          <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-medium text-amber-800">
              Le &quot;Nombre de cartons du lot&quot; n&apos;est pas renseigne sur la recette
              Conditionnement de ce produit - impossible de calculer la quantite necessaire par
              carton. Renseigne-le d&apos;abord sur la recette.
            </p>
          </section>
        ) : (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Avec le stock actuel, tu peux faire environ
            </p>
            <p className="mt-1 text-4xl font-black text-slate-900">
              {cartonsPossiblesTotal !== null ? cartonsPossiblesTotal.toLocaleString("fr-FR") : "-"}{" "}
              <span className="text-lg font-semibold text-slate-500">carton(s)</span>
            </p>
            {ligneLimitante ? (
              <p className="mt-2 text-sm text-slate-600">
                Limite par <span className="font-semibold text-slate-900">{ligneLimitante.nomArticle}</span> (stock
                actuel {ligneLimitante.stockActuel.toLocaleString("fr-FR")} {ligneLimitante.unite || ""}).
              </p>
            ) : null}
          </section>
        )}

        {lignes.length > 0 ? (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Article</th>
                    <th className="px-6 py-4 font-semibold">Unite</th>
                    <th className="px-6 py-4 font-semibold">Qte necessaire / carton</th>
                    <th className="px-6 py-4 font-semibold">Stock actuel</th>
                    <th className="px-6 py-4 font-semibold">Cartons possibles</th>
                  </tr>
                </thead>
                <tbody>
                  {lignesTriees.map((ligne) => {
                    const estLimitante = ligne.cartonsPossibles === cartonsPossiblesTotal;
                    return (
                      <tr
                        key={ligne.ligneId}
                        className={`border-t border-slate-100 ${estLimitante ? "bg-amber-50" : ""}`}
                      >
                        <td className="px-6 py-4 font-medium text-slate-900">{ligne.nomArticle}</td>
                        <td className="px-6 py-4 text-slate-600">{ligne.unite || "-"}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {ligne.quantiteParCarton !== null
                            ? ligne.quantiteParCarton.toLocaleString("fr-FR", { maximumFractionDigits: 3 })
                            : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {ligne.stockActuel.toLocaleString("fr-FR")}
                        </td>
                        <td className={`px-6 py-4 font-semibold ${estLimitante ? "text-amber-700" : "text-slate-900"}`}>
                          {ligne.cartonsPossibles !== null ? ligne.cartonsPossibles.toLocaleString("fr-FR") : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
