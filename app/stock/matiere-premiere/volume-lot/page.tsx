import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { canViewPageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { lireArticlesMpPourFormulaires } from "@/lib/articles-mp-liste";
import { VolumeLotMp, type ArticleOption } from "./volume-lot-mp";

// Volume par lot MP : on choisit un article et son lot, on tape longueur / largeur / hauteur d'un colis, le volume sort tout seul.
// Les lots ne sont lus qu'a la demande, pour l'article choisi (voir actions.ts) : la page n'ouvre que la liste des articles.
export default async function VolumeLotMpPage() {
  noStore();
  const currentUser = await getCurrentStockUser();

  // Controle cote serveur AVANT de lire les donnees (la barriere d'acces de la mise en page ne doit pas etre la seule protection).
  if (!(await canViewPageUser(currentUser, "volumeLotMp"))) {
    return (
      <main className="px-6 py-10 lg:px-10">
        <section className="mx-auto max-w-3xl rounded-[2rem] border border-red-200 bg-white p-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700">Acces non autorise</p>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
            Cette page n&apos;est pas ouverte pour {currentUser ?? "ce compte"}
          </h1>
        </section>
      </main>
    );
  }

  let articles: ArticleOption[] = [];
  let erreur: string | null = null;
  try {
    articles = (await lireArticlesMpPourFormulaires()).map((article) => ({ id: article.id, label: article.nom_article }));
  } catch (error) {
    erreur = error instanceof Error ? error.message : "Articles indisponibles.";
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Volume par lot MP</h1>
              <p className="mt-2 text-sm text-slate-600">
                Choisis un article et son lot, tape la longueur, la largeur et la hauteur d&apos;un colis (en cm) : le volume
                d&apos;un colis et celui du lot sortent tout seuls (rien n&apos;est enregistre).
              </p>
            </div>
            <div className="flex items-center gap-3">
              <BackButton href="/stock/matiere-premiere" label="Retour gestion stock MP" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {erreur ? (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{erreur}</p>
        ) : (
          <VolumeLotMp articles={articles} />
        )}
      </div>
    </main>
  );
}
