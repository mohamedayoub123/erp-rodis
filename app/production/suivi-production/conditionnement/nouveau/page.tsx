import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DateJmaFormField } from "@/app/_components/date-jma-input";
import { ZONE_GROUPS } from "@/lib/zone-chaine-list";
import { createManualConditionnementEntryAction } from "../../actions";
import { ProduitPickerField } from "../../produit-picker-field";

const ARRET_CAUSES = [
  { field: "arret_depot", label: "ARRET CAUSE DE DEPOT" },
  { field: "arret_consommable_non_livre", label: "ARRET CONSOMMABLE NON LIVRER" },
  {
    field: "arret_manque_conditionnement",
    label: "ARRET DUE AUX MANQUE ARTICLES DE CONDITIONNEMENT: FIN DE BATCH",
  },
  { field: "arret_manque_vrac", label: "ARRET manque VRAC" },
  { field: "arret_technique", label: "ARRET TECHNIQUE" },
  { field: "arret_coupure_courant", label: "ARRET COUPURE COURANT" },
  { field: "arret_raclage_vrac", label: "ARRET RACLAGE DE VRAC" },
  { field: "arret_changement_lot", label: "ARRET CHANGEMENT N° DE LOT" },
  { field: "arret_flacons_nc", label: "ARRET FLACONS NC/FLACONS NON SLEEVE" },
  { field: "arret_autre", label: "AUTRE ARRET" },
] as const;

type ArticleOption = { id: number; nom_article: string };

async function fetchAllArticles(): Promise<ArticleOption[]> {
  const rows: ArticleOption[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, nom_article")
      .order("nom_article", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as ArticleOption[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

export default async function NouvelleFicheConditionnementPage() {
  noStore();

  const currentStockUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentStockUser, "productionSuiviProductionConditionnement");
  const articles = await fetchAllArticles();
  const zoneChaineOptions = ZONE_GROUPS.flat();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Nouvelle fiche Conditionnement
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Pour un lot qui ne vient pas d&apos;un programme deja dispatche - choisis Zone/Chaine,
                Produit et N de lot, puis remplis le reste comme sur &quot;Entrer&quot;.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production/suivi/dashboard" label="Retour dashboard" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {!canWrite ? (
            <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-600">
              Lecture seule : creation de fiche cachee pour cet utilisateur.
            </p>
          ) : (
            <form action={createManualConditionnementEntryAction} className="grid gap-6">
              <div>
                <h2 className="mb-3 text-lg font-bold text-slate-900">Identification</h2>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Zone / Chaine
                    <select
                      name="zone_chaine"
                      defaultValue={`${zoneChaineOptions[0]?.zone}::${zoneChaineOptions[0]?.chaine}`}
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                    >
                      {zoneChaineOptions.map((option) => (
                        <option
                          key={`${option.zone}::${option.chaine}`}
                          value={`${option.zone}::${option.chaine}`}
                        >
                          {option.zone} / {option.chaine}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Produit
                    <ProduitPickerField
                      articles={articles.map((article) => ({ id: article.id, label: article.nom_article }))}
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    N de lot
                    <input
                      type="text"
                      name="numero_lot"
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                </div>
              </div>

              <div>
                <h2 className="mb-3 text-lg font-bold text-slate-900">Equipe</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Nom chef de zone
                    <input
                      type="text"
                      name="chef_zone"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Nom chef de ligne
                    <input
                      type="text"
                      name="chef_ligne"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Nom ravitailleur
                    <input
                      type="text"
                      name="ravitailleur"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Nom tireur
                    <input
                      type="text"
                      name="tireur"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                </div>
              </div>

              <div>
                <h2 className="mb-1 text-lg font-bold text-slate-900">Production</h2>
                <p className="mb-3 text-xs text-slate-500">
                  Ce qui est saisi ici est retire de ce qu&apos;il reste a faire (visible dans le
                  Dashboard).
                </p>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Carton fabriquer
                    <input
                      type="number"
                      step="0.01"
                      name="qt_fabriquer"
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
                    Releve poids reel
                    <input
                      type="number"
                      step="0.01"
                      name="poids_reel"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Date de fabrication
                    <DateJmaFormField name="date_fabrication_conditionnement" required />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Date de peremption
                    <DateJmaFormField name="date_peremption" />
                  </label>
                </div>
              </div>

              <div>
                <h2 className="mb-3 text-lg font-bold text-slate-900">Dechets</h2>
                <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Sleeve
                    <input
                      type="number"
                      step="0.01"
                      name="dechet_sleeve"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Capsule
                    <input
                      type="number"
                      step="0.01"
                      name="dechet_capsule"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Pompe
                    <input
                      type="number"
                      step="0.01"
                      name="dechet_pompe"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Flacon
                    <input
                      type="number"
                      step="0.01"
                      name="dechet_flacon"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Pot
                    <input
                      type="number"
                      step="0.01"
                      name="dechet_pot"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Etiquette
                    <input
                      type="number"
                      step="0.01"
                      name="dechet_etiquette"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                </div>
              </div>

              <div>
                <h2 className="mb-1 text-lg font-bold text-slate-900">Arret</h2>
                <p className="mb-3 text-xs text-slate-500">
                  Temps d&apos;arret (en minutes) pour chaque cause concernee.
                </p>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {ARRET_CAUSES.map((cause) => (
                    <label key={cause.field} className="grid gap-1 text-xs font-semibold text-slate-500">
                      {cause.label}
                      <input
                        type="number"
                        step="1"
                        min="0"
                        name={cause.field}
                        placeholder="minutes"
                        className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Temps demarage lot
                    <input
                      type="time"
                      name="temps_demarage_lot"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Temps arret batch
                    <input
                      type="time"
                      name="temps_arret_batch"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  className="rounded-full bg-amber-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-500"
                >
                  Creer et enregistrer
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
