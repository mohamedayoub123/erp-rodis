import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { AutoRefresh } from "@/app/_components/auto-refresh";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { vracLabelFromName } from "@/lib/gamme-families";
import { matchesArticleSearch } from "@/lib/article-search";
import { deleteCodeProgressAction } from "../../suivi-production/actions";
import { markCartonTermineAction, markEmballageTermineAction, markVracTermineAction } from "../actions";
import { ProduitFilterInput } from "./produit-filter-input";
import {
  buildPdLabelByCode,
  computeProduitParCode,
  fetchAllCartonEntries,
  fetchAllEmballageEntries,
  fetchAllProgrammeLignes,
  fetchAllVracEntries,
  formatDate,
  groupCartonEntriesByLigne,
  pdLabelsForNumeroLot,
  type ProgrammeLigneRow,
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

type CodeRow = {
  ligne: ProgrammeLigneRow;
  pdLabel: string;
  code: string;
  vracPrevu: number;
  vracProduit: number;
  vracRestant: number;
  cartonPrevu: number;
  cartonProduit: number;
  cartonRestant: number;
  emballagePrevu: number;
  emballageProduit: number;
  emballageRestant: number;
};

type ArticleOption = { id: number; nom_article: string; gamme: string | null };

// Utilise pour le menu du filtre Produit (liste complete, pas les
// suggestions "deja saisies" du navigateur) et pour resoudre la gamme d'une
// ligne (via son article_id) pour le filtre Gamme.
async function fetchAllArticlesForFilters(): Promise<ArticleOption[]> {
  const rows: ArticleOption[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, nom_article, gamme")
      .order("nom_article", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as ArticleOption[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

type SearchParams = Promise<{ code?: string; produit?: string; pd?: string; gamme?: string }>;

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
  const gammeFilter = (params.gamme || "").trim();

  const [{ rows: allLignes }, pdLabelByCode, articles] = await Promise.all([
    fetchAllProgrammeLignes({ activeOnly: true, confirmedOnly: true }),
    buildPdLabelByCode(),
    fetchAllArticlesForFilters(),
  ]);

  const gammeByArticleId = new Map(articles.map((article) => [article.id, article.gamme || ""]));
  const distinctGammes = [...new Set(articles.map((article) => article.gamme).filter(Boolean))].sort(
    (a, b) => (a as string).localeCompare(b as string)
  ) as string[];
  const articleOptions = articles.map((article) => ({ id: article.id, label: article.nom_article }));

  const activeLigneIds = allLignes.map((ligne) => ligne.id);

  const [cartonEntries, vracEntries, emballageEntries] = await Promise.all([
    fetchAllCartonEntries(activeLigneIds),
    fetchAllVracEntries(activeLigneIds),
    fetchAllEmballageEntries(activeLigneIds),
  ]);

  const cartonByLigne = groupCartonEntriesByLigne(cartonEntries) as Map<
    number,
    { code: string; quantite: number }[]
  >;
  const vracByLigne = groupCartonEntriesByLigne(vracEntries) as Map<number, { code: string; quantite: number }[]>;
  const emballageByLigne = groupCartonEntriesByLigne(emballageEntries) as Map<
    number,
    { code: string; quantite: number }[]
  >;

  const hasFilters = Boolean(codeFilter || produitFilter || pdFilter || gammeFilter);

  const enrichedLignes = allLignes
    .map((ligne) => ({ ...ligne, pdLabel: pdLabelsForNumeroLot(ligne.numero_lot, pdLabelByCode) }))
    .filter((ligne) => {
      // Le filtre "Code" est applique plus loin, sur le code affiche apres
      // eclatement - pas ici sur numero_lot brut, qui peut contenir
      // plusieurs codes combines pour un meme programme. Filtrer ici ferait
      // ressortir les 3 lots des qu'un seul matche, au lieu du seul lot
      // demande.
      if (produitFilter && !matchesArticleSearch(ligne.produit, produitFilter)) return false;
      if (pdFilter && !ligne.pdLabel.toLowerCase().includes(pdFilter)) return false;
      if (gammeFilter && gammeByArticleId.get(ligne.article_id ?? -1) !== gammeFilter) return false;
      return true;
    });

  // Fabrication/Conditionnement/Emballage : une ligne decoupee en plusieurs
  // lots (numero_lot = "AA1, AA2, AA3") donne un CODE PAR LOT, chacun avec
  // son propre avancement (voir computeProduitParCode) - chaque code avance
  // INDEPENDAMMENT des 2 autres a chaque etape (bug corrige : un Save sur un
  // seul code faisait auparavant progresser/passer a l'etape suivante les 3
  // codes a la fois, puisque tout partageait le meme rapport/journal cote
  // base). Fabrication suit desormais le meme decoupage que Conditionnement/
  // Emballage - avant, elle restait au niveau de la ligne entiere.
  const codeRows: CodeRow[] = [];

  for (const ligne of enrichedLignes) {
    if (ligne.programme_termine) continue;

    const rawCodes = (ligne.numero_lot || "").split(",").map((c) => c.trim()).filter(Boolean);
    const detail = ligne.numero_lot_detail ?? [];
    const hasDetail = rawCodes.length > 1 && detail.length === rawCodes.length;
    const codes = rawCodes.length > 0 ? rawCodes : [ligne.numero_lot || "-"];

    const vracPrevuByCode = new Map<string, number>();
    const cartonPrevuByCode = new Map<string, number>();
    if (hasDetail) {
      for (const entry of detail) {
        vracPrevuByCode.set(entry.code, Number(entry.qt_vrac ?? 0));
        cartonPrevuByCode.set(entry.code, Number(entry.qt_carton ?? 0));
      }
    } else {
      for (const code of codes) {
        vracPrevuByCode.set(code, ligne.vrac_a_fabriquer ?? 0);
        cartonPrevuByCode.set(code, ligne.qt_carton ?? 0);
      }
    }

    const vracEntriesForLigne = vracByLigne.get(ligne.id) ?? [];
    const cartonEntriesForLigne = cartonByLigne.get(ligne.id) ?? [];
    const emballageEntriesForLigne = emballageByLigne.get(ligne.id) ?? [];

    const vracProduitByCode = computeProduitParCode(
      vracEntriesForLigne,
      codes,
      (code) => vracPrevuByCode.get(code) ?? 0
    );

    const cartonProduitByCode = computeProduitParCode(
      cartonEntriesForLigne,
      codes,
      (code) => cartonPrevuByCode.get(code) ?? 0
    );

    const emballageProduitByCode = computeProduitParCode(
      emballageEntriesForLigne,
      codes,
      (code) => cartonProduitByCode.get(code) ?? 0
    );

    for (const code of codes) {
      const vracPrevu = vracPrevuByCode.get(code) ?? 0;
      const vracProduit = vracProduitByCode.get(code) ?? 0;
      const cartonPrevu = cartonPrevuByCode.get(code) ?? 0;
      const cartonProduit = cartonProduitByCode.get(code) ?? 0;
      const emballagePrevu = cartonProduit;
      const emballageProduit = emballageProduitByCode.get(code) ?? 0;

      codeRows.push({
        ligne,
        pdLabel: pdLabelsForNumeroLot(code, pdLabelByCode),
        code,
        vracPrevu,
        vracProduit,
        vracRestant: vracPrevu - vracProduit,
        cartonPrevu,
        cartonProduit,
        cartonRestant: cartonPrevu - cartonProduit,
        emballagePrevu,
        emballageProduit,
        emballageRestant: emballagePrevu - emballageProduit,
      });
    }
  }

  // cartonPrevu/emballagePrevu (et vracPrevu, reparti depuis
  // numero_lot_detail) viennent d'une division qui tombe rarement sur un
  // nombre entier, alors que la quantite produite est toujours un nombre
  // entier de cartons (on ne fabrique jamais 0.08 carton) - une ligne
  // entierement realisee garde donc pour toujours un "restant" theorique
  // juste en dessous de 1 et ne disparaissait jamais du Dashboard. Moins
  // d'un carton restant = plus rien a faire concretement.
  const vracRows = codeRows
    .filter((row) => !row.ligne.vrac_termine && row.vracRestant >= 1)
    .filter((row) => !codeFilter || row.code.toLowerCase().includes(codeFilter));
  const cartonRows = codeRows
    .filter((row) => !row.ligne.carton_termine && row.cartonRestant >= 1)
    .filter((row) => !codeFilter || row.code.toLowerCase().includes(codeFilter));
  const emballageRows = codeRows
    .filter((row) => !row.ligne.emballage_termine && row.emballagePrevu > 0 && row.emballageRestant >= 1)
    .filter((row) => !codeFilter || row.code.toLowerCase().includes(codeFilter));

  const totalVracPrevu = vracRows.reduce((sum, row) => sum + row.vracPrevu, 0);
  const totalVracProduit = vracRows.reduce((sum, row) => sum + row.vracProduit, 0);
  const totalCartonPrevu = cartonRows.reduce((sum, row) => sum + row.cartonPrevu, 0);
  const totalCartonProduit = cartonRows.reduce((sum, row) => sum + row.cartonProduit, 0);
  const totalEmballagePrevu = emballageRows.reduce((sum, row) => sum + row.emballagePrevu, 0);
  const totalEmballageProduit = emballageRows.reduce((sum, row) => sum + row.emballageProduit, 0);

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
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto_auto]">
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
            <ProduitFilterInput
              name="produit"
              defaultValue={params.produit || ""}
              articles={articleOptions}
              placeholder="Produit"
            />
            <select
              name="gamme"
              defaultValue={params.gamme || ""}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            >
              <option value="">Toutes les gammes</option>
              {distinctGammes.map((gamme) => (
                <option key={gamme} value={gamme}>
                  {gamme}
                </option>
              ))}
            </select>
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
                  {vracRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-center text-sm text-slate-500">
                        {hasFilters
                          ? "Aucun resultat pour ce filtre."
                          : "Rien en cours (tout est termine ou vide)."}
                      </td>
                    </tr>
                  ) : (
                    vracRows.map((row) => (
                      <tr key={`${row.ligne.id}-${row.code}`} className="border-t border-slate-100">
                        <td className="px-4 py-3 text-slate-600">{formatDate(row.ligne.date_jour)}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {row.ligne.zone} / {row.ligne.chaine}
                        </td>
                        <td className="px-4 py-3 text-slate-900">{Math.round(row.vracPrevu)}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {vracLabelFromName(row.ligne.produit) || "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{row.code}</td>
                        <td className="px-4 py-3 text-slate-700">{row.pdLabel}</td>
                        <td className="px-4 py-3">
                          <RestantBadge restant={row.vracRestant} />
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/production/suivi-production/fabrication/${row.ligne.id}?code=${encodeURIComponent(row.code)}`}
                            className="rounded-full bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            Entrer
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <FinProgrammeButton ligneId={row.ligne.id} action={markVracTermineAction} />
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
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">Conditionnement</h2>
                <Link
                  href="/production/suivi-production/conditionnement/nouveau"
                  title="Nouvelle fiche Conditionnement (sans programme dispatche)"
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-base font-bold leading-none text-sky-700 hover:bg-sky-200"
                >
                  +
                </Link>
              </div>
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
                  {cartonRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-center text-sm text-slate-500">
                        {hasFilters
                          ? "Aucun resultat pour ce filtre."
                          : "Rien en cours (tout est termine ou vide)."}
                      </td>
                    </tr>
                  ) : (
                    cartonRows.map((row) => (
                      <tr key={`${row.ligne.id}-${row.code}`} className="border-t border-slate-100">
                        <td className="px-4 py-3 text-slate-600">{formatDate(row.ligne.date_jour)}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {row.ligne.zone} / {row.ligne.chaine}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{row.ligne.produit || "-"}</td>
                        <td className="px-4 py-3 text-slate-700">{row.code}</td>
                        <td className="px-4 py-3 text-slate-700">{row.pdLabel}</td>
                        <td className="px-4 py-3 text-slate-900">{Math.round(row.cartonPrevu)}</td>
                        <td className="px-4 py-3">
                          <RestantBadge restant={row.cartonRestant} />
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/production/suivi-production/conditionnement/${row.ligne.id}?code=${encodeURIComponent(row.code)}`}
                            className="rounded-full bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            Entrer
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <FinProgrammeButton ligneId={row.ligne.id} action={markCartonTermineAction} />
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
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">Emballage</h2>
                <Link
                  href="/production/suivi-production/emballage/nouveau"
                  title="Nouvelle fiche Emballage (sans programme dispatche)"
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-base font-bold leading-none text-sky-700 hover:bg-sky-200"
                >
                  +
                </Link>
              </div>
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
                  {emballageRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                        {hasFilters
                          ? "Aucun resultat pour ce filtre."
                          : "Rien a emballer pour le moment."}
                      </td>
                    </tr>
                  ) : (
                    emballageRows.map((row) => (
                      <tr key={`${row.ligne.id}-${row.code}`} className="border-t border-slate-100">
                        <td className="px-4 py-3 text-slate-600">{formatDate(row.ligne.date_jour)}</td>
                        <td className="px-4 py-3 text-slate-600">{row.ligne.produit || "-"}</td>
                        <td className="px-4 py-3 text-slate-700">{row.code}</td>
                        <td className="px-4 py-3">
                          <RestantBadge restant={row.emballageRestant} />
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/production/suivi-production/emballage/${row.ligne.id}?code=${encodeURIComponent(row.code)}`}
                            className="rounded-full bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            Entrer
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <FinProgrammeButton ligneId={row.ligne.id} action={markEmballageTermineAction} />
                            <form action={deleteCodeProgressAction}>
                              <input type="hidden" name="ligne_id" value={row.ligne.id} />
                              <input type="hidden" name="code" value={row.code} />
                              <DeleteIconButton
                                label={`Supprimer ${row.code} (revient au Conditionnement)`}
                              />
                            </form>
                          </div>
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
