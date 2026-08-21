import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "../../../suivi/data";
import { saveConditionnementRapportAction, messageSiConditionnementInvalide } from "../../actions";
import { ZONE_GROUPS } from "@/lib/zone-chaine-list";
import { LigneZoneChaineEditor } from "./zone-chaine-editor";
import { DateJmaFormField } from "@/app/_components/date-jma-input";
import { formatDateTime } from "@/lib/format-date";
import { SubmitButton } from "@/app/_components/submit-button";

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

type LigneInfo = {
  id: number;
  zone: string;
  chaine: string;
  produit: string | null;
  date_jour: string;
  numero_lot: string | null;
};

// date_fabrication_conditionnement/date_peremption sont des proprietes du
// lot/code (partagees entre fournees) - restent sur production_rapports.
type RapportInfo = {
  date_fabrication_conditionnement: string | null;
  date_peremption: string | null;
};

// Tout le reste (chef/ravitailleur/dechets/arrets...) est desormais porte
// PAR FOURNEE sur production_carton_entries (bug reel corrige : ecrase
// avant a chaque nouvelle fournee du meme code) - ce formulaire se
// pre-remplit depuis la fournee la PLUS RECENTE de ce (ligne, code) comme
// point de depart pratique, sans plus jamais ecraser les fournees
// precedentes (une nouvelle ligne est toujours creee au Save).
type DerniereFourneeInfo = {
  chef_zone: string | null;
  chef_ligne: string | null;
  ravitailleur: string | null;
  tireur: string | null;
  nb_journaliers_conditionnement: number | null;
  qt_fabriquer: number | null;
  cadence: number | null;
  poids_reel: number | null;
  dechet_sleeve: number | null;
  dechet_capsule: number | null;
  dechet_pompe: number | null;
  dechet_flacon: number | null;
  dechet_pot: number | null;
  dechet_etiquette: number | null;
  dechet_etui: number | null;
  arret_depot: number | null;
  arret_consommable_non_livre: number | null;
  arret_manque_conditionnement: number | null;
  arret_manque_vrac: number | null;
  arret_technique: number | null;
  arret_coupure_courant: number | null;
  arret_raclage_vrac: number | null;
  arret_changement_lot: number | null;
  arret_flacons_nc: number | null;
  arret_autre: number | null;
  temps_demarage_lot: string | null;
  temps_arret_batch: string | null;
  utilisateur_conditionnement: string | null;
  date_saisie_conditionnement: string | null;
};

type SearchParams = Promise<{ code?: string; erreur?: string }>;

