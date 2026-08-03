import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { formatDate } from "../../../suivi/data";
import { saveEmballageRapportAction } from "../../actions";

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
  emballage_temps_demarrer: string | null;
  emballage_temps_arret: string | null;
};

export default async function RapportEmballagePage({
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
  const canWrite = await canWritePageUser(currentStockUser, "productionSuiviProductionEmballage");

  const [{ data: ligneData }, { data: rapportData }] = await Promise.all([
    supabaseServer
      .from("programme_lignes")
      .select("id, zone, chaine, produit, date_jour, numero_lot")
      .eq("id", ligneIdNumber)
      .maybeSingle(),
    supabaseServer
      .from("production_rapports")
      .select(
        "emballage_machine, emballage_operateur, emballage_scotcheuse, emballage_temps_demarrer, emballage_temps_arret"
      )
      .eq("programme_ligne_id", ligneIdNumber)
      .maybeSingle(),
  ]);

  const ligne = ligneData as LigneInfo | null;
  const rapport = rapportData as RapportInfo | null;

  if (!ligne) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
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
                {ligne.numero_lot ? ` - Lot ${ligne.numero_lot}` : ""}
              </p>
            </div>

            <BackButton href="/production/suivi/dashboard" label="Retour dashboard" />
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

              <div>
                <h2 className="mb-3 text-lg font-bold text-slate-900">Equipe</h2>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Machine
                    <input
                      type="text"
                      name="emballage_machine"
                      defaultValue={rapport?.emballage_machine || ""}
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Operateur
                    <input
                      type="text"
                      name="emballage_operateur"
                      defaultValue={rapport?.emballage_operateur || ""}
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Scotcheuse
                    <input
                      type="text"
                      name="emballage_scotcheuse"
                      defaultValue={rapport?.emballage_scotcheuse || ""}
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
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Temps arret
                    <input
                      type="time"
                      name="emballage_temps_arret"
                      defaultValue={rapport?.emballage_temps_arret || ""}
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
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
