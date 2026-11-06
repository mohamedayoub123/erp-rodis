"use client";

import { useEffect, useMemo, useState } from "react";
import { matchesArticleSearch } from "@/lib/article-search";
import { formatDate } from "@/lib/format-date";
import { useComboboxNav } from "@/app/_components/use-combobox-nav";
import { formaterLitres, formaterM3, formaterNombreColis } from "@/lib/volume-colis";
import { calculerVolumeLot, lireNombreSaisi } from "@/lib/volume-lot-mp";
import { lireLotsArticleVolumeAction, type LotAffiche, type LotsArticleVolume } from "./actions";

export type ArticleOption = { id: number; label: string };

const LIMITE_ARTICLES_AFFICHES = 120;

const TYPES_CONTENANT: Record<string, string> = { SAC: "Sac", FUT: "Fût", BARRIQUE: "Barrique", CARTON: "Carton", BIDON: "Bidon" };

const CLASSE_CHAMP = "w-full min-w-0 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none focus:border-sky-400";

function nombre(valeur: number, decimales = 3) {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: decimales });
}

// Valeur deja connue de l'article, mise dans un champ texte ("33,5") ; vide si inconnue
function texteChamp(valeur: number | null | undefined) {
  return typeof valeur === "number" && Number.isFinite(valeur) ? String(valeur).replace(".", ",") : "";
}

function libelleLot(lot: LotAffiche, unite: string) {
  const type = lot.conditionnement ? TYPES_CONTENANT[lot.conditionnement] ?? lot.conditionnement : null;
  const contenance = lot.contenance !== null ? ` - ${type ? `${type} de ` : ""}${nombre(lot.contenance)}` : "";
  return `${lot.numeroLot} - ${lot.depotNom} - stock ${nombre(lot.stock)}${unite ? ` ${unite}` : ""}${contenance}`;
}

