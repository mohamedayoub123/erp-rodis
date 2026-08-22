import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canVoirPrixUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { fetchQuantitesProduitesParArticleSurPeriode, type CoutReelPeriode } from "@/lib/cout-production-reel";
import { fetchCoutsParCartonProduitsFinis } from "@/lib/prix-revient";
import { familyRank, articleTypeRank, articleContenanceFromName } from "@/lib/gamme-families";
import { CoutReelTable, type CoutReelArticleRow } from "./cout-reel-table";

function currentMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { fromIso: from.toISOString().slice(0, 10), toIso: now.toISOString().slice(0, 10) };
}

export default async function CoutReelListePage() {
  noStore();

  const currentUser = await getCurrentStockUser();
  const canVoirPrix = await canVoirPrixUser(currentUser);

  if (!canVoirPrix) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
        <div className="mx-auto w-full max-w-2xl">
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            La visibilite des prix est reservee - demande l&apos;acces a un administrateur si besoin.
          </section>
        </div>
      </main>
    );
  }

  const defaultRange = currentMonthRange();
  const periode: CoutReelPeriode = { dateFrom: defaultRange.fromIso, dateTo: defaultRange.toIso };

  // Liste rapide : cout par carton (vrac + conditionnement, deja optimise -
  // fetchCoutsParCartonProduitsFinis partage ses lots MP entre TOUS les
  // articles de l'appel) - jamais computeCoutReelArticle ici (electricite/
  // journaliers/charge generale sont trop couteux pour etre recalcules en
  // boucle sur toute la liste ; ce detail complet reste sur la fiche par
  // article, accessible en cliquant une ligne).
  const quantitesParArticle = await fetchQuantitesProduitesParArticleSurPeriode(periode);
  const articleIds = [...quantitesParArticle.keys()];

  const { data: articlesData } = articleIds.length
    ? await supabaseServer
        .from("articles")
        .select("id, nom_article, nature, prix_vente, gamme, code_manu, code_auto")
        .in("id", articleIds)
    : { data: [] };
  const articlesFinis = (
    (articlesData ?? []) as {
      id: number;
      nom_article: string;
      nature: string | null;
      prix_vente: number | null;
      gamme: string | null;
      code_manu: string | null;
      code_auto: string | null;
    }[]
  ).filter((a) => a.nature !== "vrac");

  const couts = await fetchCoutsParCartonProduitsFinis(
    articlesFinis.map((a) => a.id),
    quantitesParArticle
  );

  const rows: CoutReelArticleRow[] = articlesFinis.map((article) => {
    const quantite = quantitesParArticle.get(article.id) ?? 0;
    const coutInfo = couts.get(article.id);
    const coutTotal = coutInfo?.coutParCarton !== null && coutInfo?.coutParCarton !== undefined ? coutInfo.coutParCarton * quantite : 0;
    const venteTotale = article.prix_vente ? article.prix_vente * quantite : null;
    const marge = venteTotale !== null ? venteTotale - coutTotal : null;
    return {
      articleId: article.id,
      code: article.code_manu || article.code_auto || "-",
      nomArticle: article.nom_article,
      quantite,
      coutTotal: Math.round(coutTotal),
      venteTotale: venteTotale !== null ? Math.round(venteTotale) : null,
      marge: marge !== null ? Math.round(marge) : null,
      _gamme: article.gamme,
    };
  });

  // Meme organisation que la page Articles Produit Fini : familles (White
  // Secret en premier), puis a l'interieur d'une famille l'ordre par type
  // d'article (Lait, Creme, DSR, Huile, Serum, Savon...), puis par
  // contenance decroissante, puis alphabetique.
  rows.sort((a, b) => {
    const rankA = familyRank(a._gamme);
    const rankB = familyRank(b._gamme);
    if (rankA !== rankB) return rankA - rankB;

    const typeRankA = articleTypeRank(a.nomArticle);
    const typeRankB = articleTypeRank(b.nomArticle);
    if (typeRankA !== typeRankB) return typeRankA - typeRankB;

    const contenanceDiff = articleContenanceFromName(b.nomArticle) - articleContenanceFromName(a.nomArticle);
    if (contenanceDiff !== 0) return contenanceDiff;

    return a.nomArticle.localeCompare(b.nomArticle, "fr", { sensitivity: "base" });
  });

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Cout Reel</h1>
              <p className="mt-2 text-sm text-slate-600">
                Tous les articles avec une production reelle ce mois-ci ({defaultRange.fromIso} au{" "}
                {defaultRange.toIso}) - cout vrac+conditionnement seulement (rapide). Clique une ligne pour le
                detail complet (electricite, journaliers, charge generale, detail par mois...).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production/rapport" label="Retour rapports" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {rows.length === 0 ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            Aucune production reelle enregistree ce mois-ci.
          </section>
        ) : (
          <CoutReelTable rows={rows} />
        )}
      </div>
    </main>
  );
}
