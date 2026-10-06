import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { canDeletePageUser, canViewPageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { lireArticlesVrac, lireIdDepotB, lireVracEnregistres } from "./data";
import { VracEnregistres } from "./vrac-enregistres";
import { VracForm } from "./vrac-form";

type SearchParams = Promise<{ tout?: string }>;

// Vrac a recuperer : on enregistre l'article vrac + le code de son lot, il entre
// dans le Depot B et devient utilisable dans le rapport Fabrication.
export default async function VracARecupererPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();

  const params = await searchParams;
  const currentUser = await getCurrentStockUser();

  // Controle cote serveur AVANT de lire les donnees (la barriere d'acces de la
  // mise en page masque la page a l'ecran, mais ne doit pas etre la seule protection).
  if (!(await canViewPageUser(currentUser, "productionVracARecuperer"))) {
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

  const [canWrite, canDelete, depotBId] = await Promise.all([
    canWritePageUser(currentUser, "productionVracARecuperer"),
    canDeletePageUser(currentUser, "productionVracARecuperer"),
    lireIdDepotB(),
  ]);

  const [articles, enregistres] = await Promise.all([
    canWrite ? lireArticlesVrac() : Promise.resolve([]),
    lireVracEnregistres(depotBId, params.tout === "1"),
  ]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Vrac a recuperer</h1>
              <p className="mt-2 text-sm text-slate-600">
                Enregistre les articles vrac avec le code du vrac a recuperer : ils entrent dans le Depot B et peuvent
                etre utilises dans une Fabrication.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production" label="Retour production" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {!depotBId ? (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            Le Depot B n&apos;a pas ete trouve : impossible d&apos;enregistrer du vrac pour le moment.
          </p>
        ) : null}

        {canWrite && depotBId ? <VracForm articles={articles} /> : null}

        <VracEnregistres
          lignes={enregistres.lignes}
          total={enregistres.total}
          canDelete={canDelete}
          hrefTout="/production/vrac-a-recuperer?tout=1"
        />
      </div>
    </main>
  );
}