// "Volume par lot MP" : on choisit un article puis un de ses lots en stock, on tape longueur / largeur / hauteur d'UN colis (cm),
// et le volume d'un colis puis celui du lot (stock du lot / contenance = nombre de colis) sortent tout seuls. Les dimensions et
// la contenance deja connues de l'article / du lot sont proposees, modifiables ; RIEN n'est enregistre par cet ecran.
export function VolumeLotMp({ articles }: { articles: ArticleOption[] }) {
  const [articleInput, setArticleInput] = useState("");
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [resultatLu, setResultatLu] = useState<({ articleId: number } & LotsArticleVolume) | null>(null);
  const [cleLot, setCleLot] = useState("");
  const [longueur, setLongueur] = useState("");
  const [largeur, setLargeur] = useState("");
  const [hauteur, setHauteur] = useState("");
  const [contenance, setContenance] = useState("");

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

  // Lots et dimensions deja connues de l'article choisi : lus A LA DEMANDE a chaque changement d'article. La reponse d'un article
  // abandonne est ignoree, et seule la reponse de l'article ACTUEL est affichee (voir "lecture" plus bas).
  useEffect(() => {
    if (articleChoisiId === null) return;
    let annule = false;
    lireLotsArticleVolumeAction(articleChoisiId)
      .then((reponse) => {
        if (annule) return;
        setResultatLu({ articleId: articleChoisiId, ...reponse });
        if (!reponse.ok) return;
        setLongueur(texteChamp(reponse.article.longueur));
        setLargeur(texteChamp(reponse.article.largeur));
        setHauteur(texteChamp(reponse.article.hauteur));
        // un seul lot en stock : choisi d'office
        const unique = reponse.lots.length === 1 ? reponse.lots[0] : null;
        setCleLot(unique?.cle ?? "");
        setContenance(texteChamp(unique?.contenance ?? reponse.article.contenance));
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
    const lot = donnees?.lots.find((item) => item.cle === cle);
    // la contenance REELLE du lot si elle est connue, sinon celle de l'article
    if (lot) setContenance(texteChamp(lot.contenance ?? donnees?.article.contenance));
  }

  const lotChoisi = donnees?.lots.find((lot) => lot.cle === cleLot) ?? null;
  const uniteStock = donnees?.article.unite ?? "";
  const uniteContenance = donnees?.article.uniteContenance ?? "kg";
  // la contenance se compte dans la MEME unite que le stock du lot (Grs, kg, pcs...) : c'est cette unite qui est affichee
  const uniteLibelle = uniteStock || uniteContenance;
  const contenanceLue = lireNombreSaisi(contenance);
  const resultat = calculerVolumeLot({
    longueur: lireNombreSaisi(longueur),
    largeur: lireNombreSaisi(largeur),
    hauteur: lireNombreSaisi(hauteur),
    stock: lotChoisi?.stock ?? null,
    contenance: contenanceLue,
  });
  const dimensionsSaisies = [longueur, largeur, hauteur].some((valeur) => valeur.trim() !== "");

  return (
    <section className="rounded-[2rem] border border-sky-200 bg-white p-6 shadow-[0_18px_40px_rgba(14,116,144,0.08)]">
      <div className="grid grid-cols-1 gap-5">
        <label className="relative grid grid-cols-1 gap-2 text-sm font-semibold text-slate-900">
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

        {enCours ? <p className="text-sm text-slate-500">Lecture des lots de l&apos;article...</p> : null}
        {message ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{message}</p> : null}

        {donnees ? (
          <>
            <label className="grid grid-cols-1 gap-2 text-sm font-semibold text-slate-900">
              <span>2. Lot</span>
              {donnees.lots.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-normal text-slate-600">
                  Aucun lot en stock pour cet article : seul le volume d&apos;un colis peut etre calcule.
                </p>
              ) : (
                <select value={cleLot} onChange={(event) => choisirLot(event.target.value)} className={CLASSE_CHAMP}>
                  <option value="">Choisis un lot ({donnees.lots.length} en stock)</option>
                  {donnees.lots.map((lot) => (
                    <option key={lot.cle} value={lot.cle}>
                      {libelleLot(lot, uniteStock)}
                    </option>
                  ))}
                </select>
              )}
              {lotChoisi?.datePeremption ? (
                <span className="text-xs font-normal text-slate-500">Peremption du lot : {formatDate(lotChoisi.datePeremption)}</span>
              ) : null}
            </label>

            <div className="grid grid-cols-1 gap-2 text-sm font-semibold text-slate-900">
              <span>3. Dimensions d&apos;un colis (cm)</span>
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  value={longueur}
                  onChange={(event) => setLongueur(event.target.value)}
                  inputMode="decimal"
                  placeholder="Longueur"
                  aria-label="Longueur du colis en cm"
                  className={CLASSE_CHAMP}
                />
                <input
                  value={largeur}
                  onChange={(event) => setLargeur(event.target.value)}
                  inputMode="decimal"
                  placeholder="Largeur"
                  aria-label="Largeur du colis en cm"
                  className={CLASSE_CHAMP}
                />
                <input
                  value={hauteur}
                  onChange={(event) => setHauteur(event.target.value)}
                  inputMode="decimal"
                  placeholder="Hauteur"
                  aria-label="Hauteur du colis en cm"
                  className={CLASSE_CHAMP}
                />
              </div>
              <span className="text-xs font-normal text-slate-500">
                Les dimensions deja connues de l&apos;article sont proposees ; tu peux les changer, rien n&apos;est enregistre ici.
              </span>
            </div>

            <label className="grid grid-cols-1 gap-2 text-sm font-semibold text-slate-900 sm:max-w-xs">
              <span>Contenance d&apos;un colis ({uniteLibelle})</span>
              <input
                value={contenance}
                onChange={(event) => setContenance(event.target.value)}
                inputMode="decimal"
                placeholder={uniteContenance === "pièces" ? "ex : 1000" : "ex : 25"}
                className={CLASSE_CHAMP}
              />
            </label>

            <div className="grid gap-3 rounded-2xl border border-sky-100 bg-sky-50 p-5">
              {resultat.litresColis !== null && resultat.m3Colis !== null ? (
                <p className="text-sm text-slate-700">
                  Volume d&apos;un colis :{" "}
                  <span className="text-xl font-black text-slate-900">{formaterM3(resultat.m3Colis, 4)}</span>{" "}
                  <span className="text-slate-500">({formaterLitres(resultat.litresColis)})</span>
                </p>
              ) : (
                <p className="text-sm text-slate-600">
                  {dimensionsSaisies
                    ? "Renseigne la longueur, la largeur et la hauteur, chacune superieure a 0 (en cm)."
                    : "Tape la longueur, la largeur et la hauteur (en cm) : le volume sort tout seul."}
                </p>
              )}

              {lotChoisi ? (
                resultat.m3Lot !== null && resultat.colis !== null ? (
                  <>
                    <p className="text-sm text-slate-700">
                      Lot {lotChoisi.numeroLot} ({lotChoisi.depotNom}) : {nombre(lotChoisi.stock)}
                      {uniteStock ? ` ${uniteStock}` : ""} / {nombre(contenanceLue ?? 0)} {uniteLibelle} par colis ={" "}
                      <span className="font-semibold text-slate-900">{formaterNombreColis(resultat.colis)} colis</span>
                    </p>
                    <p className="text-sm text-slate-700">
                      Volume du lot : <span className="text-2xl font-black text-emerald-800">{formaterM3(resultat.m3Lot)}</span>
                    </p>
                  </>
                ) : resultat.litresColis !== null ? (
                  <p className="text-sm text-slate-600">Renseigne la contenance d&apos;un colis pour avoir le volume du lot.</p>
                ) : null
              ) : donnees.lots.length > 0 ? (
                <p className="text-sm text-slate-600">Choisis un lot pour avoir aussi son volume total.</p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
