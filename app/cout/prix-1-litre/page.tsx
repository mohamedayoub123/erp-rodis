import { unstable_noStore as noStore } from "next/cache";
import { canViewPageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { moisValide } from "@/lib/cout-eau";
import { CoutDuLitre } from "../_components/cout-du-litre";
import { EauAutomatique } from "../_components/eau-automatique";
import { SelecteurMois } from "../_components/selecteur-mois";
import { TotauxDuMois } from "../_components/totaux-du-mois";
import { lireCoutDuLitre } from "../consommation-eau/data";

type SearchParams = Promise<{ annee?: string; mois?: string }>;

// Hors du rendu : la regle de lint "rendu pur" refuse new Date() en direct
// dans le composant, mais cette page est de toute facon dynamique (noStore).
function moisCourant() {
  const maintenant = new Date();
  return { annee: maintenant.getFullYear(), mois: maintenant.getMonth() + 1 };
}

// Eau - Prix 1 litre : on choisit le mois, la page donne le cout d'un litre d'eau =
// (consommables + electricite) / litres du mois, avec le detail du calcul.
export default async function PrixUnLitrePage({ searchParams }: { searchParams: SearchParams }) {
  noStore();

  const params = await searchParams;
  const currentUser = await getCurrentStockUser();

  // Controle cote serveur AVANT de lire les donnees (la barriere d'acces de la
  // mise en page masque la page a l'ecran, mais ne doit pas etre la seule
  // protection pour des donnees de cout).
  if (!(await canViewPageUser(currentUser, "coutEauPrixLitre"))) {
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

  const courant = moisCourant();
  const anneeDemandee = Number(params.annee);
  const moisDemande = Number(params.mois);
  const choisi = moisValide(anneeDemandee, moisDemande)
    ? { annee: anneeDemandee, mois: moisDemande }
    : courant;

  const cout = await lireCoutDuLitre(choisi.annee, choisi.mois);
  // Le pourcentage d'eau se change dans "Prix des consommables" (mois par mois)
  const peutVoirPrix = await canViewPageUser(currentUser, "coutEau");
  const lienPourcentage = peutVoirPrix ? `/cout/prix-litre-eau?annee=${choisi.annee}&mois=${choisi.mois}` : null;

  const anneeMin = Math.min(courant.annee - 3, choisi.annee);
  const anneeMax = Math.max(courant.annee + 1, choisi.annee);
  const annees = Array.from({ length: anneeMax - anneeMin + 1 }, (_, i) => anneeMax - i);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#eaf6fb_0%,#f5fbfd_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Eau - Prix 1 litre</h1>
              <p className="mt-2 text-sm text-slate-600">
                Choisis le mois : le cout d&apos;un litre d&apos;eau s&apos;affiche tout seul. Cout total des
                consommables (saisis dans &laquo; Consommation par mois &raquo;) + cout de l&apos;electricite, divise
                par les litres d&apos;eau du mois.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/cout/eau" label="Retour Eau" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {cout.erreur ? (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            Certaines donnees n&apos;ont pas pu etre lues ({cout.erreur}). Recharge la page.
          </p>
        ) : null}

        <SelecteurMois
          annee={choisi.annee}
          mois={choisi.mois}
          annees={annees}
          basePath="/cout/prix-1-litre"
          dejaEnregistre={null}
          repris={null}
          texteRepris=""
          statut="Choisis le mois et l'annee : le resultat change tout seul."
        />

        <CoutDuLitre
          annee={choisi.annee}
          mois={choisi.mois}
          litres={cout.litres}
          coutConsommables={cout.coutConsommables}
          nombreConsommables={cout.nombreConsommables}
          consommablesSansPrix={cout.consommablesSansPrix}
          coutElectricite={cout.coutElectricite}
          electriciteIncomplete={cout.electriciteIncomplete}
          coutLitre={cout.coutLitre}
          pourcentage={cout.pourcentage}
          pourcentageSource={cout.pourcentageSource}
          lienPourcentage={lienPourcentage}
        />

        <TotauxDuMois annee={choisi.annee} mois={choisi.mois} totaux={cout.totaux} sourcePrix={cout.sourcePrix} />

        <EauAutomatique
          annee={choisi.annee}
          mois={choisi.mois}
          eau={cout.eau}
          cartons={cout.cartons}
          erreur={cout.erreur}
          parametres={cout.parametres}
          pourcentageSource={cout.pourcentageSource}
        />
      </div>
    </main>
  );
}
