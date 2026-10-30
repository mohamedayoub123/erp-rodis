import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { canViewPageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { formatDate } from "@/lib/format-date";
import { encodeDossierId } from "@/app/stock/matiere-premiere/commande/dossier-id";
import {
  MAX_PROFORMAS,
  calculerBesoinProformas,
  lireProformasSaisies,
  type ResultatBesoin,
} from "@/lib/besoin-conditionnement-proforma";

const CLE_PAGE = "productionBesoinConditionnement";

type SearchParams = Promise<{ proforma?: string | string[] }>;

function nombre(valeur: number, decimales = 3) {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: decimales });
}

function Carte({ titre, valeur, ton }: { titre: string; valeur: string | number; ton: "neutre" | "rouge" | "vert" | "ambre" }) {
  const couleur =
    ton === "rouge" ? "text-red-700" : ton === "vert" ? "text-emerald-700" : ton === "ambre" ? "text-amber-700" : "text-slate-950";
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{titre}</p>
      <p className={`mt-2 text-3xl font-bold ${couleur}`}>{valeur}</p>
    </div>
  );
}

function Resultat({ resultat }: { resultat: ResultatBesoin }) {
  const { proformas, articles, besoins, arrivagesIndisponibles } = resultat;
  const trouvees = proformas.filter((proforma) => proforma.commandes.length > 0);
  const introuvables = proformas.filter((proforma) => proforma.commandes.length === 0);
  const sansRecette = articles.filter((article) => article.statutRecette === "sans_recette");
  const lotInconnu = articles.filter((article) => article.statutRecette === "lot_inconnu");
  const enManque = besoins.filter((besoin) => besoin.manque > 0);
  // en manque ET rien (ou pas assez) en commande / import pour le couvrir
  const nonCouverts = besoins.filter((besoin) => besoin.resteACouvrir > 0);
  const manquesCouverts = enManque.length - nonCouverts.length;

  const toutEstLa = trouvees.length > 0 && sansRecette.length === 0 && lotInconnu.length === 0 && enManque.length === 0;
  // ambre : tout est couvert, mais une partie du manque n'arrive que par une commande / un import en cours
  const seulementArrivages =
    trouvees.length > 0 && sansRecette.length === 0 && lotInconnu.length === 0 && nonCouverts.length === 0 && manquesCouverts > 0;
  const phrasesVerdict = [
    sansRecette.length > 0 ? `${sansRecette.length} article(s) sans recette de conditionnement` : null,
    lotInconnu.length > 0 ? `${lotInconnu.length} recette(s) sans nombre de cartons du lot` : null,
    nonCouverts.length > 0
      ? `${nonCouverts.length} article(s) de conditionnement en manque sans commande ni import suffisant`
      : null,
    manquesCouverts > 0
      ? `${manquesCouverts} article(s) en manque mais couverts par une commande / un import en cours`
      : null,
  ].filter(Boolean);

  return (
    <>
      <section className="rounded-[1.75rem] border border-slate-200 bg-white px-6 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Proformas</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {proformas.map((proforma) => {
            if (proforma.commandes.length === 0) {
              return (
                <li key={proforma.saisie} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  <span className="font-semibold">{proforma.saisie}</span> - introuvable dans Commandes PF
                </li>
              );
            }
            const clients = [...new Set(proforma.commandes.map((commande) => commande.client).filter(Boolean))].join(", ");
            const statuts = [...new Set(proforma.commandes.map((commande) => commande.statut).filter(Boolean))].join(", ");
            return (
              <li key={proforma.saisie} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                <span className="font-semibold">{proforma.saisie}</span> - {clients || "client ?"}
                {statuts ? <span className="text-slate-500"> ({statuts})</span> : null}
                {proforma.commandes.length > 1 ? (
                  <span className="text-slate-500"> - {proforma.commandes.length} camions</span>
                ) : null}
              </li>
            );
          })}
        </ul>
        {introuvables.length > 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Verifie le numero tel qu&apos;il est ecrit dans{" "}
            <Link href="/commandes" className="font-semibold text-sky-700 underline">
              Commandes PF
            </Link>
            .
          </p>
        ) : null}
      </section>

      {trouvees.length > 0 ? (
        <>
          <section
            className={`rounded-[1.75rem] border px-6 py-5 text-[16px] font-semibold ${
              toutEstLa
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : seulementArrivages
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-red-200 bg-red-50 text-red-900"
            }`}
          >
            {toutEstLa
              ? "Tout est la : tous les articles commandes ont une recette de conditionnement et tous les articles de conditionnement sont en stock."
              : phrasesVerdict.join(" - ")}
          </section>

          {arrivagesIndisponibles ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              Commandes et imports non lus : le stock est compare au besoin sans tenir compte de ce qui est deja en route.
              Recharge la page pour reessayer.
            </p>
          ) : null}

          <section className="grid gap-4 md:grid-cols-5">
            <Carte titre="Articles commandes" valeur={articles.length} ton="neutre" />
            <Carte titre="Sans recette" valeur={sansRecette.length} ton={sansRecette.length > 0 ? "rouge" : "vert"} />
            <Carte titre="Articles de conditionnement" valeur={besoins.length} ton="neutre" />
            <Carte titre="En manque" valeur={enManque.length} ton={enManque.length > 0 ? "rouge" : "vert"} />
            <Carte
              titre="Non couverts"
              valeur={nonCouverts.length}
              ton={nonCouverts.length > 0 ? "rouge" : enManque.length > 0 ? "ambre" : "vert"}
            />
          </section>

          {sansRecette.length > 0 ? (
            <section className="rounded-[1.75rem] border border-red-200 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
              <h2 className="text-lg font-bold text-red-800">Articles sans recette de conditionnement</h2>
              <p className="mt-1 text-sm text-slate-600">
                Ces articles sont commandes mais n&apos;ont aucun article de conditionnement dans leur{" "}
                <Link href="/production/recette-conditionnement" className="font-semibold text-sky-700 underline">
                  Recette Conditionnement
                </Link>
                . Leur besoin n&apos;est pas compte ci-dessous.
              </p>
              <ul className="mt-3 divide-y divide-slate-100">
                {sansRecette.map((article) => (
                  <li key={article.articleId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <Link
                      href={`/production/recette-conditionnement/${article.articleId}`}
                      className="font-semibold text-red-700 underline"
                    >
                      {article.nom}
                    </Link>
                    <span className="text-slate-500">
                      {nombre(article.aProduire)} carton(s) a produire - proforma{" "}
                      {article.parProforma.map((p) => p.proforma).join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {lotInconnu.length > 0 ? (
            <section className="rounded-[1.75rem] border border-amber-200 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
              <h2 className="text-lg font-bold text-amber-800">Recettes sans &quot;Nombre de cartons du lot&quot;</h2>
              <p className="mt-1 text-sm text-slate-600">
                La recette existe mais on ne sait pas pour combien de cartons elle est calculee : remplis ce nombre dans la
                recette pour que le besoin soit compte.
              </p>
              <ul className="mt-3 divide-y divide-slate-100">
                {lotInconnu.map((article) => (
                  <li key={article.articleId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <Link
                      href={`/production/recette-conditionnement/${article.articleId}`}
                      className="font-semibold text-amber-700 underline"
                    >
                      {article.nom}
                    </Link>
                    <span className="text-slate-500">{nombre(article.aProduire)} carton(s) a produire</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">Articles de conditionnement necessaires</h2>
              <p className="mt-1 text-sm text-slate-600">
                Besoin = cartons a produire x quantite de la recette / nombre de cartons du lot de la recette. Cartons a
                produire = cartons commandes moins ce qui est deja en stock PF : comme le RESTE du Tableau de commande, le
                stock est partage entre toutes les commandes (la plus ancienne d&apos;abord), pas retire en entier de ces
                proformas. Dans chaque couleur, les articles de conditionnement cosmetique sont avant les plastiques. Stock
                = stock du Depot E seulement (le seul utilisable pour conditionner : le stock des autres depots, Depot B,
                Depot F..., ne compte pas). Commande (BC) = ce qu&apos;il reste a recevoir sur les bons de commande en cours ;
                Import = ce qui est en route et pas encore receptionne. Le reste a recevoir d&apos;un BC deduit deja ce qui
                est importe : commande et import ne se comptent jamais deux fois.
              </p>
            </div>
            {besoins.length === 0 ? (
              <p className="px-6 py-5 text-sm text-slate-500">Aucun article de conditionnement a calculer.</p>
            ) : (
              <div className="max-h-[70vh] overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Article de conditionnement</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Unite</th>
                      <th className="px-4 py-3 text-right font-semibold">Besoin</th>
                      <th className="px-4 py-3 text-right font-semibold">Stock</th>
                      <th className="px-4 py-3 text-right font-semibold">Manque</th>
                      <th className="px-4 py-3 font-semibold">Commande (BC) en cours</th>
                      <th className="px-4 py-3 font-semibold">Import en cours</th>
                      <th className="px-4 py-3 text-right font-semibold">Reste a couvrir</th>
                      <th className="px-4 py-3 font-semibold">Utilise par</th>
                    </tr>
                  </thead>
                  <tbody>
                    {besoins.map((besoin) => (
                      <tr
                        key={besoin.articleMpId}
                        className={`border-t border-slate-100 align-top ${
                          besoin.resteACouvrir > 0 ? "bg-red-50" : besoin.manque > 0 ? "bg-amber-50" : ""
                        }`}
                      >
                        <td className="px-4 py-3 font-medium text-slate-900">{besoin.nom}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-500">
                          {besoin.type === "cosmetique" ? "Cosmetique" : besoin.type === "plastique" ? "Plastique" : "Autre"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{besoin.unite || "-"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{nombre(besoin.besoin)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{nombre(besoin.stock)}</td>
                        <td
                          className={`px-4 py-3 text-right font-semibold tabular-nums ${
                            besoin.manque > 0 ? "text-red-700" : "text-emerald-700"
                          }`}
                        >
                          {besoin.manque > 0 ? nombre(besoin.manque) : "OK"}
                        </td>
                        <td className="px-4 py-3">
                          {besoin.commandes.length === 0 ? (
                            <span className="text-slate-300">-</span>
                          ) : (
                            <>
                              <p className="font-semibold tabular-nums text-slate-900">{nombre(besoin.commandeTotal)}</p>
                              <ul className="mt-1 space-y-0.5 text-xs">
                                {besoin.commandes.map((commande) => (
                                  <li key={commande.code} className="text-slate-600">
                                    <Link
                                      href={`/stock/matiere-premiere/bc/${commande.code}`}
                                      className="font-semibold text-sky-700 underline"
                                    >
                                      {commande.code}
                                    </Link>{" "}
                                    - {nombre(commande.quantite)}
                                    {commande.dateCommande ? ` - commande du ${formatDate(commande.dateCommande)}` : " - date de commande non renseignee"}
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {besoin.imports.length === 0 ? (
                            <span className="text-slate-300">-</span>
                          ) : (
                            <>
                              <p className="font-semibold tabular-nums text-slate-900">{nombre(besoin.importTotal)}</p>
                              <ul className="mt-1 space-y-0.5 text-xs">
                                {besoin.imports.map((transit) => (
                                  <li
                                    key={`${transit.nDoss4d ?? ""}|${transit.nDossErp ?? ""}`}
                                    className="text-slate-600"
                                  >
                                    <Link
                                      href={`/stock/matiere-premiere/commande/${encodeDossierId(transit.nDoss4d, transit.nDossErp)}`}
                                      className="font-semibold text-sky-700 underline"
                                    >
                                      {transit.nDoss4d || transit.nDossErp || "Sans dossier"}
                                    </Link>{" "}
                                    - {nombre(transit.quantite)}
                                    {transit.statutDossier ? ` - ${transit.statutDossier}` : ""}
                                    {transit.dateImport ? ` - import du ${formatDate(transit.dateImport)}` : ""}
                                    {transit.datePrevueReception
                                      ? ` - reception prevue le ${formatDate(transit.datePrevueReception)}`
                                      : " - date de reception prevue non renseignee"}
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-semibold tabular-nums ${
                            besoin.resteACouvrir > 0 ? "text-red-700" : besoin.manque > 0 ? "text-amber-700" : "text-emerald-700"
                          }`}
                        >
                          {besoin.resteACouvrir > 0 ? nombre(besoin.resteACouvrir) : besoin.manque > 0 ? "Couvert" : "OK"}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {besoin.utilisePar.slice(0, 3).join(", ")}
                          {besoin.utilisePar.length > 3 ? ` + ${besoin.utilisePar.length - 3} autre(s)` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">Articles commandes</h2>
            </div>
            <div className="max-h-[70vh] overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Article</th>
                    <th className="px-4 py-3 text-right font-semibold">Cartons commandes</th>
                    <th className="px-4 py-3 text-right font-semibold">Stock PF</th>
                    <th className="px-4 py-3 text-right font-semibold">Deja couvert par le stock</th>
                    <th className="px-4 py-3 text-right font-semibold">A produire</th>
                    <th className="px-4 py-3 font-semibold">Proforma</th>
                    <th className="px-4 py-3 font-semibold">Recette conditionnement</th>
                    <th className="px-4 py-3 text-right font-semibold">Vrac pour les cartons a produire (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {articles.map((article) => (
                    <tr key={article.articleId} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">{article.nom}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{nombre(article.cartons)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{nombre(article.stockPf)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{nombre(article.couvertParStock)}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                        {nombre(article.aProduire)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {article.parProforma.map((p) => p.proforma).join(", ")}
                      </td>
                      <td className="px-4 py-3">
                        {article.statutRecette === "couvert_stock" ? (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                            Tout est en stock
                          </span>
                        ) : article.statutRecette === "ok" ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                            {article.nbLignesRecette} article(s) de conditionnement
                          </span>
                        ) : article.statutRecette === "lot_inconnu" ? (
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                            Nombre de cartons du lot manquant
                          </span>
                        ) : (
                          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                            Pas de recette
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                        {article.vracKg !== null ? nombre(article.vracKg, 1) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}

export default async function BesoinConditionnementPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const utilisateur = await getCurrentStockUser();
  if (!(await canViewPageUser(utilisateur, CLE_PAGE))) {
    redirect("/production");
  }

  const params = await searchParams;
  const brut = Array.isArray(params.proforma) ? params.proforma.join(",") : String(params.proforma ?? "");
  const saisies = lireProformasSaisies(brut);

  let resultat: ResultatBesoin | null = null;
  let erreur: string | null = null;
  if (saisies.length > 0) {
    try {
      resultat = await calculerBesoinProformas(saisies);
    } catch (e) {
      erreur = e instanceof Error ? e.message : "Erreur pendant le calcul.";
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Production</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Besoin Conditionnement par proforma</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Tape un ou plusieurs numeros de proforma (ceux de Commandes PF). Le module calcule, avec la Recette
                Conditionnement de chaque article commande, les articles de conditionnement necessaires, les compare au stock
                et signale les articles qui n&apos;ont pas de recette.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <BackButton href="/production" label="Retour production" />
              <RefreshButton />
            </div>
          </div>

          <form className="mt-5 flex flex-wrap items-end gap-3">
            <label className="grid min-w-[18rem] flex-1 gap-1 text-xs font-semibold text-slate-500">
              Numeros de proforma (separes par une virgule ou un espace, {MAX_PROFORMAS} maximum)
              <input
                type="text"
                name="proforma"
                defaultValue={saisies.join(", ")}
                placeholder="Ex : 3685, 3928, 3981"
                autoComplete="off"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-[16px] font-normal text-slate-900 outline-none"
              />
            </label>
            <SubmitButton
              pendingLabel="Calcul..."
              className="rounded-full bg-sky-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-600"
            >
              Calculer
            </SubmitButton>
          </form>
        </section>

        {erreur ? (
          <section className="rounded-[1.75rem] border border-red-200 bg-red-50 px-6 py-4 text-sm font-medium text-red-800">
            {erreur}
          </section>
        ) : null}

        {resultat ? <Resultat resultat={resultat} /> : null}
      </div>
    </main>
  );
}
