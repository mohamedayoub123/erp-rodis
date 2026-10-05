import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canViewPageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { libelleMois, moisValide, nombreDePrix, normaliserConfig } from "@/lib/cout-eau";
import { CoutEauForm } from "./cout-eau-form";
import { HistoriqueMois } from "../_components/historique-mois";

type MoisEnregistre = {
  annee: number;
  mois: number;
  donnees: unknown;
  updated_by: string | null;
  updated_at: string | null;
};

type SearchParams = Promise<{ annee?: string; mois?: string }>;

// Hors du rendu : la regle de lint "rendu pur" refuse new Date() en direct
// dans le composant, mais cette page est de toute facon dynamique (noStore).
function moisCourant() {
  const maintenant = new Date();
  return { annee: maintenant.getFullYear(), mois: maintenant.getMonth() + 1 };
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

export default async function PrixLitreEauPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();

  const params = await searchParams;
  const currentUser = await getCurrentStockUser();

  // Controle cote serveur AVANT de lire les prix : la barriere d'acces de la mise
  // en page masque la page a l'ecran, mais ne doit pas etre la seule protection
  // pour des donnees de cout.
  if (!(await canViewPageUser(currentUser, "coutEau"))) {
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

  const canEdit = await canWritePageUser(currentUser, "coutEau");
  const canDelete = await canDeletePageUser(currentUser, "coutEau");

  const courant = moisCourant();
  const anneeDemandee = Number(params.annee);
  const moisDemande = Number(params.mois);
  const choisi = moisValide(anneeDemandee, moisDemande)
    ? { annee: anneeDemandee, mois: moisDemande }
    : courant;

  const { data, error } = await supabaseServer
    .from("cout_eau_mois")
    .select("annee, mois, donnees, updated_by, updated_at")
    .order("annee", { ascending: false })
    .order("mois", { ascending: false });

  const mois = (data ?? []) as MoisEnregistre[];
  const dejaEnregistre = mois.find((m) => m.annee === choisi.annee && m.mois === choisi.mois) ?? null;

  // Un mois pas encore enregistre repart des prix du mois enregistre le plus
  // recent AVANT lui (les prix changent rarement) - clairement signale sur la
  // page, et rien n'est enregistre tant qu'on ne clique pas sur Enregistrer.
  const repris = dejaEnregistre
    ? null
    : (mois.find((m) => m.annee * 12 + m.mois < choisi.annee * 12 + choisi.mois) ?? null);

  const config = normaliserConfig((dejaEnregistre ?? repris)?.donnees);

  const anneeMin = Math.min(courant.annee - 3, ...mois.map((m) => m.annee));
  const anneeMax = Math.max(courant.annee + 1, ...mois.map((m) => m.annee));
  const annees = Array.from({ length: anneeMax - anneeMin + 1 }, (_, i) => anneeMax - i);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#eaf6fb_0%,#f5fbfd_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Eau - Prix des consommables</h1>
              <p className="mt-2 text-sm text-slate-600">
                Prix des consommables du traitement de l&apos;eau (filtres, produits, UV, membrane, sel, electricite),
                enregistres mois par mois. La consommation se saisit dans &laquo; Consommation par mois &raquo; ; le
                calcul du prix du litre viendra ensuite.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/cout/eau" label="Retour Eau" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {error ? (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            Les prix enregistres n&apos;ont pas pu etre lus ({error.message}). Si c&apos;est la premiere
            utilisation, le script SQL de ce module doit etre execute dans Supabase.
          </p>
        ) : null}

        <CoutEauForm
          key={`${choisi.annee}-${choisi.mois}-${dejaEnregistre?.updated_at ?? "nouveau"}`}
          initial={config}
          annee={choisi.annee}
          mois={choisi.mois}
          annees={annees}
          canEdit={canEdit}
          canDelete={canDelete}
          dejaEnregistre={
            dejaEnregistre ? { par: dejaEnregistre.updated_by, le: formaterDate(dejaEnregistre.updated_at) } : null
          }
          repris={repris ? libelleMois(repris.annee, repris.mois) : null}
        />

        <HistoriqueMois
          lignes={mois.map((m) => ({
            annee: m.annee,
            mois: m.mois,
            nombre: nombreDePrix(normaliserConfig(m.donnees)),
            par: m.updated_by,
            le: formaterDate(m.updated_at),
          }))}
          choisi={choisi}
          basePath="/cout/prix-litre-eau"
          libelleNombre="Prix saisis"
        />
      </div>
    </main>
  );
}
