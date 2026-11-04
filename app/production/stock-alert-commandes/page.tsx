import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { canViewPageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { ExportExcelButton } from "@/app/_components/export-excel-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { MultiSelectFilter } from "@/app/_components/multi-select-filter";
import { VoirToutBanner } from "@/app/_components/voir-tout-banner";
import { CellulesArrivagesMp } from "@/app/_components/besoin-arrivages-cellules";
import { matchesArticleSearch } from "@/lib/article-search";
import { construireQuery, correspondALaListe, lireListeParam, optionsDistinctes } from "@/lib/filtre-multiple";
import { formatDate } from "@/lib/format-date";
import { calculerAlerteMpCommandes, type AlerteMp, type ResultatAlerteMp } from "@/lib/stock-alert-mp-commandes";

const CLE_PAGE = "productionStockAlertCommandes";
const CHEMIN = "/production/stock-alert-commandes";

// Par defaut seules les MP en manque sont affichees (une centaine de lignes au plus) ; "Voir tout" montre le reste, les filtres
// et l'export Excel portent toujours sur toute la liste (voir app/_components/voir-tout-banner.tsx).
const LIMITE_LIGNES = 150;

type SearchParams = Promise<{
  q?: string;
  categorie?: string | string[];
  hideStand?: string;
  ok?: string;
  tout?: string;
}>;

function nombre(valeur: number, decimales = 3) {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: decimales });
}

