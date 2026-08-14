import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DateJmaFormField } from "@/app/_components/date-jma-input";
import { ZONE_GROUPS } from "@/lib/zone-chaine-list";
import { createManualEmballageEntryAction } from "../../actions";
import { ProduitPickerField } from "../../produit-picker-field";
import { SubmitButton } from "@/app/_components/submit-button";

const ARRET_CAUSES = [
  { field: "emballage_arret_changement_bobine", label: "ARRET CHANGEMENT BOBINE" },
  { field: "emballage_arret_technique", label: "ARRET TECHNIQUE" },
  { field: "emballage_arret_reglage", label: "ARRET REGLAGE" },
  { field: "emballage_arret_coupure", label: "ARRET COUPURE" },
  { field: "emballage_arret_autre", label: "AUTRE ARRET" },
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

export default async function NouvelleFicheEmballagePage() {
  noStore();

  const currentStockUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentStockUser, "productionSuiviProductionEmballage");
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
                Nouvelle fiche Emballage
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
            <form action={createManualEmballageEntryAction} className="grid gap-6">
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
                <h2 className="mb-1 text-lg font-bold text-slate-900">Date</h2>
                <p className="mb-3 text-xs text-slate-500">
                  Cette date remplace la date automatique dans Suivi Production (colonne Date
                  emballage).
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Date emballage
                    <DateJmaFormField name="date_emballage" required />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Date d&apos;expiration
                    <DateJmaFormField name="date_peremption" required />
                  </label>
                </div>
              </div>

              <div>
                <h2 className="mb-3 text-lg font-bold text-slate-900">Equipe</h2>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Nom chef de zone
                    <input
                      type="text"
                      name="emballage_chef_zone"
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Machine
                    <input
                      type="text"
                      name="emballage_machine"
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Operateur
                    <input
                      type="text"
                      name="emballage_operateur"
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Scotcheuse
                    <input
                      type="text"
                      name="emballage_scotcheuse"
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Nb de journaliers
                    <input
                      type="number"
                      step="1"
                      min="0"
                      name="nb_journaliers_emballage"
                      defaultValue="0"
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                </div>
              </div>

              <div>
                <h2 className="mb-3 text-lg font-bold text-slate-900">Temps</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Temps demarrer
                    <input
                      type="time"
                      name="emballage_temps_demarrer"
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Temps arret
                    <input
                      type="time"
                      name="emballage_temps_arret"
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                </div>
              </div>

              <div>
                <h2 className="mb-1 text-lg font-bold text-slate-900">Arret</h2>
                <p className="mb-3 text-xs text-slate-500">
                  Temps d&apos;arret (en minutes) pour chaque cause concernee - 0 si pas concerne.
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
                        defaultValue="0"
                        required
                        className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="mb-1 text-lg font-bold text-slate-900">Production</h2>
                <p className="mb-3 text-xs text-slate-500">
                  Ce qui est saisi ici est retire de ce qui reste a emballer (visible dans le
                  Dashboard).
                </p>
                <label className="grid max-w-xs gap-1 text-xs font-semibold text-slate-500">
                  Qt emballee
                  <input
                    type="number"
                    step="0.01"
                    name="quantite"
                    defaultValue="0"
                    required
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                  />
                </label>
              </div>

              <div>
                <SubmitButton
                  pendingLabel="Creation..."
                  className="rounded-full bg-amber-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-500"
                >
                  Creer et enregistrer
                </SubmitButton>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
