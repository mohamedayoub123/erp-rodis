import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "../../suivi/data";
import { saveConditionnementRapportAction } from "../actions";
import { SubmitButton } from "@/app/_components/submit-button";
import { TimeTextInput } from "@/app/_components/time-text-input";

const ARRET_CAUSES = [
  "ARRET CAUSE DE DEPOT",
  "ARRET CONSOMMABLE NON LIVRER",
  "ARRET DUE AUX MANQUE ARTICLES DE CONDITIONNEMENT: FIN DE BATCH",
  "ARRET manque VRAC",
  "ARRET TECHNIQUE",
  "ARRET COUPURE COURANT",
  "ARRET RACLAGE DE VRAC",
  "ARRET CHANGEMENT N° DE LOT",
  "ARRET FLACONS NC/FLACONS NON SLEEVE",
  "AUTRE ARRET",
];

type LigneInfo = {
  id: number;
  zone: string;
  chaine: string;
  produit: string | null;
  date_jour: string;
  numero_lot: string | null;
};

export default async function RapportProductionPage({
  params,
}: {
  params: Promise<{ ligneId: string }>;
}) {
  noStore();
  const { ligneId } = await params;
  const ligneIdNumber = Number(ligneId);

  if (!ligneIdNumber) {
    notFound();
  }

  const currentStockUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentStockUser, "productionSuiviProductionLegacyDetail");

  const { data } = await supabaseServer
    .from("programme_lignes")
    .select("id, zone, chaine, produit, date_jour, numero_lot")
    .eq("id", ligneIdNumber)
    .maybeSingle();

  const ligne = data as LigneInfo | null;

  if (!ligne) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Rapport Production
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                {formatDate(ligne.date_jour)} - {ligne.zone} / {ligne.chaine} - {ligne.produit || "-"}
                {ligne.numero_lot ? ` - Lot ${ligne.numero_lot}` : ""}
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
              Lecture seule : saisie de rapport cachee pour cet utilisateur.
            </p>
          ) : (
            <form action={saveConditionnementRapportAction} className="grid gap-6">
              <input type="hidden" name="ligne_id" value={ligne.id} />

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
                <h2 className="mb-3 text-lg font-bold text-slate-900">Production</h2>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Qt fabriquer
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
                <h2 className="mb-3 text-lg font-bold text-slate-900">Arret</h2>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500 md:col-span-3">
                    Temps d&apos;arret a cause de
                    <select
                      name="arret_cause"
                      defaultValue=""
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    >
                      <option value="">-</option>
                      {ARRET_CAUSES.map((cause) => (
                        <option key={cause} value={cause}>
                          {cause}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Temps demarage lot
                    <TimeTextInput
                      name="temps_demarage_lot"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Temps arret batch
                    <TimeTextInput
                      name="temps_arret_batch"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                </div>
              </div>

              <div>
                <SubmitButton
                  pendingLabel="Enregistrement..."
                  className="rounded-full bg-amber-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-500"
                >
                  Save
                </SubmitButton>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
