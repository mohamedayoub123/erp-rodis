import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DateJmaFormField } from "@/app/_components/date-jma-input";
import { ZONE_GROUPS } from "@/lib/zone-chaine-list";
import { createManualFabricationEntryAction } from "../../actions";
import { ProduitPickerField } from "../../produit-picker-field";
import { TempsField } from "../[ligneId]/fabrication-form";

const TYPE_FABRICATION_OPTIONS = [
  "Automatique",
  "Semi auto",
  "Gel douche",
  "Parfume",
  "Huile/Serum",
  "Savon",
  "Talc",
];

const ARRET_CAUSES = [
  { field: "fabrication_arret_absence_air", label: "Absence d'air" },
  { field: "fabrication_arret_absence_vapeur", label: "Absence de vapeur" },
  { field: "fabrication_arret_attente_aspiration_aqueuse", label: "Attente aspiration aqueuse vers trimix" },
  { field: "fabrication_arret_attente_cuves_mobiles", label: "Attente de cuves mobiles" },
  { field: "fabrication_arret_attente_eau_osmosee", label: "Attente eau osmosee" },
  { field: "fabrication_arret_coupure_electrique", label: "Coupure electrique" },
  { field: "fabrication_arret_maintenance_plateforme", label: "Maintenance sur la plateforme" },
  { field: "fabrication_arret_manque_cuves_mobiles", label: "Manque de cuves mobiles" },
  { field: "fabrication_arret_probleme_pompe", label: "Probleme de la pompe" },
  { field: "fabrication_arret_probleme_ph", label: "Probleme de PH" },
  { field: "fabrication_arret_probleme_technique", label: "Probleme technique" },
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

export default async function NouvelleFicheFabricationPage() {
  noStore();

  const currentStockUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentStockUser, "productionSuiviProductionFabrication");
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
                Nouvelle fiche Fabrication
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
            <form action={createManualFabricationEntryAction} className="grid gap-6">
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
                  fabrication).
                </p>
                <label className="grid max-w-xs gap-1 text-xs font-semibold text-slate-500">
                  Date fabrication
                  <DateJmaFormField name="date_fabrication_conditionnement" required />
                </label>
              </div>

              <div>
                <h2 className="mb-3 text-lg font-bold text-slate-900">Equipe</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Machine
                    <input
                      type="text"
                      name="machine"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Preparateur
                    <input
                      type="text"
                      name="preparateur"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Type
                    <select
                      name="type_fabrication"
                      defaultValue=""
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    >
                      <option value="">-</option>
                      {TYPE_FABRICATION_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div>
                <h2 className="mb-1 text-lg font-bold text-slate-900">Cuves</h2>
                <p className="mb-3 text-xs text-slate-500">
                  Jusqu&apos;a 4 cuves utilisees pour cette preparation (numero reel de la cuve + poids).
                </p>
                <div className="grid gap-4 md:grid-cols-4">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    N cuve 1
                    <input
                      type="text"
                      name="cuve_1_numero"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    N cuve 2
                    <input
                      type="text"
                      name="cuve_2_numero"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    N cuve 3
                    <input
                      type="text"
                      name="cuve_3_numero"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    N cuve 4
                    <input
                      type="text"
                      name="cuve_4_numero"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Poids cuve 1
                    <input
                      type="number"
                      step="0.01"
                      name="cuve_1_poids"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Poids cuve 2
                    <input
                      type="number"
                      step="0.01"
                      name="cuve_2_poids"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Poids cuve 3
                    <input
                      type="number"
                      step="0.01"
                      name="cuve_3_poids"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Poids cuve 4
                    <input
                      type="number"
                      step="0.01"
                      name="cuve_4_poids"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                </div>
              </div>

              <div>
                <h2 className="mb-1 text-lg font-bold text-slate-900">Temps</h2>
                <p className="mb-3 text-xs text-slate-500">
                  Jour/mois + heure pour chaque temps, une preparation pouvant s&apos;etaler sur
                  plusieurs jours.
                </p>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <TempsField label="Debut preparation" name="temps_debut_preparation" defaultValue="" />
                  <TempsField
                    label="Envoi echantillon labo"
                    name="temps_envoi_echantillon_labo"
                    defaultValue=""
                  />
                  <TempsField label="Fin test" name="temps_fin_test" defaultValue="" />
                  <TempsField label="Vidange" name="temps_vidange" defaultValue="" />
                </div>
              </div>

              <div>
                <h2 className="mb-3 text-lg font-bold text-slate-900">Controle qualite</h2>
                <div className="grid gap-4 md:grid-cols-4">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    pH
                    <input
                      type="number"
                      step="0.01"
                      name="ph"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Densite
                    <input
                      type="number"
                      step="0.01"
                      name="densite"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Viscosite
                    <input
                      type="number"
                      step="0.01"
                      name="viscosite"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Stabilite
                    <select
                      name="stabilite"
                      defaultValue=""
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    >
                      <option value="">-</option>
                      <option value="Stable">Stable</option>
                      <option value="Non stable">Non stable</option>
                    </select>
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
              </div>

              <div>
                <h2 className="mb-1 text-lg font-bold text-slate-900">Production</h2>
                <p className="mb-3 text-xs text-slate-500">
                  Ce qui est saisi ici est retire de ce qu&apos;il reste a faire (visible dans le
                  Dashboard).
                </p>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Vrac fabrique
                    <input
                      type="number"
                      step="0.01"
                      name="vrac_fabrique"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Qt vrac recupere
                    <input
                      type="number"
                      step="0.01"
                      name="qt_vrac_recupere"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Code vrac recupere
                    <input
                      type="text"
                      name="code_vrac_recupere"
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
