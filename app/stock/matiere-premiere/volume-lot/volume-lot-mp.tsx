"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { matchesArticleSearch } from "@/lib/article-search";
import { formatDate } from "@/lib/format-date";
import { useComboboxNav } from "@/app/_components/use-combobox-nav";
import { formaterLitres } from "@/lib/volume-colis";
import { calculerVolumeLot, formaterVolumeLot, lireNombreSaisi } from "@/lib/volume-lot-mp";
import {
  enregistrerDimensionsLotAction,
  lireLotsArticleVolumeAction,
  supprimerDimensionsLotAction,
  type DimensionsLot,
  type LotAffiche,
  type LotsArticleVolume,
} from "./actions";

export type ArticleOption = { id: number; label: string };

const LIMITE_ARTICLES_AFFICHES = 120;

const CLASSE_CHAMP = "w-full min-w-0 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none focus:border-sky-400";

function nombre(valeur: number, decimales = 3) {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: decimales });
}

// Valeur deja enregistree, mise dans un champ texte ("33,5") ; vide si inconnue
function texteChamp(valeur: number | null | undefined) {
  return typeof valeur === "number" && Number.isFinite(valeur) ? String(valeur).replace(".", ",") : "";
}

function libelleLot(lot: LotAffiche, unite: string) {
  const enregistre = lot.dimensions ? " - dimensions enregistrees" : "";
  return `${lot.numeroLot} - stock ${nombre(lot.stock)}${unite ? ` ${unite}` : ""}${enregistre}`;
}

