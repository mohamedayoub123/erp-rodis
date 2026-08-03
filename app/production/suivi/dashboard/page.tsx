import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { AutoRefresh } from "@/app/_components/auto-refresh";
import { vracLabelFromName } from "@/lib/gamme-families";
import { markCartonTermineAction, markEmballageTermineAction, markVracTermineAction } from "../actions";
import {
  buildPdLabelByCode,
  fetchAllCartonEntries,
  fetchAllEmballageEntries,
  fetchAllProgrammeLignes,
  fetchAllVracEntries,
  formatDate,
  groupCartonEntriesByLigne,
  pdLabelsForNumeroLot,
} from "../data";

function RestantBadge({ restant }: { restant: number }) {
  if (restant > 0) {
    return (
      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
        Reste {Math.round(restant)}
      </span>
    );
  }
  if (restant < 0) {
    return (
      <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
        Depasse de {Math.round(-restant)}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
      Complet
    </span>
  );
}

function FinProgrammeButton({
  ligneId,
  action,
}: {
  ligneId: number;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="ligne_id" value={ligneId} />
      <button
        type="submit"
        className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        Fin programme
      </button>
    </form>
  );
}

type SearchParams = Promise<{ code?: string; produit?: string; pd?: string }>;

export default async function PlanningDashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const params = await searchParams;
  const codeFilter = (params.code || "").trim().toLowerCase();
  const produitFilter = (params.produit || "").trim().toLowerCase();
  const pdFilter = (params.pd || "").trim().toLowerCase();

  const [{ rows: allLignes }, pdLabelByCode] = await Promise.all([
    fetchAllProgrammeLignes({ activeOnly: true }),
    buildPdLabelByCode(),
  ]);

  const activeLigneIds = allLignes.map((ligne) => ligne.id);

  const [cartonEntries, vracEntries, emballageEntries] = await Promise.all([
    fetchAllCartonEntries(activeLigneIds),
    fetchAllVracEntries(activeLigneIds),
    fetchAllEmballageEntries(activeLigneIds),
  ]);

  const cartonByLigne = groupCartonEntriesByLigne(cartonEntries);
  const vracByLigne = groupCartonEntriesByLigne(vracEntries);
  const emballageByLigne = groupCartonEntriesByLigne(emballageEntries);

  const hasFilters = Boolean(codeFilter || produitFilter || pdFilter);

  // Chaque ligne porte son PD, son reste vrac/carton/emballage - calcules
  // une seule fois ici, puis chaque tableau filtre independamment. Le
  // "prevu" de l'emballage n'est pas fixe au depart : c'est ce qui a deja
  // ete conditionne (cartonProduit) qui alimente l'emballage au fur et a
  // mesure.
  const enrichedLignes = allLignes
    .map((ligne) => {
      const pdLabel = pdLabelsForNumeroLot(ligne.numero_lot, pdLabelByCode);
      const vracProduit = (vracByLigne.get(ligne.id) ?? []).reduce(
        (sum, entry) => sum + Number(entry.quantite),
        0
      );
      const cartonProduit = (cartonByLigne.get(ligne.id) ?? []).reduce(
        (sum, entry) => sum + Number(entry.quantite),
        0
      );
      const emballageProduit = (emballageByLigne.get(ligne.id) ?? []).reduce(
        (sum, entry) => sum + Number(entry.quantite),
        0
      );
      const vracPrevu = ligne.vrac_a_fabriquer ?? 0;
      const cartonPrevu = ligne.qt_carton ?? 0;
      const emballagePrevu = cartonProduit;

      return {
        ...ligne,
        pdLabel,
        vracProduit,
        cartonProduit,
        emballageProduit,
        vracPrevu,
        cartonPrevu,
        emballagePrevu,
        vracRestant: vracPrevu - vracProduit,
        cartonRestant: cartonPrevu - cartonProduit,
        emballageRestant: emballagePrevu - emballageProduit,
      };
    })
    .filter((ligne) => {
      if (codeFilter && !(ligne.numero_lot || "").toLowerCase().includes(codeFilter)) return false;
      if (produitFilter && !(ligne.produit || "").toLowerCase().includes(produitFilter)) return false;
      if (pdFilter && !ligne.pdLabel.toLowerCase().includes(pdFilter)) return false;
      return true;
    });

  // Une ligne terminee (manuellement, par colonne, ou par reste <= 0) sort
  // du tableau correspondant - "Fin programme" est independant par colonne
  // (vrac_termine/carton_termine/emballage_termine), fermer une colonne ne
  // touche pas les autres. programme_termine reste un interrupteur general
  // (utilise ailleurs, ex: suppression d'un groupe PD) qui ferme les 3 a la
  // fois. L'emballage n'apparait que s'il y a deja quelque chose de
  // conditionne a emballer.
  const vracLignes = enrichedLignes.filter(
    (ligne) => !ligne.programme_termine && !ligne.vrac_termine && ligne.vracRestant > 0
  );
  const cartonLignes = enrichedLignes.filter(
    (ligne) => !ligne.programme_termine && !ligne.carton_termine && ligne.cartonRestant > 0
  );
  const emballageLignes = enrichedLignes.filter(
    (ligne) =>
      !ligne.programme_termine &&
      !ligne.emballage_termine &&
      ligne.emballagePrevu > 0 &&
      ligne.emballageRestant > 0
  );

  const totalVracPrevu = vracLignes.reduce((sum, ligne) => sum + ligne.vracPrevu, 0);
  const totalVracProduit = vracLignes.reduce((sum, ligne) => sum + ligne.vracProduit, 0);
  const totalCartonPrevu = cartonLignes.reduce((sum, ligne) => sum + ligne.cartonPrevu, 0);
  const totalCartonProduit = cartonLignes.reduce((sum, ligne) => sum + ligne.cartonProduit, 0);
  const totalEmballagePrevu = emballageLignes.reduce((sum, ligne) => sum + ligne.emballagePrevu, 0);
  const totalEmballageProduit = emballageLignes.reduce((sum, ligne) => sum + ligne.emballageProduit, 0);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <AutoRefresh />
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Dashboard Production
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Fabrication, Conditionnement et Emballage, chacun dans sa colonne.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production/suivi" label="Retour planning production" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
            <input
              type="text"
              name="pd"
              defaultValue={params.pd || ""}
              placeholder="N programme (PD1, PD2...)"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <input
              type="text"
              name="code"
              defaultValue={params.code || ""}
              placeholder="Code"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <input
              type="text"
              name="produit"
              defaultValue={params.produit || ""}
              placeholder="Produit"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <button
              type="submit"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            >
              Filtrer
            </button>
            {hasFilters ? (
              <Link
                href="/production/suivi/dashboard"
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Effacer
              </Link>
            ) : null}
          </form>
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <div className="rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">Fabrication</h2>
              <p className="text-xs text-slate-500">
                {Math.round(totalVracProduit)} / {Math.round(totalVracPrevu)} produit
              </p>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Chaine</th>
                    <th className="px-4 py-3 font-semibold">Vrac prevu</th>
                    <th className="px-4 py-3 font-semibold">Produit</th>
                    <th className="px-4 py-3 font-semibold">N Lot</th>
                    <th className="px-4 py-3 font-semibold">PD</th>
                    <th className="px-4 py-3 font-semibold">Restant</th>
                    <th className="px-4 py-3 font-semibold">Rapport</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {vracLignes.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-center text-sm text-slate-500">
                        {hasFilters
                          ? "Aucun resultat pour ce filtre."
                          : "Rien en cours (tout est termine ou vide)."}
                      </td>
                    </tr>
                  ) : (
                    vracLignes.map((ligne) => (
                      <tr key={ligne.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 text-slate-600">{formatDate(ligne.date_jour)}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {ligne.zone} / {ligne.chaine}
                        </td>
                        <td className="px-4 py-3 text-slate-900">{Math.round(ligne.vracPrevu)}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {vracLabelFromName(ligne.produit) || "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{ligne.numero_lot || "-"}</td>
                        <td className="px-4 py-3 text-slate-700">{ligne.pdLabel}</td>
                        <td className="px-4 py-3">
                          <RestantBadge restant={ligne.vracRestant} />
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/production/suivi-production/fabrication/${ligne.id}`}
                            className="rounded-full bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            Ouvrir
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <FinProgrammeButton ligneId={ligne.id} action={markVracTermineAction} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">Conditionnement</h2>
              <p className="text-xs text-slate-500">
                {Math.round(totalCartonProduit)} / {Math.round(totalCartonPrevu)} produit
              </p>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Chaine</th>
                    <th className="px-4 py-3 font-semibold">Produit</th>
                    <th className="px-4 py-3 font-semibold">N Lot</th>
                    <th className="px-4 py-3 font-semibold">PD</th>
                    <th className="px-4 py-3 font-semibold">Carton prevu</th>
                    <th className="px-4 py-3 font-semibold">Restant</th>
                    <th className="px-4 py-3 font-semibold">Rapport</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cartonLignes.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-center text-sm text-slate-500">
                        {hasFilters
                          ? "Aucun resultat pour ce filtre."
                          : "Rien en cours (tout est termine ou vide)."}
                      </td>
                    </tr>
                  ) : (
                    cartonLignes.map((ligne) => (
                      <tr key={ligne.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 text-slate-600">{formatDate(ligne.date_jour)}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {ligne.zone} / {ligne.chaine}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{ligne.produit || "-"}</td>
                        <td className="px-4 py-3 text-slate-700">{ligne.numero_lot || "-"}</td>
                        <td className="px-4 py-3 text-slate-700">{ligne.pdLabel}</td>
                        <td className="px-4 py-3 text-slate-900">{Math.round(ligne.cartonPrevu)}</td>
                        <td className="px-4 py-3">
                          <RestantBadge restant={ligne.cartonRestant} />
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/production/suivi-production/conditionnement/${ligne.id}`}
                            className="rounded-full bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            Ouvrir
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <FinProgrammeButton ligneId={ligne.id} action={markCartonTermineAction} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">Emballage</h2>
              <p className="text-xs text-slate-500">
                {Math.round(totalEmballageProduit)} / {Math.round(totalEmballagePrevu)} produit
              </p>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Produit</th>
                    <th className="px-4 py-3 font-semibold">Code</th>
                    <th className="px-4 py-3 font-semibold">Qt</th>
                    <th className="px-4 py-3 font-semibold">Rapport</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {emballageLignes.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                        Rien a emballer pour le moment.
                      </td>
                    </tr>
                  ) : (
                    emballageLignes.map((ligne) => (
                      <tr key={ligne.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 text-slate-600">{formatDate(ligne.date_jour)}</td>
                        <td className="px-4 py-3 text-slate-600">{ligne.produit || "-"}</td>
                        <td className="px-4 py-3 text-slate-700">{ligne.numero_lot || "-"}</td>
                        <td className="px-4 py-3">
                          <RestantBadge restant={ligne.emballageRestant} />
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/production/suivi-production/emballage/${ligne.id}`}
                            className="rounded-full bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            Ouvrir
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <FinProgrammeButton ligneId={ligne.id} action={markEmballageTermineAction} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
