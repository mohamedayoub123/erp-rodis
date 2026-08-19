import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ProduitTabs } from "./produit-tabs";
import { ProduitDimensionsForm } from "./dimensions-form";

export default async function ProduitDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ type: string; id: string }>;
}) {
  noStore();
  const { type, id } = await params;
  if (type !== "pf" && type !== "mp") {
    notFound();
  }

  const articleId = Number(id);
  if (!articleId) {
    notFound();
  }

  const table = type === "mp" ? "articles_matiere_premiere" : "articles";
  const [{ data }, currentUser] = await Promise.all([
    supabaseServer
      .from(table)
      .select("nom_article, longueur, largeur, hauteur, poids_net, poids_brut")
      .eq("id", articleId)
      .maybeSingle(),
    getCurrentStockUser(),
  ]);
  const article = data as {
    nom_article: string;
    longueur: number | null;
    largeur: number | null;
    hauteur: number | null;
    poids_net: number | null;
    poids_brut: number | null;
  } | null;
  const nomArticle = article?.nom_article;

  if (!nomArticle) {
    notFound();
  }

  const canWrite = await canWritePageUser(currentUser, "produit");

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                Produit - {type === "mp" ? "Matiere premiere" : "Produit fini"}
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{nomArticle}</h1>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/produit" label="Retour" />
              <RefreshButton />
            </div>
          </div>

          <div className="mt-4">
            <ProduitTabs type={type} id={articleId} />
          </div>

          <ProduitDimensionsForm
            type={type}
            articleId={articleId}
            dimensions={{
              longueur: article?.longueur ?? null,
              largeur: article?.largeur ?? null,
              hauteur: article?.hauteur ?? null,
              poids_net: article?.poids_net ?? null,
              poids_brut: article?.poids_brut ?? null,
            }}
            canWrite={canWrite}
          />
        </section>

        {children}
      </div>
    </main>
  );
}
