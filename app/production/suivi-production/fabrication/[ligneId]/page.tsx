import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "../../../suivi/data";
import { vracLabelFromName } from "@/lib/gamme-families";
import { FabricationForm } from "./fabrication-form";

type LigneInfo = {
  id: number;
  zone: string;
  chaine: string;
  produit: string | null;
  date_jour: string;
  numero_lot: string | null;
};

type RapportInfo = {
  machine: string | null;
  type_fabrication: string | null;
  preparateur: string | null;
  cuve_1_numero: string | null;
  cuve_1_poids: number | null;
  cuve_2_numero: string | null;
  cuve_2_poids: number | null;
  cuve_3_numero: string | null;
  cuve_3_poids: number | null;
  cuve_4_numero: string | null;
  cuve_4_poids: number | null;
  temps_debut_preparation: string | null;
  temps_envoi_echantillon_labo: string | null;
  temps_fin_test: string | null;
  temps_vidange: string | null;
  ph: number | null;
  densite: number | null;
  viscosite: number | null;
  stabilite: string | null;
  vrac_fabrique: number | null;
  qt_vrac_recupere: number | null;
  code_vrac_recupere: string | null;
  fabrication_arret_absence_air: number | null;
  fabrication_arret_absence_vapeur: number | null;
  fabrication_arret_attente_aspiration_aqueuse: number | null;
  fabrication_arret_attente_cuves_mobiles: number | null;
  fabrication_arret_attente_eau_osmosee: number | null;
  fabrication_arret_coupure_electrique: number | null;
  fabrication_arret_maintenance_plateforme: number | null;
  fabrication_arret_manque_cuves_mobiles: number | null;
  fabrication_arret_probleme_pompe: number | null;
  fabrication_arret_probleme_ph: number | null;
  fabrication_arret_probleme_technique: number | null;
  date_fabrication_conditionnement: string | null;
  utilisateur_fabrication: string | null;
};

export default async function RapportFabricationPage({
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
  const canWrite = await canWritePageUser(currentStockUser, "productionSuiviProductionFabrication");

  const [{ data: ligneData }, { data: rapportData }] = await Promise.all([
    supabaseServer
      .from("programme_lignes")
      .select("id, zone, chaine, produit, date_jour, numero_lot")
      .eq("id", ligneIdNumber)
      .maybeSingle(),
    supabaseServer
      .from("production_rapports")
      .select(
        "machine, type_fabrication, preparateur, cuve_1_numero, cuve_1_poids, cuve_2_numero, cuve_2_poids, cuve_3_numero, cuve_3_poids, cuve_4_numero, cuve_4_poids, temps_debut_preparation, temps_envoi_echantillon_labo, temps_fin_test, temps_vidange, ph, densite, viscosite, stabilite, vrac_fabrique, qt_vrac_recupere, code_vrac_recupere, fabrication_arret_absence_air, fabrication_arret_absence_vapeur, fabrication_arret_attente_aspiration_aqueuse, fabrication_arret_attente_cuves_mobiles, fabrication_arret_attente_eau_osmosee, fabrication_arret_coupure_electrique, fabrication_arret_maintenance_plateforme, fabrication_arret_manque_cuves_mobiles, fabrication_arret_probleme_pompe, fabrication_arret_probleme_ph, fabrication_arret_probleme_technique, date_fabrication_conditionnement, utilisateur_fabrication"
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
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Rapport Fabrication
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                {formatDate(ligne.date_jour)} - {ligne.zone} / {ligne.chaine} -{" "}
                {vracLabelFromName(ligne.produit) || "-"}
                {ligne.numero_lot ? ` - Lot ${ligne.numero_lot}` : ""}
              </p>
              {rapport?.utilisateur_fabrication ? (
                <p className="mt-1 text-xs text-slate-500">
                  Derniere saisie par {rapport.utilisateur_fabrication}
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
            <FabricationForm ligneId={ligne.id} rapport={rapport} />
          )}
        </section>
      </div>
    </main>
  );
}
