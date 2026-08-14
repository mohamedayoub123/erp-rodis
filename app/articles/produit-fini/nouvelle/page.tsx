import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { createArticleAction } from "../actions";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SubmitButton } from "@/app/_components/submit-button";

export default async function NouvelArticlePage() {
  const currentStockUser = await getCurrentStockUser();
  const canWriteArticles = await canWritePageUser(currentStockUser, "articlesProduitFiniNouvelle");

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Ajouter article
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/articles/produit-fini" label="Retour" />
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
            <form action={createArticleAction} className="grid gap-6">
              <div>
                <h2 className="mb-3 text-lg font-bold text-slate-900">Identification</h2>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <input
                    type="text"
                    name="nom_article"
                    placeholder="Nom article"
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                    required
                  />
                  <input
                    type="text"
                    name="type_article"
                    placeholder="Type"
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                  />
                  <input
                    type="text"
                    name="marque"
                    placeholder="Marque"
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                  />
                  <input
                    type="text"
                    name="gamme"
                    placeholder="Gamme"
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                  />
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Nature
                    <select
                      name="nature"
                      defaultValue="fini"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    >
                      <option value="fini">Produit fini (conditionnement)</option>
                      <option value="vrac">Vrac (fabrication)</option>
                    </select>
                  </label>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="min_stock"
                    placeholder="Stock min"
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="max_stock"
                    placeholder="Stock max"
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                  />
                </div>
              </div>

              <div>
                <h2 className="mb-1 text-lg font-bold text-slate-900">Production</h2>
                <p className="mb-3 text-xs text-slate-500">
                  Parametres venant de la feuille Data (fabrication / conditionnement).
                </p>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Volume unitaire
                    <input
                      type="number"
                      step="0.001"
                      name="volume_unitaire"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Volume stockage
                    <input
                      type="number"
                      step="0.001"
                      name="volume_stockage"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Contenance
                    <input
                      type="number"
                      step="0.001"
                      name="contenance"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Cadence
                    <input
                      type="number"
                      step="0.01"
                      name="cadence"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Nb carton par vrac
                    <input
                      type="number"
                      step="0.01"
                      name="nb_carton_par_vrac"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Max production vrac 8h
                    <input
                      type="number"
                      step="0.01"
                      name="max_production_vrac_8h"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Nb piece par max vrac
                    <input
                      type="number"
                      step="0.01"
                      name="nb_piece_par_max_vrac"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Piece par carton
                    <input
                      type="number"
                      step="0.01"
                      name="piece_par_carton"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Min vrac
                    <input
                      type="number"
                      step="0.01"
                      name="min_vrac"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Max vrac auto
                    <input
                      type="number"
                      step="0.01"
                      name="max_vrac_auto"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Vrac max manuel
                    <input
                      type="number"
                      step="0.01"
                      name="vrac_max_manuel"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Dispenseur pcs/carton
                    <input
                      type="number"
                      step="0.01"
                      name="dispenseur_pcs_carton"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                </div>
              </div>

              <div>
                <h2 className="mb-3 text-lg font-bold text-slate-900">Besoins emballage</h2>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                  {[
                    ["besoin_pot_flacon", "Pot / flacon"],
                    ["besoin_capsule", "Capsule"],
                    ["besoin_sleeve", "Sleeve"],
                    ["besoin_dispenseur", "Dispenseur"],
                    ["besoin_carton", "Carton"],
                    ["besoin_etiquette", "Etiquette"],
                    ["besoin_etui", "Etui"],
                  ].map(([name, label]) => (
                    <label
                      key={name}
                      className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    >
                      <input type="checkbox" name={name} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <SubmitButton
                  pendingLabel="Enregistrement..."
                  className="rounded-full bg-amber-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-500"
                >
                  Enregistrer article
                </SubmitButton>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
