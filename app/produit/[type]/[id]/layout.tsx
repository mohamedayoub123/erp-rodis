import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ProduitTabs } from "./produit-tabs";

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
  const { data } = await supabaseServer.from(table).select("nom_article").eq("id", articleId).maybeSingle();
  const nomArticle = (data as { nom_article: string } | null)?.nom_article;

  if (!nomArticle) {
    notFound();
  }

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
        </section>

        {children}
      </div>
    </main>
  );
}