export default async function RapportConditionnementPage({
  params,
  searchParams,
}: {
  params: Promise<{ ligneId: string }>;
  searchParams: SearchParams;
}) {
  noStore();
  const { ligneId } = await params;
  const ligneIdNumber = Number(ligneId);
  const { code: codeParam, erreur } = await searchParams;
  // Code du lot precis pour cette saisie (ex: "AA4141V" parmi les 3 codes
  // d'une ligne decoupee en plusieurs lots) - vide seulement pour un lien
  // genere avant l'ajout du suivi par code (comportement combine legacy).
  const code = (codeParam || "").trim();

  if (!ligneIdNumber) {
    notFound();
  }

  const currentStockUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentStockUser, "productionSuiviProductionConditionnement");

  const RAPPORT_FIELDS = "date_fabrication_conditionnement, date_peremption";
  const FOURNEE_FIELDS =
    "chef_zone, chef_ligne, ravitailleur, tireur, nb_journaliers_conditionnement, qt_fabriquer, cadence, poids_reel, dechet_sleeve, dechet_capsule, dechet_pompe, dechet_flacon, dechet_pot, dechet_etiquette, dechet_etui, arret_depot, arret_consommable_non_livre, arret_manque_conditionnement, arret_manque_vrac, arret_technique, arret_coupure_courant, arret_raclage_vrac, arret_changement_lot, arret_flacons_nc, arret_autre, temps_demarage_lot, temps_arret_batch, utilisateur_conditionnement, date_saisie_conditionnement";

  const [{ data: ligneData }, { data: rapportData }, { data: fourneeData }] = await Promise.all([
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
    supabaseServer
      .from("production_carton_entries")
      .select(FOURNEE_FIELDS)
      .eq("programme_ligne_id", ligneIdNumber)
      .eq("code", code)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const ligne = ligneData as LigneInfo | null;
  const rapport = rapportData as RapportInfo | null;
  let derniereFournee = fourneeData as DerniereFourneeInfo | null;

  // Rien saisi pour ce code precis depuis l'ajout du suivi par code : si
  // cette ligne n'a jamais ete decoupee en plusieurs lots (un seul code au
  // total), l'ancienne fournee partagee (code "") reste sans ambiguite le
  // bon prefill - sinon (plusieurs codes) on laisse le formulaire vide
  // plutot que de reafficher a tort les donnees d'un AUTRE code.
  if (!derniereFournee && code) {
    const numeroLotCodes = (ligne?.numero_lot || "").split(",").map((c) => c.trim()).filter(Boolean);
    if (numeroLotCodes.length <= 1) {
      const { data: legacyFournee } = await supabaseServer
        .from("production_carton_entries")
        .select(FOURNEE_FIELDS)
        .eq("programme_ligne_id", ligneIdNumber)
        .eq("code", "")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      derniereFournee = legacyFournee as DerniereFourneeInfo | null;
    }
  }

  if (!ligne) {
    notFound();
  }

  const erreurFabricationRequise = await messageSiConditionnementInvalide(ligne.id, code);

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
                Rapport Conditionnement
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span>{formatDate(ligne.date_jour)} -</span>
                {canWrite ? (
                  <LigneZoneChaineEditor
                    ligneId={ligne.id}
                    zone={ligne.zone}
                    chaine={ligne.chaine}
                    options={ZONE_GROUPS.flat()}
                  />
                ) : (
                  <span className="font-semibold text-slate-900">
                    {ligne.zone} / {ligne.chaine}
                  </span>
                )}
                <span>
                  - {ligne.produit || "-"}
                  {code ? ` - Lot ${code}` : ligne.numero_lot ? ` - Lot ${ligne.numero_lot}` : ""}
                </span>
              </div>
              {derniereFournee?.utilisateur_conditionnement ? (
                <p className="mt-1 text-xs text-slate-500">
                  Derniere saisie par {derniereFournee.utilisateur_conditionnement}
                  {derniereFournee.date_saisie_conditionnement
                    ? ` (${formatDateTime(derniereFournee.date_saisie_conditionnement)})`
                    : ""}
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production/suivi/dashboard" label="Retour dashboard" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {erreur ? (
          <div className="rounded-[1.75rem] border border-red-200 bg-red-50 px-6 py-4 text-sm font-semibold text-red-700">
            {erreur}
          </div>
        ) : null}

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {!canWrite ? (
            <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-600">
              Lecture seule : saisie de rapport cachee pour cet utilisateur.
            </p>
          ) : erreurFabricationRequise ? (
            <p className="rounded-2xl bg-amber-50 px-4 py-4 text-sm font-medium text-amber-800">
              {erreurFabricationRequise}
            </p>
          ) : (
            <form action={saveConditionnementRapportAction} className="grid gap-6">
              <input type="hidden" name="ligne_id" value={ligne.id} />
              <input type="hidden" name="code" value={code} />

              <div>
                <h2 className="mb-3 text-lg font-bold text-slate-900">Equipe</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Nom chef de zone
                    <input
                      type="text"
                      name="chef_zone"
                      defaultValue={derniereFournee?.chef_zone || ""}
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Nom chef de ligne
                    <input
                      type="text"
                      name="chef_ligne"
                      defaultValue={derniereFournee?.chef_ligne || ""}
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Nom ravitailleur
                    <input
                      type="text"
                      name="ravitailleur"
                      defaultValue={derniereFournee?.ravitailleur || ""}
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Nom tireur
                    <input
                      type="text"
                      name="tireur"
                      defaultValue={derniereFournee?.tireur || ""}
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
                      name="nb_journaliers_conditionnement"
                      defaultValue={derniereFournee?.nb_journaliers_conditionnement ?? "0"}
                      required
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
                      defaultValue={derniereFournee?.qt_fabriquer ?? "0"}
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Cadence
                    <input
                      type="number"
                      step="0.01"
                      name="cadence"
                      defaultValue={derniereFournee?.cadence ?? "0"}
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Releve poids reel
                    <input
                      type="number"
                      step="0.01"
                      name="poids_reel"
                      defaultValue={derniereFournee?.poids_reel ?? "0"}
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Date de fabrication
                    <DateJmaFormField
                      name="date_fabrication_conditionnement"
                      defaultValue={rapport?.date_fabrication_conditionnement}
                      required
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Date de peremption
                    <DateJmaFormField
                      name="date_peremption"
                      defaultValue={rapport?.date_peremption}
                      required
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
                      defaultValue={derniereFournee?.dechet_sleeve ?? "0"}
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Capsule
                    <input
                      type="number"
                      step="0.01"
                      name="dechet_capsule"
                      defaultValue={derniereFournee?.dechet_capsule ?? "0"}
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Pompe
                    <input
                      type="number"
                      step="0.01"
                      name="dechet_pompe"
                      defaultValue={derniereFournee?.dechet_pompe ?? "0"}
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Flacon
                    <input
                      type="number"
                      step="0.01"
                      name="dechet_flacon"
                      defaultValue={derniereFournee?.dechet_flacon ?? "0"}
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Pot
                    <input
                      type="number"
                      step="0.01"
                      name="dechet_pot"
                      defaultValue={derniereFournee?.dechet_pot ?? "0"}
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Etiquette
                    <input
                      type="number"
                      step="0.01"
                      name="dechet_etiquette"
                      defaultValue={derniereFournee?.dechet_etiquette ?? "0"}
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Etui
                    <input
                      type="number"
                      step="0.01"
                      name="dechet_etui"
                      defaultValue={derniereFournee?.dechet_etui ?? "0"}
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
                        defaultValue={derniereFournee?.[cause.field] ?? "0"}
                        required
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
                      defaultValue={derniereFournee?.temps_demarage_lot || ""}
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Temps arret batch
                    <input
                      type="time"
                      name="temps_arret_batch"
                      defaultValue={derniereFournee?.temps_arret_batch || ""}
                      required
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