// "Volume par lot MP" : on choisit un article puis un de ses lots en stock, on tape la longueur / largeur / hauteur du LOT ENTIER (cm)
// et le volume en m3 sort tout seul. "Enregistrer" garde ces dimensions pour ce lot : la colonne Volume de la page Stock MP les reprend
// sur chaque ligne du lot. Sans le SQL (table lots_mp_dimensions), le calcul marche mais rien ne peut etre enregistre.
export function VolumeLotMp({
  articles,
  peutModifier,
  peutSupprimer,
  sqlChemin,
}: {
  articles: ArticleOption[];
  peutModifier: boolean;
  peutSupprimer: boolean;
  sqlChemin: string;
}) {
  const [articleInput, setArticleInput] = useState("");
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [resultatLu, setResultatLu] = useState<({ articleId: number } & LotsArticleVolume) | null>(null);
  const [cleLot, setCleLot] = useState("");
  const [longueur, setLongueur] = useState("");
  const [largeur, setLargeur] = useState("");
  const [hauteur, setHauteur] = useState("");
  const [retour, setRetour] = useState<{ ok: boolean; message: string } | null>(null);
  const [enAttente, demarrer] = useTransition();

  const articleChoisi = useMemo(
    () => articles.find((article) => article.label === articleInput) ?? null,
    [articleInput, articles]
  );
  const articleChoisiId = articleChoisi?.id ?? null;

  const articlesFiltres = useMemo(() => {
    if (!articleInput.trim()) return articles;
    return articles.filter((article) => matchesArticleSearch(article.label, articleInput));
  }, [articleInput, articles]);
  const articlesAffiches = articlesFiltres.slice(0, LIMITE_ARTICLES_AFFICHES);

  function choisirArticle(article: ArticleOption) {
    setArticleInput(article.label);
    setMenuOuvert(false);
  }
  const navigation = useComboboxNav(articlesAffiches, choisirArticle);

  function remplirChamps(dimensions: DimensionsLot | null) {
    setLongueur(texteChamp(dimensions?.longueur));
    setLargeur(texteChamp(dimensions?.largeur));
    setHauteur(texteChamp(dimensions?.hauteur));
  }

  // Lots et dimensions deja enregistrees de l'article choisi : lus A LA DEMANDE a chaque changement d'article. La reponse d'un article
  // abandonne est ignoree, et seule la reponse de l'article ACTUEL est affichee (voir "lecture" plus bas).
  useEffect(() => {
    if (articleChoisiId === null) return;
    let annule = false;
    lireLotsArticleVolumeAction(articleChoisiId)
      .then((reponse) => {
        if (annule) return;
        setResultatLu({ articleId: articleChoisiId, ...reponse });
        setRetour(null);
        if (!reponse.ok) return;
        // un seul lot en stock : choisi d'office
        const unique = reponse.lots.length === 1 ? reponse.lots[0] : null;
        setCleLot(unique?.cle ?? "");
        remplirChamps(unique?.dimensions ?? null);
      })
      .catch(() => {
        if (annule) return;
        setResultatLu({ articleId: articleChoisiId, ok: false, message: "Lots indisponibles pour le moment. Reessaie dans un instant." });
      });
    return () => {
      annule = true;
    };
  }, [articleChoisiId]);

  const lecture = resultatLu && resultatLu.articleId === articleChoisiId ? resultatLu : null;
  const enCours = articleChoisiId !== null && lecture === null;
  const message = lecture && !lecture.ok ? lecture.message : null;
  const donnees = lecture && lecture.ok ? lecture : null;

  function choisirLot(cle: string) {
    setCleLot(cle);
    setRetour(null);
    remplirChamps(donnees?.lots.find((item) => item.cle === cle)?.dimensions ?? null);
  }

  const lotChoisi = donnees?.lots.find((lot) => lot.cle === cleLot) ?? null;
  const uniteStock = donnees?.article.unite ?? "";
  const longueurLue = lireNombreSaisi(longueur);
  const largeurLue = lireNombreSaisi(largeur);
  const hauteurLue = lireNombreSaisi(hauteur);
  const volume = calculerVolumeLot(longueurLue, largeurLue, hauteurLue);
  const dimensionsSaisies = [longueur, largeur, hauteur].some((valeur) => valeur.trim() !== "");
  const dejaEnregistre =
    !!lotChoisi?.dimensions &&
    lotChoisi.dimensions.longueur === longueurLue &&
    lotChoisi.dimensions.largeur === largeurLue &&
    lotChoisi.dimensions.hauteur === hauteurLue;

  // Met a jour la liste locale apres un enregistrement / une suppression (sans relire toute la base)
  function majDimensionsLot(cle: string, dimensions: DimensionsLot | null) {
    setResultatLu((precedent) =>
      precedent && precedent.ok
        ? { ...precedent, lots: precedent.lots.map((lot) => (lot.cle === cle ? { ...lot, dimensions } : lot)) }
        : precedent
    );
  }

  function enregistrer() {
    if (!donnees || !lotChoisi || !volume || longueurLue === null || largeurLue === null || hauteurLue === null) return;
    const cle = lotChoisi.cle;
    const numeroLot = lotChoisi.numeroLot;
    const articleId = donnees.article.id;
    demarrer(async () => {
      try {
        const reponse = await enregistrerDimensionsLotAction(articleId, numeroLot, longueurLue, largeurLue, hauteurLue);
        setRetour(reponse);
        if (reponse.ok) majDimensionsLot(cle, { longueur: longueurLue, largeur: largeurLue, hauteur: hauteurLue });
      } catch {
        setRetour({ ok: false, message: "Enregistrement impossible pour le moment. Reessaie dans un instant." });
      }
    });
  }

  function supprimer() {
    if (!donnees || !lotChoisi) return;
    if (!window.confirm(`Supprimer les dimensions enregistrees du lot ${lotChoisi.numeroLot} ?`)) return;
    const cle = lotChoisi.cle;
    const numeroLot = lotChoisi.numeroLot;
    const articleId = donnees.article.id;
    demarrer(async () => {
      try {
        const reponse = await supprimerDimensionsLotAction(articleId, numeroLot);
        setRetour(reponse);
        if (reponse.ok) {
          majDimensionsLot(cle, null);
          remplirChamps(null);
        }
      } catch {
        setRetour({ ok: false, message: "Suppression impossible pour le moment. Reessaie dans un instant." });
      }
    });
  }

  return (
    <section className="rounded-[2rem] border border-sky-200 bg-white p-6 shadow-[0_18px_40px_rgba(14,116,144,0.08)]">
      <div className="grid grid-cols-1 gap-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <label className="relative grid grid-cols-1 content-start gap-2 text-sm font-semibold text-slate-900">
            <span>1. Article</span>
            <input
              value={articleInput}
              onChange={(event) => {
                setArticleInput(event.target.value);
                setMenuOuvert(true);
                navigation.setHighlightedIndex(0);
              }}
              onKeyDown={navigation.handleKeyDown}
              onFocus={() => setMenuOuvert(true)}
              onBlur={() => setTimeout(() => setMenuOuvert(false), 150)}
              placeholder="Ecris l'article puis choisis (fleches + Entree)"
              className={CLASSE_CHAMP}
              autoComplete="off"
            />
            {menuOuvert && articlesFiltres.length > 0 ? (
              <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
                {articlesAffiches.map((article, index) => (
                  <button
                    key={article.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choisirArticle(article)}
                    className={`block w-full px-4 py-2 text-left text-sm text-slate-800 ${
                      index === navigation.highlightedIndex ? "bg-slate-100" : "hover:bg-slate-100"
                    }`}
                  >
                    {article.label}
                  </button>
                ))}
                {articlesFiltres.length > articlesAffiches.length ? (
                  <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
                    + {articlesFiltres.length - articlesAffiches.length} autres articles - continue d&apos;ecrire pour preciser.
                  </p>
                ) : null}
              </div>
            ) : null}
          </label>

          <div className="grid grid-cols-1 content-start gap-2 text-sm font-semibold text-slate-900">
            <span>2. Lot</span>
            {enCours ? <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-normal text-slate-500">Lecture des lots de l&apos;article...</p> : null}
            {message ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{message}</p> : null}
            {!donnees && !enCours && !message ? (
              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-normal text-slate-500">Choisis d&apos;abord un article.</p>
            ) : null}
            {donnees ? (
              donnees.lots.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-normal text-slate-600">
                  Aucun lot en stock pour cet article : il n&apos;y a pas de lot sur lequel enregistrer des dimensions.
                </p>
              ) : (
                <>
                  <select value={cleLot} onChange={(event) => choisirLot(event.target.value)} className={CLASSE_CHAMP}>
                    <option value="">Choisis un lot ({donnees.lots.length} en stock)</option>
                    {donnees.lots.map((lot) => (
                      <option key={lot.cle} value={lot.cle}>
                        {libelleLot(lot, uniteStock)}
                      </option>
                    ))}
                  </select>
                  {lotChoisi ? (
                    <span className="text-xs font-normal text-slate-500">
                      {lotChoisi.depotsTexte}
                      {lotChoisi.datePeremption ? ` - peremption ${formatDate(lotChoisi.datePeremption)}` : ""}
                    </span>
                  ) : null}
                </>
              )
            ) : null}
          </div>
        </div>

        {donnees && lotChoisi ? (
          <>
            {!lecture || !lecture.ok || lecture.tableDisponible ? null : (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
                Pour enregistrer les dimensions des lots, execute d&apos;abord le SQL{" "}
                <code className="rounded bg-white px-1.5 py-0.5 text-xs">{sqlChemin}</code> dans Supabase (SQL Editor). Le calcul marche deja.
              </p>
            )}

            <div className="grid grid-cols-1 gap-2 text-sm font-semibold text-slate-900">
              <span>3. Dimensions du lot entier (cm)</span>
              <div className="grid gap-4 sm:grid-cols-3">
                <input
                  value={longueur}
                  onChange={(event) => setLongueur(event.target.value)}
                  inputMode="decimal"
                  placeholder="Longueur"
                  aria-label="Longueur du lot en cm"
                  className={CLASSE_CHAMP}
                />
                <input
                  value={largeur}
                  onChange={(event) => setLargeur(event.target.value)}
                  inputMode="decimal"
                  placeholder="Largeur"
                  aria-label="Largeur du lot en cm"
                  className={CLASSE_CHAMP}
                />
                <input
                  value={hauteur}
                  onChange={(event) => setHauteur(event.target.value)}
                  inputMode="decimal"
                  placeholder="Hauteur"
                  aria-label="Hauteur du lot en cm"
                  className={CLASSE_CHAMP}
                />
              </div>
            </div>

            <div className="grid gap-3 rounded-2xl border border-sky-100 bg-sky-50 p-5">
              {volume ? (
                <p className="text-sm text-slate-700">
                  Volume du lot {lotChoisi.numeroLot} :{" "}
                  <span className="text-3xl font-black text-emerald-800">{formaterVolumeLot(volume.m3)}</span>{" "}
                  <span className="text-slate-500">({formaterLitres(volume.litres)})</span>
                  {dejaEnregistre ? <span className="ml-3 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Enregistre</span> : null}
                </p>
              ) : (
                <p className="text-sm text-slate-600">
                  {dimensionsSaisies
                    ? "Renseigne la longueur, la largeur et la hauteur, chacune superieure a 0 (en cm)."
                    : "Tape la longueur, la largeur et la hauteur du lot (en cm) : le volume sort tout seul."}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {peutModifier ? (
                <button
                  type="button"
                  onClick={enregistrer}
                  disabled={enAttente || !volume || dejaEnregistre || !lecture || !lecture.ok || !lecture.tableDisponible}
                  className="rounded-2xl bg-sky-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {enAttente ? "Enregistrement..." : "Enregistrer pour ce lot"}
                </button>
              ) : (
                <p className="text-sm text-slate-500">Tu peux calculer, mais ce compte ne peut pas enregistrer de dimensions.</p>
              )}
              {peutSupprimer && lotChoisi.dimensions ? (
                <button
                  type="button"
                  onClick={supprimer}
                  disabled={enAttente}
                  className="rounded-2xl border border-red-200 px-6 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-40"
                >
                  Supprimer les dimensions enregistrees
                </button>
              ) : null}
            </div>

            {retour ? (
              <p className={`rounded-2xl px-4 py-3 text-sm font-medium ${retour.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
                {retour.message}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
