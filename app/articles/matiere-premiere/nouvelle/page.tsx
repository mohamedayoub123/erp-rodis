import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { createArticleMpAction } from "../actions";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";

export default async function NouvelArticleMpPage() {
  const currentStockUser = await getCurrentStockUser();
  const canWriteArticles = await canWritePageUser(currentStockUser, "articlesMatierePremiereNouvelle");

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Ajouter article MP
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/articles/matiere-premiere" label="Retour" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {!canWriteArticles ? (
            <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-600">
              Lecture seule : ajout d&apos;article cache pour cet utilisateur.
            </p>
          ) : (
            <form action={createArticleMpAction} className="grid gap-4">
              <input
                type="text"
                name="nom_article"
                placeholder="Nom article"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                required
              />
              <input
                type="text"
                name="categorie"
                placeholder="Categorie"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
              />
              <input
                type="text"
                name="unite"
                placeholder="Unite"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
              />
              <input
                type="text"
                name="gamme"
                placeholder="Gamme"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
              />
              <input
                type="text"
                name="utilisation"
                placeholder="Utilisation"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  type="number"
                  step="0.01"
                  name="min_stock"
                  placeholder="Stock min"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                />
                <input
                  type="number"
                  step="0.01"
                  name="max_stock"
                  placeholder="Stock max"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                />
              </div>

              <div>
                <button
                  type="submit"
                  className="rounded-full bg-amber-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-500"
                >
                  Enregistrer article
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
