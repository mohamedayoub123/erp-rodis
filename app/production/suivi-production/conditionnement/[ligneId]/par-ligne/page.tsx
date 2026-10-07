import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/app/production/suivi/data";
import { saveConditionnementParLigneAction, messageSiConditionnementInvalide } from "../../../actions";
import { fetchConditionnementZoneChaineOptions } from "@/lib/machines-conditionnement";
import { fetchInfosArticleLigne, fetchModesSaisieConditionnement } from "@/lib/conditionnement-modes";
import { LigneZoneChaineEditor } from "../zone-chaine-editor";
import { ModeSaisieSwitch } from "../../mode-switch";
import { DatesFabricationPeremption } from "../../dates-fabrication-peremption";
import { ParLigneProduction } from "./par-ligne-production";
import { SubmitButton } from "@/app/_components/submit-button";
import { TimeTextInputMaintenant } from "@/app/_components/time-text-input-maintenant";

// Meme liste que l'Entree simple (conditionnement/[ligneId]/page.tsx) - dupliquee volontairement pour ne
// jamais faire deriver l'Entree simple en touchant ce fichier.
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

const DECHETS = [
  { field: "dechet_sleeve", label: "Sleeve" },
  { field: "dechet_capsule", label: "Capsule" },
  { field: "dechet_pompe", label: "Pompe" },
  { field: "dechet_flacon", label: "Flacon" },
  { field: "dechet_pot", label: "Pot" },
  { field: "dechet_etiquette", label: "Etiquette" },
  { field: "dechet_etui", label: "Etui" },
] as const;

const CHAMP =
  "rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none";

type LigneInfo = {
  id: number;
  zone: string;
  chaine: string;
  produit: string | null;
  date_jour: string;
  numero_lot: string | null;
};

// Seulement l'equipe est reprise de la derniere fournee de ce code (confort) : dechets et arrets
// repartent a 0 pour chaque nouvelle fournee, jamais re-comptes.
type EquipeInfo = {
  chef_zone: string | null;
  chef_ligne: string | null;
  ravitailleur: string | null;
  tireur: string | null;
  nb_journaliers_conditionnement: number | null;
};

type SearchParams = Promise<{ code?: string; erreur?: string }>;

