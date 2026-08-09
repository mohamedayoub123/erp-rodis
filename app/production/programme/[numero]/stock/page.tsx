import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";

type ProgrammeRow = {
  article_id: number;
  vrac_article_id: number | null;
  qt_carton: number;
  qt_vrac: number;
};

type ArticleRow = {
  id: number;
  nom_article: string;
  quantite_recette_base: number | null;
};

type RecetteLigneRow = {
  article_pf_id: number;
  article_mp_id: number;
  quantite: number;
};

type ArticleMpRow = {
  id: number;
  nom_article: string;
  unite: string | null;
};

type MouvementRow = {
  article_id: number | null;
  qte_entree: number;
  qte_sortie: number;
};

function round(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

async function fetchAll<T>(table: string, select: string) {
  const rows: T[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer.from(table).select(select).range(from, from + pageSize - 1);
    if (error) return { rows, error };
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

export default async function ProgrammeVerifierStockPage({
  params,
}: {
  params: Promise<{ numero: string }>;
}) {
  noStore();
  const { numero } = await params;
  const numeroProgramme = Number(numero);
  if (!numeroProgramme) {
    notFound();
  }

  const { data: lignesData, error } = await supabaseServer
    .from("programmes")
    .select("article_id, vrac_article_id, qt_carton, qt_vrac")
    .eq("numero_programme", numeroProgramme);

  const lignes = (lignesData ?? []) as ProgrammeRow[];
  if (!error && lignes.length === 0) {
    notFound();
  }

  const articleIds = [...new Set(lignes.flatMap((l) => [l.article_id, l.vrac_article_id]).filter((id): id is number => !!id))];

  const [
    { data: articlesData, error: articlesError },
    { data: recettesData, error: recettesError },
  ] = await Promise.all([
    supabaseServer.from("articles").select("id, nom_article, quantite_recette_base").in("id", articleIds),
    supabaseServer.from("recettes_pf").select("article_pf_id, article_mp_id, quantite").in("article_pf_id", articleIds),
  ]);

  const chargeError = articlesError || recettesError;
  const articleById = new Map(((articlesData ?? []) as ArticleRow[]).map((a) => [a.id, a]));
  const recettes = (recettesData ?? []) as RecetteLigneRow[];

  // Besoin en MP = quantite de la recette x (qt du programme / quantite_recette_base
  // de l'article calibre) - qt_carton pour la recette Conditionnement (article
  // fini), qt_vrac pour la recette Fabrication (article vrac).
  const besoinParMp = new Map<number, number>();
  for (const ligne of lignes) {
    // quantite_recette_base pas renseigne sur l'article -> recette
    // consideree calibree pour 1 carton/1 kg vrac (meme repli que sur les
    // pages Recette Conditionnement/Fabrication), au lieu de ne rien
    // afficher du tout.
    const article = articleById.get(ligne.article_id);
    const ratioCarton = ligne.qt_carton / (article?.quantite_recette_base || 1);
    for (const r of recettes.filter((r) => r.article_pf_id === ligne.article_id)) {
      besoinParMp.set(r.article_mp_id, (besoinParMp.get(r.article_mp_id) ?? 0) + r.quantite * ratioCarton);
    }
    if (ligne.vrac_article_id) {
      const vracArticle = articleById.get(ligne.vrac_article_id);
      const ratioVrac = ligne.qt_vrac / (vracArticle?.quantite_recette_base || 1);
      for (const r of recettes.filter((r) => r.article_pf_id === ligne.vrac_article_id)) {
        besoinParMp.set(r.article_mp_id, (besoinParMp.get(r.article_mp_id) ?? 0) + r.quantite * ratioVrac);
      }
    }
  }

  const mpIds = [...besoinParMp.keys()];

  const [
    { data: articlesMpData, error: articlesMpError },
    { rows: mouvements, error: mouvementsError },
  ] = await Promise.all([
    supabaseServer.from("articles_matiere_premiere").select("id, nom_article, unite").in("id", mpIds),
    mpIds.length > 0
      ? fetchAll<MouvementRow>("lots_stock_matiere_premiere", "article_id, qte_entree, qte_sortie")
      : Promise.resolve({ rows: [] as MouvementRow[], error: null }),
  ]);

  const finalError = chargeError || articlesMpError || mouvementsError;
  const articleMpById = new Map(((articlesMpData ?? []) as ArticleMpRow[]).map((a) => [a.id, a]));

  const stockParMp = new Map<number, number>();
  for (const mv of mouvements) {
    if (!mv.article_id) continue;
    stockParMp.set(mv.article_id, (stockParMp.get(mv.article_id) ?? 0) + Number(mv.qte_entree ?? 0) - Number(mv.qte_sortie ?? 0));
  }

  const rows = mpIds
    .map((mpId) => ({
      id: mpId,
      nom: articleMpById.get(mpId)?.nom_article ?? `#${mpId}`,
      unite: articleMpById.get(mpId)?.unite ?? "-",
      besoin: round(besoinParMp.get(mpId) ?? 0),
      stock: round(stockParMp.get(mpId) ?? 0),
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              Programme
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Verifier stock - MB{numeroProgramme}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Tous les articles MP des recettes utilisees dans ce programme, avec le besoin
              calcule (qt carton/vrac x quantite recette) et le stock actuel.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href={`/production/programme/${numeroProgramme}`} label="Retour" />
            <RefreshButton />
          </div>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {error || finalError ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {(error || finalError)?.message}
              </p>
            </div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              Aucune recette trouvee pour les articles de ce programme.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Article MP</th>
                    <th className="px-6 py-4 font-semibold">Unite</th>
                    <th className="px-6 py-4 font-semibold">Besoin</th>
                    <th className="px-6 py-4 font-semibold">Stock actuel</th>
                    <th className="px-6 py-4 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const insuffisant = row.besoin > row.stock;
                    return (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-6 py-4 font-medium text-slate-900">{row.nom}</td>
                        <td className="px-6 py-4 text-slate-600">{row.unite}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {row.besoin.toLocaleString("fr-FR", { maximumFractionDigits: 3 })}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {row.stock.toLocaleString("fr-FR", { maximumFractionDigits: 3 })}
                        </td>
                        <td className="px-6 py-4">
                          {insuffisant ? (
                            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                              Insuffisant
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                              OK
                            </span>
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
