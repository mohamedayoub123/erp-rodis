import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { canViewPageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { CellulesArrivagesMp } from "@/app/_components/besoin-arrivages-cellules";
import { MAX_PROFORMAS, lireProformasSaisies } from "@/lib/besoin-conditionnement-proforma";
import { calculerBesoinFabrication, type ResultatBesoinFabrication } from "@/lib/besoin-fabrication-proforma";

const CLE_PAGE = "productionBesoinFabrication";

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

function Resultat({ resultat }: { resultat: ResultatBesoinFabrication }) {
  const { proformas, vracs, sansVrac, besoins, arrivagesIndisponibles, nbArticlesAProduire } = resultat;
  const trouvees = proformas.filter((proforma) => proforma.commandes.length > 0);
  const introuvables = proformas.filter((proforma) => proforma.commandes.length === 0);
  const sansRecette = vracs.filter((vrac) => vrac.statutRecette === "sans_recette");
  const lotInconnu = vracs.filter((vrac) => vrac.statutRecette === "lot_inconnu");
  const enManque = besoins.filter((besoin) => besoin.manque > 0);
  // en manque ET rien (ou pas assez) en commande / import pour le couvrir
  const nonCouverts = besoins.filter((besoin) => besoin.resteACouvrir > 0);
  const manquesCouverts = enManque.length - nonCouverts.length;
  const totalKg = vracs.reduce((somme, vrac) => somme + vrac.kg, 0);

  const rienAFabriquer = trouvees.length > 0 && nbArticlesAProduire === 0;
  const problemes = sansVrac.length + sansRecette.length + lotInconnu.length;
  const toutEstLa = trouvees.length > 0 && !rienAFabriquer && problemes === 0 && enManque.length === 0;
  // ambre : tout est couvert, mais une partie du manque n'arrive que par une commande / un import en cours
  const seulementArrivages = trouvees.length > 0 && problemes === 0 && nonCouverts.length === 0 && manquesCouverts > 0;
  const phrasesVerdict = [
    sansVrac.length > 0 ? `${sansVrac.length} article(s) a produire sans vrac calculable` : null,
    sansRecette.length > 0 ? `${sansRecette.length} vrac sans recette de fabrication` : null,
    lotInconnu.length > 0 ? `${lotInconnu.length} recette(s) sans quantite du lot` : null,
    nonCouverts.length > 0 ? `${nonCouverts.length} matiere(s) premiere(s) en manque sans commande ni import suffisant` : null,
    manquesCouverts > 0 ? `${manquesCouverts} matiere(s) premiere(s) en manque mais couverte(s) par une commande / un import en cours` : null,
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
              rienAFabriquer || toutEstLa
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : seulementArrivages
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-red-200 bg-red-50 text-red-900"
            }`}
          >
            {rienAFabriquer
              ? "Rien a fabriquer : tous les cartons commandes sont deja couverts par le stock PF."
              : toutEstLa
                ? "Tout est la : tous les vracs ont une recette de fabrication et toutes les matieres premieres sont en stock."
                : phrasesVerdict.join(" - ")}
          </section>

          {arrivagesIndisponibles ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              Commandes et imports non lus : le stock est compare au besoin sans tenir compte de ce qui est deja en route.
              Recharge la page pour reessayer.
            </p>
          ) : null}

          <section className="grid gap-4 md:grid-cols-5">
            <Carte titre="Vrac a fabriquer (kg)" valeur={nombre(totalKg, 1)} ton="neutre" />
            <Carte titre="Vrac sans recette" valeur={sansRecette.length + lotInconnu.length} ton={sansRecette.length + lotInconnu.length > 0 ? "rouge" : "vert"} />
            <Carte titre="Matieres premieres" valeur={besoins.length} ton="neutre" />
            <Carte titre="En manque" valeur={enManque.length} ton={enManque.length > 0 ? "rouge" : "vert"} />
            <Carte
              titre="Non couverts"
              valeur={nonCouverts.length}
              ton={nonCouverts.length > 0 ? "rouge" : enManque.length > 0 ? "ambre" : "vert"}
            />
          </section>

          {sansVrac.length > 0 ? (
            <section className="rounded-[1.75rem] border border-red-200 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
              <h2 className="text-lg font-bold text-red-800">Articles a produire dont le vrac n&apos;est pas calculable</h2>
              <p className="mt-1 text-sm text-slate-600">
                Leur besoin en matieres premieres n&apos;est pas compte ci-dessous. Il faut que l&apos;article ait un vrac lie, avec
                le nombre de pieces par carton et la contenance (ou la quantite de vrac dans sa Recette Conditionnement).
              </p>
              <ul className="mt-3 divide-y divide-slate-100">
                {sansVrac.map((article) => (
                  <li key={article.articleId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <Link
                      href={`/production/recette-conditionnement/${article.articleId}`}
                      className="font-semibold text-red-700 underline"
                    >
                      {article.nom}
                    </Link>
                    <span className="text-slate-500">
                      {article.raison === "sans_vrac"
                        ? "aucun vrac lie a cet article"
                        : `vrac ${article.vracNom ?? ""} : pieces par carton / contenance manquantes`}{" "}
                      - {nombre(article.aProduire)} carton(s) a produire - proforma {article.proformas.join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {sansRecette.length > 0 ? (
            <section className="rounded-[1.75rem] border border-red-200 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
              <h2 className="text-lg font-bold text-red-800">Vrac sans recette de fabrication</h2>
              <p className="mt-1 text-sm text-slate-600">
                Ces vracs sont a fabriquer mais n&apos;ont aucune matiere premiere dans leur{" "}
                <Link href="/production/recette-fabrication" className="font-semibold text-sky-700 underline">
                  Recette Fabrication
                </Link>
                . Leur besoin n&apos;est pas compte ci-dessous.
              </p>
              <ul className="mt-3 divide-y divide-slate-100">
                {sansRecette.map((vrac) => (
                  <li key={vrac.vracId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <Link href={`/production/recette-fabrication/${vrac.vracId}`} className="font-semibold text-red-700 underline">
                      {vrac.nom}
                    </Link>
                    <span className="text-slate-500">{nombre(vrac.kg, 1)} kg a fabriquer</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {lotInconnu.length > 0 ? (
            <section className="rounded-[1.75rem] border border-amber-200 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
              <h2 className="text-lg font-bold text-amber-800">Recettes sans quantite du lot</h2>
              <p className="mt-1 text-sm text-slate-600">
                La recette existe mais on ne sait pas pour combien de kg de vrac elle est calculee : remplis la quantite du lot
                dans la recette pour que le besoin soit compte.
              </p>
              <ul className="mt-3 divide-y divide-slate-100">
                {lotInconnu.map((vrac) => (
                  <li key={vrac.vracId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <Link href={`/production/recette-fabrication/${vrac.vracId}`} className="font-semibold text-amber-700 underline">
                      {vrac.nom}
                    </Link>
                    <span className="text-slate-500">{nombre(vrac.kg, 1)} kg a fabriquer</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">Matieres premieres necessaires</h2>
              <p className="mt-1 text-sm text-slate-600">
                Besoin = kg de vrac a fabriquer x quantite de la Recette Fabrication / kg du lot de la recette. Les kg de vrac
                viennent des cartons a produire (cartons commandes moins le stock PF, comme le Besoin Conditionnement) x pieces
                par carton x contenance. Stock utilisable = Depot E (reserve generale) + Depot B (depot de la fabrication) ; un solde negatif
                compte pour 0. Commande (BC) = ce qu&apos;il reste a recevoir sur les
                bons de commande en cours ; Import = ce qui est en route et pas encore receptionne : commande et import ne se
                comptent jamais deux fois.
              </p>
            </div>
            {besoins.length === 0 ? (
              <p className="px-6 py-5 text-sm text-slate-500">
                Aucune matiere premiere a calculer pour le moment (aucun vrac a fabriquer n&apos;a de recette complete).
              </p>
            ) : (
              <div className="max-h-[70vh] overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Matiere premiere</th>
                      <th className="px-4 py-3 font-semibold">Categorie</th>
                      <th className="px-4 py-3 font-semibold">Unite</th>
                      <th className="px-4 py-3 text-right font-semibold">Besoin</th>
                      <th className="px-4 py-3 text-right font-semibold">Depot E</th>
                      <th className="px-4 py-3 text-right font-semibold">Depot B</th>
                      <th className="px-4 py-3 text-right font-semibold">Stock utilisable</th>
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
                        <td className="px-4 py-3 text-xs font-semibold text-slate-500">{besoin.categorie || "-"}</td>
                        <td className="px-4 py-3 text-slate-600">{besoin.unite || "-"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{nombre(besoin.besoin)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{nombre(besoin.stockDepotE)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{nombre(besoin.stockDepotB)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{nombre(besoin.stock)}</td>
                        <td
                          className={`px-4 py-3 text-right font-semibold tabular-nums ${
                            besoin.manque > 0 ? "text-red-700" : "text-emerald-700"
                          }`}
                        >
                          {besoin.manque > 0 ? nombre(besoin.manque) : "OK"}
                        </td>
                        <CellulesArrivagesMp
                          commandes={besoin.commandes}
                          commandeTotal={besoin.commandeTotal}
                          imports={besoin.imports}
                          importTotal={besoin.importTotal}
                        />
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
              <h2 className="text-lg font-bold text-slate-900">Vrac a fabriquer</h2>
              <p className="mt-1 text-sm text-slate-600">
                {nbArticlesAProduire === 0
                  ? "Aucun article a produire."
                  : `${nbArticlesAProduire} article(s) a produire, ${vracs.length} vrac(s) a fabriquer.`}
              </p>
            </div>
            {vracs.length === 0 ? (
              <p className="px-6 py-5 text-sm text-slate-500">Aucun vrac a fabriquer.</p>
            ) : (
              <div className="max-h-[70vh] overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Vrac</th>
                      <th className="px-4 py-3 text-right font-semibold">A fabriquer (kg)</th>
                      <th className="px-4 py-3 font-semibold">Recette fabrication</th>
                      <th className="px-4 py-3 font-semibold">Articles commandes (cartons a produire)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vracs.map((vrac) => (
                      <tr key={vrac.vracId} className="border-t border-slate-100 align-top">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          <Link href={`/production/recette-fabrication/${vrac.vracId}`} className="text-sky-700 underline">
                            {vrac.nom}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">{nombre(vrac.kg, 1)}</td>
                        <td className="px-4 py-3">
                          {vrac.statutRecette === "ok" ? (
                            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                              {vrac.nbLignesRecette} matiere(s) premiere(s) - lot de {nombre(vrac.base)} kg
                            </span>
                          ) : vrac.statutRecette === "lot_inconnu" ? (
                            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                              Quantite du lot manquante
                            </span>
                          ) : (
                            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                              Pas de recette
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <ul className="space-y-0.5">
                            {vrac.articles.map((article) => (
                              <li key={article.articleId}>
                                {article.nom} - {nombre(article.cartons)} carton(s) = {nombre(article.kg, 1)} kg
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}

export default async function BesoinFabricationPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const utilisateur = await getCurrentStockUser();
  if (!(await canViewPageUser(utilisateur, CLE_PAGE))) {
    redirect("/production");
  }

  const params = await searchParams;
  const brut = Array.isArray(params.proforma) ? params.proforma.join(",") : String(params.proforma ?? "");
  const saisies = lireProformasSaisies(brut);

  let resultat: ResultatBesoinFabrication | null = null;
  let erreur: string | null = null;
  if (saisies.length > 0) {
    try {
      resultat = await calculerBesoinFabrication(saisies);
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
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Besoin Fabrication par proforma</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Tape un ou plusieurs numeros de proforma (ceux de Commandes PF). Le module calcule le vrac a fabriquer pour les
                cartons a produire, puis, avec la Recette Fabrication de chaque vrac, les matieres premieres necessaires. Il les
                compare au stock, aux commandes et aux imports en cours, et signale les vracs sans recette.
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