function Carte({
  titre,
  valeur,
  detail,
  ton,
}: {
  titre: string;
  valeur: string | number;
  detail?: string;
  ton: "neutre" | "rouge" | "vert" | "ambre";
}) {
  const couleur =
    ton === "rouge" ? "text-red-700" : ton === "vert" ? "text-emerald-700" : ton === "ambre" ? "text-amber-700" : "text-slate-950";
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{titre}</p>
      <p className={`mt-2 text-3xl font-bold ${couleur}`}>{valeur}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

const LIBELLE_STATUT: Record<AlerteMp["statut"], string> = {
  non_couvert: "Non couvert",
  couvert: "Couvert par BC / import",
  ok: "Stock suffisant",
};

function CalculIncomplet({ resultat }: { resultat: ResultatAlerteMp }) {
  const { articlesSansRecette, sansVrac, vracsSansRecetteComplete, nbVracs } = resultat;
  if (articlesSansRecette.length + sansVrac.length + vracsSansRecetteComplete.length === 0) return null;

  const articles = [...articlesSansRecette].sort((a, b) => b.aProduire - a.aProduire);
  const vracs = [...vracsSansRecetteComplete].sort((a, b) => b.kg - a.kg);

  return (
    <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50 px-6 py-5 text-amber-950 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
      <h2 className="text-lg font-bold">Calcul incomplet : des recettes ne sont pas encore ecrites</h2>
      <p className="mt-1 text-sm">
        Le besoin en matieres premieres de ces articles n&apos;est <span className="font-bold">pas compte</span> ci-dessous : le
        stock alert ne montre que les matieres premieres des recettes deja ecrites. Il se complete au fur et a mesure que les
        recettes sont ajoutees.
      </p>
      <div className="mt-3 space-y-2">
        {articles.length > 0 ? (
          <details className="rounded-2xl border border-amber-200 bg-white px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold">
              {articles.length} article(s) a produire sans Recette Conditionnement complete
            </summary>
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {articles.map((article) => (
                <li key={article.articleId} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <Link href={`/production/recette-conditionnement/${article.articleId}`} className="font-semibold text-sky-700 underline">
                    {article.nom}
                  </Link>
                  <span className="text-xs text-slate-500">
                    {article.statutRecette === "lot_inconnu" ? "quantite du lot manquante" : "pas de recette"} -{" "}
                    {nombre(article.aProduire)} carton(s) a produire
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {sansVrac.length > 0 ? (
          <details className="rounded-2xl border border-amber-200 bg-white px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold">
              {sansVrac.length} article(s) a produire dont le vrac n&apos;est pas calculable
            </summary>
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {sansVrac.map((article) => (
                <li key={article.articleId} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <Link href={`/production/recette-conditionnement/${article.articleId}`} className="font-semibold text-sky-700 underline">
                    {article.nom}
                  </Link>
                  <span className="text-xs text-slate-500">
                    {article.raison === "sans_vrac"
                      ? "aucun vrac lie a cet article"
                      : `vrac ${article.vracNom ?? ""} : pieces par carton / contenance manquantes`}{" "}
                    - {nombre(article.aProduire)} carton(s) a produire
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {vracs.length > 0 ? (
          <details className="rounded-2xl border border-amber-200 bg-white px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold">
              {vracs.length} vrac(s) sur {nbVracs} sans Recette Fabrication complete
            </summary>
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {vracs.map((vrac) => (
                <li key={vrac.vracId} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <Link href={`/production/recette-fabrication/${vrac.vracId}`} className="font-semibold text-sky-700 underline">
                    {vrac.nom}
                  </Link>
                  <span className="text-xs text-slate-500">
                    {vrac.statutRecette === "sans_recette"
                      ? "pas de recette"
                      : vrac.statutRecette === "lot_inconnu"
                        ? "quantite du lot manquante"
                        : `recette incomplete : ${nombre(vrac.sommeRecette)} kg sur ${nombre(vrac.base)} kg`}{" "}
                    - {nombre(vrac.kg, 1)} kg a fabriquer
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}

function CommandesConcernees({ proformas }: { proformas: AlerteMp["proformas"] }) {
  return (
    <details className="text-xs text-slate-600">
      <summary className="cursor-pointer font-semibold text-sky-700">{proformas.length} proforma(s)</summary>
      <ul className="mt-1 space-y-0.5">
        {proformas.map((ligne) => (
          <li key={ligne.proforma}>
            <span className="font-semibold text-slate-800">{ligne.proforma}</span>
            {ligne.client ? ` - ${ligne.client}` : ""}
          </li>
        ))}
      </ul>
    </details>
  );
}

export default async function StockAlertCommandesPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const utilisateur = await getCurrentStockUser();
  if (!(await canViewPageUser(utilisateur, CLE_PAGE))) {
    redirect("/production");
  }

  const params = await searchParams;
  const q = (params.q || "").trim();
  const categoriesChoisies = lireListeParam(params.categorie);
  const sansStand = params.hideStand === "1";
  const avecSuffisant = params.ok === "1";
  const toutAffiche = params.tout === "1";

  let resultat: ResultatAlerteMp | null = null;
  let erreur: string | null = null;
  try {
    resultat = await calculerAlerteMpCommandes({ sansStand });
  } catch (e) {
    erreur = e instanceof Error ? e.message : "Erreur pendant le calcul.";
  }

  const alertes = resultat?.alertes ?? [];
  const nonCouvertes = alertes.filter((alerte) => alerte.statut === "non_couvert");
  const couvertes = alertes.filter((alerte) => alerte.statut === "couvert");
  const enManque = nonCouvertes.length + couvertes.length;

  const qMinuscule = q.toLowerCase();
  const lignes = alertes
    .filter((alerte) => avecSuffisant || alerte.manque > 0)
    .filter((alerte) => !qMinuscule || matchesArticleSearch(alerte.nom, qMinuscule))
    .filter((alerte) => correspondALaListe(alerte.categorie, categoriesChoisies));
  const lignesAffichees = toutAffiche ? lignes : lignes.slice(0, LIMITE_LIGNES);
  const hrefVoirTout = `${CHEMIN}?${construireQuery(
    {
      q,
      hideStand: sansStand ? "1" : undefined,
      ok: avecSuffisant ? "1" : undefined,
      tout: "1",
    },
    { categorie: categoriesChoisies }
  )}`;

  const nomsOptions = alertes.map((alerte, index) => ({ id: index, label: alerte.nom }));
  const categorieOptions = optionsDistinctes(alertes.map((alerte) => alerte.categorie));

  const exportColumns = [
    { label: "Categorie", key: "categorie" },
    { label: "Matiere premiere", key: "matierePremiere" },
    { label: "Unite", key: "unite" },
    { label: "Besoin fabrication", key: "besoinFabrication" },
    { label: "Besoin conditionnement", key: "besoinConditionnement" },
    { label: "Besoin total", key: "besoin" },
    { label: "Stock Depot E", key: "stock" },
    { label: "Manque", key: "manque" },
    { label: "Commande (BC) en cours", key: "commandeBc" },
    { label: "Import en cours", key: "import" },
    { label: "Reste a couvrir", key: "resteACouvrir" },
    { label: "Statut", key: "statut" },
    { label: "Proformas concernees", key: "proformas" },
  ];
  const exportRows = lignes.map((alerte) => ({
    categorie: alerte.categorie || "-",
    matierePremiere: alerte.nom,
    unite: alerte.unite || "-",
    besoinFabrication: alerte.besoinFabrication,
    besoinConditionnement: alerte.besoinConditionnement,
    besoin: alerte.besoin,
    stock: alerte.stock,
    manque: alerte.manque,
    commandeBc: alerte.commandes.length
      ? alerte.commandes
          .map(
            (commande) =>
              `${commande.code} - ${commande.quantite}${commande.dateCommande ? ` - commande du ${formatDate(commande.dateCommande)}` : ""}`
          )
          .join(" | ")
      : "-",
    import: alerte.imports.length
      ? alerte.imports
          .map(
            (transit) =>
              `${transit.nDoss4d || transit.nDossErp || "Sans dossier"} - ${transit.quantite}${
                transit.datePrevueReception ? ` - reception prevue le ${formatDate(transit.datePrevueReception)}` : ""
              }`
          )
          .join(" | ")
      : "-",
    resteACouvrir: alerte.resteACouvrir,
    statut: LIBELLE_STATUT[alerte.statut],
    proformas: alerte.proformas.map((ligne) => (ligne.client ? `${ligne.proforma} (${ligne.client})` : ligne.proforma)).join(", "),
  }));

  const aucuneCommande = resultat !== null && resultat.proformas.length === 0;
  const phrasesVerdict = [
    nonCouvertes.length > 0
      ? `${nonCouvertes.length} matiere(s) premiere(s) ne suffisent pas pour les commandes ouvertes et ne sont pas (assez) commandees ou en import`
      : null,
    couvertes.length > 0 ? `${couvertes.length} matiere(s) premiere(s) en manque mais couverte(s) par un BC / import en cours` : null,
  ].filter(Boolean);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Production</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Stock Alert MP par commande</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Toutes les commandes ouvertes (Commandes PF non livrees) sont prises automatiquement. Pour chaque matiere
                premiere, le besoin (Recette Fabrication + Recette Conditionnement, apres deduction du stock PF) est compare au
                stock du Depot E seulement, puis aux commandes (BC) et imports en cours. Seules les matieres premieres en manque
                sont affichees, sauf si tu coches &quot;Afficher aussi les stocks suffisants&quot;.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <BackButton href="/production" label="Retour production" />
              {resultat ? (
                <ExportExcelButton
                  rows={exportRows}
                  columns={exportColumns}
                  filename={`stock-alert-mp-commandes-${new Date().toISOString().slice(0, 10)}.xlsx`}
                />
              ) : null}
              <RefreshButton />
            </div>
          </div>

          <form className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <SearchableFilterInput name="q" defaultValue={q} options={nomsOptions} placeholder="Rechercher une matiere premiere..." />
            </div>
            <div className="lg:col-span-2">
              <MultiSelectFilter name="categorie" placeholder="Categorie..." options={categorieOptions} selected={categoriesChoisies} />
            </div>
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
              <input type="checkbox" name="hideStand" value="1" defaultChecked={sansStand} className="h-4 w-4" />
              Sans les commandes STAND
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
              <input type="checkbox" name="ok" value="1" defaultChecked={avecSuffisant} className="h-4 w-4" />
              Afficher aussi les stocks suffisants
            </label>
            <SubmitButton
              pendingLabel="Calcul..."
              className="rounded-2xl bg-sky-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-600 lg:col-span-6 lg:justify-self-start lg:px-8"
            >
              Filtrer
            </SubmitButton>
          </form>
        </section>

        {erreur ? (
          <section className="rounded-[1.75rem] border border-red-200 bg-red-50 px-6 py-4 text-sm font-medium text-red-800">
            {erreur}
          </section>
        ) : null}

        {resultat && aucuneCommande ? (
          <section className="rounded-[1.75rem] border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600">
            Aucune commande ouverte{sansStand ? " (hors STAND)" : ""} dans Commandes PF.
          </section>
        ) : null}

        {resultat && !aucuneCommande ? (
          <>
            <section
              className={`rounded-[1.75rem] border px-6 py-5 text-[16px] font-semibold ${
                nonCouvertes.length > 0
                  ? "border-red-200 bg-red-50 text-red-900"
                  : couvertes.length > 0
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900"
              }`}
            >
              {enManque === 0
                ? alertes.length === 0
                  ? "Aucune matiere premiere a calculer pour le moment : aucune recette n'est ecrite pour les articles a produire."
                  : "Le stock du Depot E couvre toutes les matieres premieres calculees pour les commandes ouvertes."
                : phrasesVerdict.join(" - ")}
            </section>

            {resultat.arrivagesIndisponibles ? (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                Commandes et imports non lus : le stock est compare au besoin sans tenir compte de ce qui est deja en route.
                Recharge la page pour reessayer.
              </p>
            ) : null}

            <section className="grid gap-4 md:grid-cols-5">
              <Carte
                titre="Commandes ouvertes"
                valeur={resultat.proformas.length}
                detail={`proformas - ${resultat.nbCommandes} camion(s)${sansStand ? " (hors STAND)" : ""}`}
                ton="neutre"
              />
              <Carte
                titre="Articles a produire"
                valeur={resultat.nbArticlesAProduire}
                detail={`${resultat.nbVracs} vrac(s) a fabriquer`}
                ton="neutre"
              />
              <Carte titre="Matieres premieres calculees" valeur={alertes.length} ton="neutre" />
              <Carte
                titre="En manque"
                valeur={enManque}
                detail={enManque > 0 ? `${nonCouvertes.length} non couverte(s)` : undefined}
                ton={nonCouvertes.length > 0 ? "rouge" : couvertes.length > 0 ? "ambre" : "vert"}
              />
              <Carte
                titre="Couvertes par BC / import"
                valeur={couvertes.length}
                ton={couvertes.length > 0 ? "ambre" : "neutre"}
              />
            </section>

            <CalculIncomplet resultat={resultat} />

            <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
              <div className="border-b border-slate-100 px-6 py-4">
                <h2 className="text-lg font-bold text-slate-900">
                  {avecSuffisant ? "Matieres premieres des commandes ouvertes" : "Matieres premieres en manque"}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Besoin = ce qu&apos;il faut produire pour les commandes ouvertes (cartons commandes moins le stock PF) x la
                  recette. Stock = Depot E seulement (les autres depots ne comptent pas). Commande (BC) = ce qu&apos;il reste a
                  recevoir sur les bons de commande ; Import = en route et pas encore receptionne : commande et import ne se
                  comptent jamais deux fois. Rouge = rien (ou pas assez) ne couvre le manque ; jaune = le manque est couvert par
                  un BC / import.
                </p>
              </div>
              {lignes.length === 0 ? (
                <p className="px-6 py-5 text-sm text-slate-500">
                  {alertes.length === 0 || enManque === 0
                    ? "Aucune matiere premiere en manque."
                    : "Aucune matiere premiere ne correspond a ces filtres."}
                </p>
              ) : (
                <div className="max-h-[75vh] overflow-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600">
                      <tr>
                        <th className="min-w-[16rem] px-4 py-3 font-semibold">Matiere premiere</th>
                        <th className="px-4 py-3 font-semibold">Categorie</th>
                        <th className="px-4 py-3 font-semibold">Unite</th>
                        <th className="px-4 py-3 text-right font-semibold">Besoin</th>
                        <th className="px-4 py-3 text-right font-semibold">Stock Depot E</th>
                        <th className="px-4 py-3 text-right font-semibold">Manque</th>
                        <th className="px-4 py-3 font-semibold">Commande (BC) en cours</th>
                        <th className="px-4 py-3 font-semibold">Import en cours</th>
                        <th className="px-4 py-3 text-right font-semibold">Reste a couvrir</th>
                        <th className="px-4 py-3 font-semibold">Commandes concernees</th>
                        <th className="px-4 py-3 font-semibold">Utilise par</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lignesAffichees.map((alerte) => (
                        <tr
                          key={alerte.articleMpId}
                          className={`border-t border-slate-100 align-top ${
                            alerte.statut === "non_couvert" ? "bg-red-50" : alerte.statut === "couvert" ? "bg-amber-50" : ""
                          }`}
                        >
                          <td className="px-4 py-3 font-medium text-slate-900">{alerte.nom}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-slate-500">{alerte.categorie || "-"}</td>
                          <td className="px-4 py-3 text-slate-600">{alerte.unite || "-"}</td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {nombre(alerte.besoin)}
                            {alerte.besoinFabrication > 0 && alerte.besoinConditionnement > 0 ? (
                              <p className="text-xs text-slate-500">
                                fabrication {nombre(alerte.besoinFabrication)} + conditionnement{" "}
                                {nombre(alerte.besoinConditionnement)}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {nombre(alerte.stock)}
                            <p className="text-xs text-slate-500">couvre {Math.floor(alerte.couverture * 100)} % du besoin</p>
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-semibold tabular-nums ${
                              alerte.manque > 0 ? "text-red-700" : "text-emerald-700"
                            }`}
                          >
                            {alerte.manque > 0 ? nombre(alerte.manque) : "OK"}
                          </td>
                          <CellulesArrivagesMp
                            commandes={alerte.commandes}
                            commandeTotal={alerte.commandeTotal}
                            imports={alerte.imports}
                            importTotal={alerte.importTotal}
                          />
                          <td
                            className={`px-4 py-3 text-right font-semibold tabular-nums ${
                              alerte.resteACouvrir > 0
                                ? "text-red-700"
                                : alerte.manque > 0
                                  ? "text-amber-700"
                                  : "text-emerald-700"
                            }`}
                          >
                            {alerte.resteACouvrir > 0 ? nombre(alerte.resteACouvrir) : alerte.manque > 0 ? "Couvert" : "OK"}
                          </td>
                          <td className="px-4 py-3">
                            <CommandesConcernees proformas={alerte.proformas} />
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {alerte.utilisePar.slice(0, 3).join(", ")}
                            {alerte.utilisePar.length > 3 ? ` + ${alerte.utilisePar.length - 3} autre(s)` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <VoirToutBanner affiches={lignesAffichees.length} total={lignes.length} href={hrefVoirTout} />
                </div>
              )}
            </section>

            <details className="rounded-[1.75rem] border border-slate-200 bg-white px-6 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
              <summary className="cursor-pointer text-sm font-bold text-slate-900">
                {resultat.proformas.length} proforma(s) prises en compte
              </summary>
              <ul className="mt-3 flex flex-wrap gap-2">
                {resultat.proformas.map((proforma) => {
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
            </details>
          </>
        ) : null}
      </div>
    </main>
  );
}
