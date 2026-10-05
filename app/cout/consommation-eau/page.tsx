import { unstable_noStore as noStore } from "next/cache";
import { canDeletePageUser, canViewPageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { moisValide } from "@/lib/cout-eau";
import {
  dateValide,
  moisDeDate,
  premierDuMois,
  totauxAvecPrix,
  totauxDuMois,
} from "@/lib/cout-eau-conso";
import {
  calculerElectriciteDuMois,
  coutDuLitre,
  coutElectriciteDuMois,
} from "@/lib/cout-eau-fabrication";
import { HistoriqueMois } from "../_components/historique-mois";
import { SelecteurMois } from "../_components/selecteur-mois";
import {
  lireEauDuMois,
  lireMoisAvecSaisies,
  lireParametresElectricite,
  lirePrixDuMois,
  lireSaisiesDuMois,
} from "./data";
import { CoutDuLitre } from "./cout-du-litre";
import { EauAutomatique } from "./eau-automatique";
import { NouvelleSaisie } from "./nouvelle-saisie";
import { SaisiesDuMois } from "./saisies-du-mois";
import { TotauxDuMois } from "./totaux-du-mois";

// ?annee=&mois= choisit le mois ; ?date=AAAA-MM-JJ choisit directement le mois
// de cette date (et la propose dans "Nouvelle saisie").
type SearchParams = Promise<{ annee?: string; mois?: string; date?: string }>;

// Hors du rendu : la regle de lint "rendu pur" refuse new Date() en direct
// dans le composant, mais cette page est de toute facon dynamique (noStore).
function aujourdhui() {
  const maintenant = new Date();
  const annee = maintenant.getFullYear();
  const mois = maintenant.getMonth() + 1;
  const jour = maintenant.getDate();
  return { annee, mois, date: `${annee}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}` };
}

function formaterDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  const jj = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${jj}-${mm}-${d.getFullYear()} ${hh}h${mi}`;
}

export default async function ConsommationEauPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();

  const params = await searchParams;
  const currentUser = await getCurrentStockUser();

  // Controle cote serveur AVANT de lire les donnees (la barriere d'acces de la
  // mise en page masque la page a l'ecran, mais ne doit pas etre la seule
  // protection).
  if (!(await canViewPageUser(currentUser, "coutEauConso"))) {
    return (
      <main className="px-6 py-10 lg:px-10">
        <section className="mx-auto max-w-3xl rounded-[2rem] border border-red-200 bg-white p-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700">Acces non autorise</p>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
            Cette page n&apos;est pas ouverte pour {currentUser ?? "ce compte"}
          </h1>
        </section>
      </main>
    );
  }

  const canEdit = await canWritePageUser(currentUser, "coutEauConso");
  const canDelete = await canDeletePageUser(currentUser, "coutEauConso");

  const aujourd = aujourdhui();
  const dateDemandee = dateValide(params.date);
  const anneeDemandee = Number(params.annee);
  const moisDemande = Number(params.mois);
  const choisi = dateDemandee
    ? moisDeDate(dateDemandee)
    : moisValide(anneeDemandee, moisDemande)
      ? { annee: anneeDemandee, mois: moisDemande }
      : { annee: aujourd.annee, mois: aujourd.mois };

  // Date proposee dans "Nouvelle saisie" : celle demandee, sinon aujourd'hui si
  // on regarde le mois en cours, sinon le 1er du mois affiche.
  const dateInitiale =
    dateDemandee ??
    (choisi.annee === aujourd.annee && choisi.mois === aujourd.mois ? aujourd.date : premierDuMois(choisi.annee, choisi.mois));

  const [eauDuMois, electricite, { saisies, erreur }, mois, prix] = await Promise.all([
    lireEauDuMois(choisi.annee, choisi.mois),
    lireParametresElectricite(choisi.annee, choisi.mois),
    lireSaisiesDuMois(choisi.annee, choisi.mois),
    lireMoisAvecSaisies(),
    lirePrixDuMois(choisi.annee, choisi.mois),
  ]);

  // Cout d'un litre d'eau = (consommables + electricite) / litres du mois
  const totaux = totauxAvecPrix(totauxDuMois(saisies), prix.lignes);
  const coutConsommables = totaux.reduce((somme, t) => somme + (t.cout ?? 0), 0);
  const consommablesSansPrix = totaux.filter((t) => t.prix === null).length;
  const parametres = electricite.parametres;
  const electriciteDuMois = eauDuMois.eau
    ? calculerElectriciteDuMois(eauDuMois.eau.litres, parametres.ligne1, parametres.ligne2)
    : null;
  const coutElectricite = electriciteDuMois
    ? coutElectriciteDuMois(electriciteDuMois, parametres.ligne1.prixKwh, parametres.ligne2.prixKwh)
    : null;
  const electriciteIncomplete =
    !electriciteDuMois ||
    !electriciteDuMois.ligne1 ||
    !electriciteDuMois.ligne2 ||
    parametres.ligne1.prixKwh === null ||
    parametres.ligne2.prixKwh === null;
  const litres = eauDuMois.eau?.litres ?? null;

  const anneeMin = Math.min(aujourd.annee - 3, ...mois.map((m) => m.annee));
  const anneeMax = Math.max(aujourd.annee + 1, ...mois.map((m) => m.annee));
  const annees = Array.from({ length: anneeMax - anneeMin + 1 }, (_, i) => anneeMax - i);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#eaf6fb_0%,#f5fbfd_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Eau - Consommation par mois
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                L&apos;eau et l&apos;electricite utilisees dans le mois viennent toutes seules des quantites du Rapport Test labo (memes chiffres).
                La consommation du traitement de l&apos;eau (filtres, produits, UV, membrane, sel) se saisit avec sa
                date, pour la Ligne 1 et la Ligne 2 ; choisis un mois ou une date pour voir ce mois. Les prix se
                saisissent dans &laquo; Prix des consommables &raquo;.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/cout/eau" label="Retour Eau" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {erreur ? (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            La consommation enregistree n&apos;a pas pu etre lue ({erreur}). Si c&apos;est la premiere utilisation,
            le script SQL de ce module doit etre execute dans Supabase.
          </p>
        ) : null}

        <SelecteurMois
          annee={choisi.annee}
          mois={choisi.mois}
          annees={annees}
          basePath="/cout/consommation-eau"
          dejaEnregistre={null}
          repris={null}
          texteRepris=""
          statut={
            saisies.length === 0
              ? "Aucune saisie datee pour ce mois."
              : `${saisies.length} saisie(s) datee(s) ce mois-ci.`
          }
        />

        <CoutDuLitre
          annee={choisi.annee}
          mois={choisi.mois}
          litres={litres}
          coutConsommables={coutConsommables}
          consommablesSansPrix={consommablesSansPrix}
          coutElectricite={coutElectricite}
          electriciteIncomplete={electriciteIncomplete}
          coutLitre={litres === null ? null : coutDuLitre(coutConsommables, coutElectricite, litres)}
        />

        <EauAutomatique
          annee={choisi.annee}
          mois={choisi.mois}
          eau={eauDuMois.eau}
          cartons={eauDuMois.cartons}
          erreur={eauDuMois.erreur}
          parametres={electricite.parametres}
        />

        <TotauxDuMois
          annee={choisi.annee}
          mois={choisi.mois}
          totaux={totaux}
          sourcePrix={prix.source}
        />

        {canEdit ? (
          <NouvelleSaisie
            key={`${choisi.annee}-${choisi.mois}-${dateInitiale}`}
            annee={choisi.annee}
            mois={choisi.mois}
            dateInitiale={dateInitiale}
            basePath="/cout/consommation-eau"
            lignesPrix={prix.lignes}
          />
        ) : (
          <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
            Tu peux consulter cette consommation mais pas la modifier.
          </p>
        )}

        <SaisiesDuMois
          saisies={saisies}
          annee={choisi.annee}
          mois={choisi.mois}
          canEdit={canEdit}
          canDelete={canDelete}
          basePath="/cout/consommation-eau"
          lignesPrix={prix.lignes}
        />

        <HistoriqueMois
          lignes={mois.map((m) => ({
            annee: m.annee,
            mois: m.mois,
            nombre: m.nombre,
            par: m.par,
            le: formaterDate(m.derniereSaisie),
          }))}
          choisi={choisi}
          basePath="/cout/consommation-eau"
          libelleNombre="Saisies"
          description="Les mois qui ont des consommations saisies. Clique sur un mois pour le revoir."
          libellePar="Derniere saisie par"
          libelleLe="Derniere saisie le"
        />
      </div>
    </main>
  );
}
