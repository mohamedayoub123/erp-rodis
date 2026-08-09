import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "../../../suivi/data";
import { saveEmballageRapportAction } from "../../actions";
import { DateJmaFormField } from "@/app/_components/date-jma-input";

const ARRET_CAUSES = [
  { field: "emballage_arret_changement_bobine", label: "ARRET CHANGEMENT BOBINE" },
  { field: "emballage_arret_technique", label: "ARRET TECHNIQUE" },
  { field: "emballage_arret_reglage", label: "ARRET REGLAGE" },
  { field: "emballage_arret_coupure", label: "ARRET COUPURE" },
  { field: "emballage_arret_autre", label: "AUTRE ARRET" },
] as const;

type LigneInfo = {
  id: number;
  zone: string;
  chaine: string;
  produit: string | null;
  date_jour: string;
  numero_lot: string | null;
};

type RapportInfo = {
  emballage_machine: string | null;
  emballage_operateur: string | null;
  emballage_scotcheuse: string | null;
  emballage_chef_zone: string | null;
  nb_journaliers_emballage: number | null;
  emballage_temps_demarrer: string | null;
  emballage_temps_arret: string | null;
  emballage_arret_changement_bobine: number | null;
  emballage_arret_technique: number | null;
  emballage_arret_reglage: number | null;
  emballage_arret_coupure: number | null;
  emballage_arret_autre: number | null;
  date_emballage: string | null;
  date_peremption: string | null;
  utilisateur_emballage: string | null;
};

type SearchParams = Promise<{ code?: string }>;

export default async function RapportEmballagePage({
  params,
  searchParams,
}: {
  params: Promise<{ ligneId: string }>;
  searchParams: SearchParams;
}) {
  noStore();
  const { ligneId } = await params;
  const ligneIdNumber = Number(ligneId);
  const { code: codeParam } = await searchParams;
  const code = (codeParam || "").trim();

  if (!ligneIdNumber) {
    notFound();
  }

  const currentStockUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentStockUser, "productionSuiviProductionEmballage");

  const RAPPORT_FIELDS =
    "emballage_machine, emballage_operateur, emballage_scotcheuse, emballage_chef_zone, nb_journaliers_emballage, emballage_temps_demarrer, emballage_temps_arret, emballage_arret_changement_bobine, emballage_arret_technique, emballage_arret_reglage, emballage_arret_coupure, emballage_arret_autre, date_emballage, date_peremption, utilisateur_emballage";

  const [{ data: ligneData }, { data: rapportData }] = await Promise.all([
    supabaseServer
      .from("programme_lignes")
      .select("id, zone, chaine, produit, date_jour, numero_lot")
      .eq("id", ligneIdNumber)
      .maybeSingle(),
    supabaseServer
      .from("production_rapports")
      .select(RAPPORT_FIELDS)
      .eq("programme_ligne_id", ligneIdNumber)
      .eq("code", code)
      .maybeSingle(),
  ]);

  const ligne = ligneData as LigneInfo | null;
  let rapport = rapportData as RapportInfo | null;

  // Meme repli que Conditionnement : seulement pour une ligne jamais
  // decoupee en plusieurs lots, l'ancien rapport partage (code "") reste
  // sans ambiguite le bon prefill.
  if (!rapport && code) {
    const numeroLotCodes = (ligne?.numero_lot || "").split(",").map((c) => c.trim()).filter(Boolean);
    if (numeroLotCodes.length <= 1) {
      const { data: legacyRapport } = await supabaseServer
        .from("production_rapports")
        .select(RAPPORT_FIELDS)
        .eq("programme_ligne_id", ligneIdNumber)
        .eq("code", "")
        .maybeSingle();
      rapport = legacyRapport as RapportInfo | null;
    }
  }

  if (!ligne) {
    notFound();
  }

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
                Rapport Emballage
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                {formatDate(ligne.date_jour)} - {ligne.produit || "-"}
                {code ? ` - Lot ${code}` : ligne.numero_lot ? ` - Lot ${ligne.numero_lot}` : ""}
              </p>
              {rapport?.utilisateur_emballage ? (
                <p className="mt-1 text-xs text-slate-500">
                  Derniere saisie par {rapport.utilisateur_emballage}
                </p>
              ) : null}
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
              Lecture seule : saisie de rapport cachee pour cet utilisateur.
            </p>
          ) : (
            <form action={saveEmballageRapportAction} className="grid gap-6">
              <input type="hidden" name="ligne_id" value={ligne.id} />
              <input type="hidden" name="code" value={code} />

              <div>
                <h2 className="mb-1 text-lg font-bold text-slate-900">Date</h2>
                <p className="mb-3 text-xs text-slate-500">
                  Cette date remplace la date automatique dans Suivi Production (colonne Date
                  emballage).
                </p>
                <label className="grid max-w-xs gap-1 text-xs font-semibold text-slate-500">
                  Date emballage
                  <DateJmaFormField name="date_emballage" defaultValue={rapport?.date_emballage} required />
                </label>
                <p className="mt-3 text-xs font-semibold text-slate-500">
                  Date d&apos;expiration : {rapport?.date_peremption || "non renseignee"} (reprise
                  automatiquement du Conditionnement, pas modifiable ici)
                </p>
              </div>

              <div>
                <h2 className="mb-3 text-lg font-bold text-slate-900">Equipe</h2>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Nom chef de zone
                    <input
                      type="text"
                      name="emballage_chef_zone"
                      defaultValue={rapport?.emballage_chef_zone || ""}
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Machine
                    <input
                      type="text"
                      name="emballage_machine"
                      defaultValue={rapport?.emballage_machine || ""}
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Operateur
                    <input
                      type="text"
                      name="emballage_operateur"
                      defaultValue={rapport?.emballage_operateur || ""}
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Scotcheuse
                    <input
                      type="text"
                      name="emballage_scotcheuse"
                      defaultValue={rapport?.emballage_scotcheuse || ""}
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
                      defaultValue={rapport?.nb_journaliers_emballage ?? "0"}
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
                      defaultValue={rapport?.emballage_temps_demarrer || ""}
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Temps arret
                    <input
                      type="time"
                      name="emballage_temps_arret"
                      defaultValue={rapport?.emballage_temps_arret || ""}
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
                        defaultValue={rapport?.[cause.field] ?? "0"}
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
                <button
                  type="submit"
                  className="rounded-full bg-amber-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-500"
                >
                  Save
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
