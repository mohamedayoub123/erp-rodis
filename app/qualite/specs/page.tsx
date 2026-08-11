import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { SpecsQualiteForm, type SpecRow } from "./specs-form";

type ArticleRow = { id: number; nom_article: string };

type SpecQueryRow = {
  article_id: number;
  ph_min: number | null;
  ph_max: number | null;
  viscosite_min: number | null;
  viscosite_max: number | null;
  densite_min: number | null;
  densite_max: number | null;
  degre_alcool_min: number | null;
  degre_alcool_max: number | null;
  stabilite: string | null;
  couleur: string | null;
  taux_humidite_min: number | null;
  taux_humidite_max: number | null;
  pression_atmospherique_min: number | null;
  pression_atmospherique_max: number | null;
  texture: string | null;
  articles: { nom_article: string } | { nom_article: string }[] | null;
};

function articleLabel(row: SpecQueryRow) {
  return Array.isArray(row.articles) ? row.articles[0]?.nom_article : row.articles?.nom_article;
}

export default async function QualiteSpecsPage() {
  noStore();
  const currentUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentUser, "qualiteSpecs");
  const canDelete = await canDeletePageUser(currentUser, "qualiteSpecs");

  const [{ data: vracData, error: vracError }, { data: specsData, error: specsError }] = await Promise.all([
    supabaseServer
      .from("articles")
      .select("id, nom_article")
      .eq("nature", "vrac")
      .order("nom_article", { ascending: true }),
    supabaseServer
      .from("articles_specs_qualite")
      .select(
        "article_id, ph_min, ph_max, viscosite_min, viscosite_max, densite_min, densite_max, degre_alcool_min, degre_alcool_max, stabilite, couleur, taux_humidite_min, taux_humidite_max, pression_atmospherique_min, pression_atmospherique_max, texture, articles!inner(nom_article)"
      ),
  ]);

  const error = vracError || specsError;

  const vracArticles = ((vracData as ArticleRow[] | null) ?? []).map((row) => ({
    id: row.id,
    label: row.nom_article,
  }));

  const specs: SpecRow[] = ((specsData as unknown as SpecQueryRow[] | null) ?? [])
    .map((row) => ({
      article_id: row.article_id,
      article_label: articleLabel(row) || "-",
      ph_min: row.ph_min,
      ph_max: row.ph_max,
      viscosite_min: row.viscosite_min,
      viscosite_max: row.viscosite_max,
      densite_min: row.densite_min,
      densite_max: row.densite_max,
      degre_alcool_min: row.degre_alcool_min,
      degre_alcool_max: row.degre_alcool_max,
      stabilite: row.stabilite,
      couleur: row.couleur,
      taux_humidite_min: row.taux_humidite_min,
      taux_humidite_max: row.taux_humidite_max,
      pression_atmospherique_min: row.pression_atmospherique_min,
      pression_atmospherique_max: row.pression_atmospherique_max,
      texture: row.texture,
    }))
    .sort((a, b) => a.article_label.localeCompare(b.article_label, "fr", { sensitivity: "base" }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f0ff_0%,#faf8ff_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Specs Labo (Vrac)
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Intervalle de tests labo par article vrac : pH, viscosite, densite, degre alcool,
                stabilite, couleur.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/qualite" label="Retour qualite" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error.message}
            </p>
            <p className="mt-3 text-xs text-slate-500">
              Si la table n&apos;existe pas encore, execute
              scripts/sql/create_articles_specs_qualite.sql dans Supabase (SQL Editor).
            </p>
          </section>
        ) : (
          <SpecsQualiteForm
            vracArticles={vracArticles}
            specs={specs}
            canWrite={canWrite}
            canDelete={canDelete}
          />
        )}
      </div>
    </main>
  );
}