function Message({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-amber-50 px-4 py-4 text-sm font-medium text-amber-800">{children}</p>;
}

export default async function ConditionnementParLignePage({
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
  const code = (codeParam || "").trim();

  if (!ligneIdNumber) {
    notFound();
  }

  const currentStockUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentStockUser, "productionSuiviProductionConditionnement");

  const [{ data: ligneData }, { data: equipeData }, zoneChaineOptions] = await Promise.all([
    supabaseServer
      .from("programme_lignes")
      .select("id, zone, chaine, produit, date_jour, numero_lot")
      .eq("id", ligneIdNumber)
      .maybeSingle(),
    supabaseServer
      .from("production_carton_entries")
      .select("chef_zone, chef_ligne, ravitailleur, tireur, nb_journaliers_conditionnement")
      .eq("programme_ligne_id", ligneIdNumber)
      .eq("code", code)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    fetchConditionnementZoneChaineOptions(),
  ]);

  const ligne = ligneData as LigneInfo | null;
  if (!ligne) {
    notFound();
  }
  const equipe = equipeData as EquipeInfo | null;

  const [erreurFabricationRequise, modesSaisie, infosArticle] = await Promise.all([
    messageSiConditionnementInvalide(ligne.id, code),
    fetchModesSaisieConditionnement(ligne.id, code, ligne.numero_lot),
    fetchInfosArticleLigne(ligne.id),
  ]);
  const { piecesParCarton } = infosArticle;
  // Chaque Enregistrer est une NOUVELLE fournee : date de fabrication = aujourd'hui (jour, mois, annee
  // remplis automatiquement, modifiables).
  const aujourdhui = new Date().toISOString().slice(0, 10);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Rapport Conditionnement - Entree par ligne
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span>{formatDate(ligne.date_jour)} -</span>
                {canWrite ? (
                  <LigneZoneChaineEditor
                    ligneId={ligne.id}
                    zone={ligne.zone}
                    chaine={ligne.chaine}
                    options={zoneChaineOptions}
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
              {canWrite ? (
                <div className="mt-3">
                  <ModeSaisieSwitch ligneId={ligne.id} code={code} actuel="par_ligne" modes={modesSaisie} />
                </div>
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
          ) : modesSaisie.colonneAbsente ? (
            <Message>
              L&apos;Entree par ligne n&apos;est pas encore activee : le fichier
              scripts/sql/add_conditionnement_par_ligne.sql doit d&apos;abord etre execute dans Supabase (SQL
              Editor).
            </Message>
          ) : modesSaisie.simple ? (
            <Message>
              Ce code est deja saisi en Entree simple - l&apos;Entree par ligne n&apos;est plus possible pour ce
              code. Utilise &laquo; Entree simple &raquo; pour ajouter une fournee.
            </Message>
          ) : erreurFabricationRequise ? (
            <Message>{erreurFabricationRequise}</Message>
          ) : !piecesParCarton ? (
            <Message>
              Le nombre de pieces par carton de cet article est inconnu (fiche Article Produit Fini) : les cartons ne
              peuvent pas etre calcules. Renseigne-le d&apos;abord.
            </Message>
          ) : (
            <form action={saveConditionnementParLigneAction} className="grid gap-6">
              <input type="hidden" name="ligne_id" value={ligne.id} />
              <input type="hidden" name="code" value={code} />

              <div>
                <h2 className="mb-3 text-lg font-bold text-slate-900">Equipe</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Nom chef de zone
                    <input type="text" name="chef_zone" defaultValue={equipe?.chef_zone || ""} required className={CHAMP} />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Nom chef de ligne
                    <input type="text" name="chef_ligne" defaultValue={equipe?.chef_ligne || ""} required className={CHAMP} />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Nom ravitailleur
                    <input type="text" name="ravitailleur" defaultValue={equipe?.ravitailleur || ""} required className={CHAMP} />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Nom tireur
                    <input type="text" name="tireur" defaultValue={equipe?.tireur || ""} required className={CHAMP} />
                  </label>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Nb de journaliers
                    <input
                      type="number"
                      step="1"
                      min="0"
                      name="nb_journaliers_conditionnement"
                      defaultValue={equipe?.nb_journaliers_conditionnement ?? "0"}
                      required
                      className={CHAMP}
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Temps demarage lot
                    <TimeTextInputMaintenant name="temps_demarage_lot" required className={CHAMP} />
                  </label>
                  <DatesFabricationPeremption
                    defaultFabrication={aujourdhui}
                    dureeAns={infosArticle.dureeConservationAns}
                  />
                </div>
              </div>

              <div>
                <h2 className="mb-1 text-lg font-bold text-slate-900">Production</h2>
                <p className="mb-4 text-xs text-slate-500">
                  Ce qui est saisi ici est retire de ce qu&apos;il reste a faire (visible dans le Dashboard).
                  Chaque Enregistrer ajoute une nouvelle fournee.
                </p>
                <ParLigneProduction
                  piecesParCarton={piecesParCarton}
                  apresCasiers={
                    <div className="grid gap-4 md:grid-cols-3">
                      <label className="grid gap-1 text-xs font-semibold text-slate-500">
                        Temps arret batch
                        <TimeTextInputMaintenant name="temps_arret_batch" required className={CHAMP} />
                      </label>
                    </div>
                  }
                />
              </div>

              <div>
                <h2 className="mb-3 text-lg font-bold text-slate-900">Dechets</h2>
                <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                  {DECHETS.map((dechet) => (
                    <label key={dechet.field} className="grid gap-1 text-xs font-semibold text-slate-500">
                      {dechet.label}
                      <input type="number" step="0.01" name={dechet.field} defaultValue="0" required className={CHAMP} />
                    </label>
                  ))}
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
                      <input type="number" step="1" min="0" name={cause.field} defaultValue="0" required className={CHAMP} />
                    </label>
                  ))}
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
