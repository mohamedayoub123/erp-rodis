"use client";

import { useEffect, useState, useTransition } from "react";
import { saveTestLaboAction, ajouterAjustementMpTestLaboAction } from "../../../actions";
import { ProduitPickerField } from "../../../produit-picker-field";
import { fetchAvailableLotsAction } from "@/app/depots/transfer-order/actions";
import { DateJmaFormField } from "@/app/_components/date-jma-input";
import { SubmitButton } from "@/app/_components/submit-button";

type RapportInfo = {
  ph: number | null;
  densite: number | null;
  viscosite: number | null;
  degre_alcool: number | null;
  stabilite: string | null;
  couleur: string | null;
  temperature_test: number | null;
  odeur: string | null;
  taux_humidite: number | null;
  pression_atmospherique: number | null;
  texture: string | null;
  remarque: string | null;
  disposition_qualite: string | null;
  sous_derogation: boolean | null;
  motif_derogation: string | null;
  date_prise_echantillon: string | null;
  heure_prise_echantillon: string | null;
  heure_debut_analyse: string | null;
  heure_fin_analyse: string | null;
};

type SpecInfo = {
  ph_min: number | null;
  ph_max: number | null;
  viscosite_min: number | null;
  viscosite_max: number | null;
  densite_min: number | null;
  densite_max: number | null;
  degre_alcool_min: number | null;
  degre_alcool_max: number | null;
  taux_humidite_min: number | null;
  taux_humidite_max: number | null;
  pression_atmospherique_min: number | null;
  pression_atmospherique_max: number | null;
  texture: string | null;
  stabilite: string | null;
  couleur: string | null;
  temperature_min: number | null;
  temperature_max: number | null;
};

const inputClass =
  "rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none";
const inputClassNonConforme =
  "rounded-2xl border-2 border-red-400 bg-red-50 px-4 py-3 text-sm font-normal text-red-900 outline-none";

function parseNumber(value: string): number | null {
  const clean = value.trim().replace(",", ".");
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isNaN(parsed) ? null : parsed;
}

function NumericSpecField({
  label,
  name,
  defaultValue,
  specMin,
  specMax,
  onNonConformeChange,
}: {
  label: string;
  name: string;
  defaultValue: number | null | undefined;
  specMin: number | null | undefined;
  specMax: number | null | undefined;
  onNonConformeChange?: (nonConforme: boolean) => void;
}) {
  const [value, setValue] = useState(defaultValue !== null && defaultValue !== undefined ? String(defaultValue) : "");
  const parsed = parseNumber(value);
  const hasSpec = specMin !== null && specMin !== undefined && specMax !== null && specMax !== undefined;
  const nonConforme = hasSpec && parsed !== null && (parsed < specMin! || parsed > specMax!);

  useEffect(() => {
    onNonConformeChange?.(nonConforme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonConforme]);

  return (
    <label className="grid gap-1 text-xs font-semibold text-slate-500">
      {label}
      {hasSpec ? <span className="font-normal text-slate-400">Spec : {specMin} - {specMax}</span> : null}
      <input
        type="number"
        step="0.01"
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={nonConforme ? inputClassNonConforme : inputClass}
      />
      {nonConforme ? <span className="text-[11px] font-semibold text-red-600">Hors spec</span> : null}
    </label>
  );
}

export function TestLaboForm({
  ligneId,
  code,
  rapport,
  spec,
  mpArticles,
  depotBId,
}: {
  ligneId: number;
  code: string;
  rapport: RapportInfo | null;
  spec: SpecInfo | null;
  mpArticles: { id: number; label: string }[];
  depotBId: number | null;
}) {
  const [stabilite, setStabilite] = useState(rapport?.stabilite || "");
  const [couleur, setCouleur] = useState(rapport?.couleur || "");
  const [texture, setTexture] = useState(rapport?.texture || "");
  const [odeur, setOdeur] = useState(rapport?.odeur || "");
  // Decision manuelle (A recuperer / A detruire) - separee du statut
  // Conforme/Non conforme lui-meme, qui est desormais entierement
  // automatique (voir dispositionQualiteEffective plus bas). Une valeur
  // sauvegardee "non_conforme" (statut automatique, pas une decision) ne
  // compte pas comme un choix a re-precocher au chargement.
  const [dispositionChoice, setDispositionChoice] = useState(
    rapport?.disposition_qualite === "a_recuperer" || rapport?.disposition_qualite === "a_detruire"
      ? rapport.disposition_qualite
      : ""
  );
  const [numericHorsSpec, setNumericHorsSpec] = useState<Record<string, boolean>>({});
  const [sousDerogation, setSousDerogation] = useState(rapport?.sous_derogation ?? false);
  const [motifDerogation, setMotifDerogation] = useState(rapport?.motif_derogation || "");
  const [showAjustement, setShowAjustement] = useState(false);
  const [mpArticleId, setMpArticleId] = useState<number | null>(null);
  const [mpLots, setMpLots] = useState<{ numeroLot: string; solde: number }[]>([]);
  const [numeroLot, setNumeroLot] = useState("");
  const [isLoadingLots, startLoadingLots] = useTransition();

  function handleSelectMpArticle(articleId: number | null) {
    setMpArticleId(articleId);
    setNumeroLot("");
    setMpLots([]);
    if (!articleId || !depotBId) return;
    startLoadingLots(async () => {
      const lots = await fetchAvailableLotsAction("MP", articleId, depotBId);
      setMpLots(lots.map((lot) => ({ numeroLot: lot.numeroLot, solde: lot.solde })));
    });
  }

  const stabiliteNonConforme = Boolean(spec?.stabilite) && stabilite !== "" && stabilite !== spec?.stabilite;
  const couleurNonConforme =
    Boolean(spec?.couleur) &&
    couleur.trim() !== "" &&
    couleur.trim().toLowerCase() !== (spec?.couleur || "").trim().toLowerCase();
  const odeurNonConforme = odeur === "Non OK";
  const textureNonConforme =
    Boolean(spec?.texture) &&
    texture.trim() !== "" &&
    texture.trim().toLowerCase() !== (spec?.texture || "").trim().toLowerCase();
  const anyHorsSpec =
    stabiliteNonConforme ||
    couleurNonConforme ||
    odeurNonConforme ||
    textureNonConforme ||
    Object.values(numericHorsSpec).some(Boolean);

  // Conforme/Non conforme est desormais 100% automatique (plus un choix
  // dans un menu) : range bon partout -> Conforme, au moins 1 hors spec ->
  // Non conforme - jamais choisi a la main. La decision "A recuperer"/"A
  // detruire" reste manuelle (2 boutons), mais seulement pertinente/valide
  // quand Non conforme - un choix fait pendant un hors-spec redevient sans
  // effet des que le parametre revient dans la norme (le champ enregistre
  // repasse a "" = Conforme automatiquement).
  const dispositionQualiteToSubmit = anyHorsSpec ? dispositionChoice || "non_conforme" : "";

  return (
    <div className="grid gap-8">
      <form action={saveTestLaboAction} className="grid gap-6">
        <input type="hidden" name="ligne_id" value={ligneId} />
        <input type="hidden" name="code" value={code} />

        <div>
          <h2 className="mb-3 text-lg font-bold text-slate-900">Resultats du test</h2>
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
            <NumericSpecField
              label="pH"
              name="ph"
              defaultValue={rapport?.ph}
              specMin={spec?.ph_min}
              specMax={spec?.ph_max}
              onNonConformeChange={(v) => setNumericHorsSpec((prev) => ({ ...prev, ph: v }))}
            />
            <NumericSpecField
              label="Densite"
              name="densite"
              defaultValue={rapport?.densite}
              specMin={spec?.densite_min}
              specMax={spec?.densite_max}
              onNonConformeChange={(v) => setNumericHorsSpec((prev) => ({ ...prev, densite: v }))}
            />
            <NumericSpecField
              label="Viscosite"
              name="viscosite"
              defaultValue={rapport?.viscosite}
              specMin={spec?.viscosite_min}
              specMax={spec?.viscosite_max}
              onNonConformeChange={(v) => setNumericHorsSpec((prev) => ({ ...prev, viscosite: v }))}
            />
            <NumericSpecField
              label="Degre d'alcool"
              name="degre_alcool"
              defaultValue={rapport?.degre_alcool}
              specMin={spec?.degre_alcool_min}
              specMax={spec?.degre_alcool_max}
              onNonConformeChange={(v) => setNumericHorsSpec((prev) => ({ ...prev, degre_alcool: v }))}
            />
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Stabilite
              {spec?.stabilite ? <span className="font-normal text-slate-400">Spec : {spec.stabilite}</span> : null}
              <select
                name="stabilite"
                value={stabilite}
                onChange={(e) => setStabilite(e.target.value)}
                className={stabiliteNonConforme ? inputClassNonConforme : inputClass}
              >
                <option value="">-</option>
                <option value="Stable">Stable</option>
                <option value="Non stable">Non stable</option>
              </select>
              {stabiliteNonConforme ? <span className="text-[11px] font-semibold text-red-600">Hors spec</span> : null}
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Couleur
              {spec?.couleur ? <span className="font-normal text-slate-400">Spec : {spec.couleur}</span> : null}
              <input
                type="text"
                name="couleur"
                value={couleur}
                onChange={(e) => setCouleur(e.target.value)}
                className={couleurNonConforme ? inputClassNonConforme : inputClass}
              />
              {couleurNonConforme ? <span className="text-[11px] font-semibold text-red-600">Hors spec</span> : null}
            </label>
            <NumericSpecField
              label="Temperature de test"
              name="temperature_test"
              defaultValue={rapport?.temperature_test}
              specMin={spec?.temperature_min}
              specMax={spec?.temperature_max}
              onNonConformeChange={(v) => setNumericHorsSpec((prev) => ({ ...prev, temperature_test: v }))}
            />
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Odeur
              <select
                name="odeur"
                value={odeur}
                onChange={(e) => setOdeur(e.target.value)}
                className={odeurNonConforme ? inputClassNonConforme : inputClass}
              >
                <option value="">-</option>
                <option value="OK">OK</option>
                <option value="Non OK">Non OK</option>
              </select>
              {odeurNonConforme ? <span className="text-[11px] font-semibold text-red-600">Non conforme</span> : null}
            </label>
            <NumericSpecField
              label="Taux d'humidite"
              name="taux_humidite"
              defaultValue={rapport?.taux_humidite}
              specMin={spec?.taux_humidite_min}
              specMax={spec?.taux_humidite_max}
              onNonConformeChange={(v) => setNumericHorsSpec((prev) => ({ ...prev, taux_humidite: v }))}
            />
            <NumericSpecField
              label="Pression atmospherique"
              name="pression_atmospherique"
              defaultValue={rapport?.pression_atmospherique}
              specMin={spec?.pression_atmospherique_min}
              specMax={spec?.pression_atmospherique_max}
              onNonConformeChange={(v) => setNumericHorsSpec((prev) => ({ ...prev, pression_atmospherique: v }))}
            />
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Texture
              {spec?.texture ? <span className="font-normal text-slate-400">Spec : {spec.texture}</span> : null}
              <input
                type="text"
                name="texture"
                value={texture}
                onChange={(e) => setTexture(e.target.value)}
                className={textureNonConforme ? inputClassNonConforme : inputClass}
              />
              {textureNonConforme ? <span className="text-[11px] font-semibold text-red-600">Hors spec</span> : null}
            </label>
          </div>
        </div>

        <div>
          <h2 className="mb-1 text-lg font-bold text-slate-900">Prelevement et analyse</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Date prise echantillon
              <DateJmaFormField
                name="date_prise_echantillon"
                defaultValue={rapport?.date_prise_echantillon}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Heure prise echantillon
              <input
                type="time"
                lang="fr"
                name="heure_prise_echantillon"
                defaultValue={rapport?.heure_prise_echantillon || ""}
                className={inputClass}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Heure debut analyse
              <input
                type="time"
                lang="fr"
                name="heure_debut_analyse"
                defaultValue={rapport?.heure_debut_analyse || ""}
                className={inputClass}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Heure fin analyse
              <input
                type="time"
                lang="fr"
                name="heure_fin_analyse"
                defaultValue={rapport?.heure_fin_analyse || ""}
                className={inputClass}
              />
            </label>
          </div>
        </div>

        <div>
          <h2 className="mb-1 text-lg font-bold text-slate-900">Statut qualite</h2>
          <p className="mb-3 text-xs text-slate-500">
            Automatique : Conforme si tous les parametres sont dans la norme, Non conforme des qu&apos;un
            seul est hors spec. Si Non conforme, choisis quoi en faire. &quot;A recuperer&quot; credite
            quand meme le stock (avec un statut visible dessus). &quot;A detruire&quot; ne credite jamais
            le stock - la quantite part dans l&apos;historique de destruction.
          </p>
          <input type="hidden" name="disposition_qualite" value={dispositionQualiteToSubmit} />
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full px-4 py-2 text-sm font-bold ${
                anyHorsSpec ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {anyHorsSpec ? "Non conforme" : "Conforme"}
            </span>

            {anyHorsSpec ? (
              <>
                <button
                  type="button"
                  onClick={() => setDispositionChoice("a_recuperer")}
                  className={`rounded-full border-2 px-4 py-2 text-sm font-semibold transition ${
                    dispositionChoice === "a_recuperer"
                      ? "border-amber-400 bg-amber-100 text-amber-900"
                      : "border-slate-200 bg-white text-slate-600 hover:border-amber-300"
                  }`}
                >
                  A recuperer
                </button>
                <button
                  type="button"
                  onClick={() => setDispositionChoice("a_detruire")}
                  className={`rounded-full border-2 px-4 py-2 text-sm font-semibold transition ${
                    dispositionChoice === "a_detruire"
                      ? "border-red-400 bg-red-100 text-red-900"
                      : "border-slate-200 bg-white text-slate-600 hover:border-red-300"
                  }`}
                >
                  A detruire
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div>
          <h2 className="mb-1 text-lg font-bold text-slate-900">Remarque</h2>
          <textarea
            name="remarque"
            defaultValue={rapport?.remarque || ""}
            rows={3}
            className={`w-full ${inputClass}`}
          />
        </div>

        {anyHorsSpec ? (
          <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-4">
            <p className="text-sm font-bold text-red-800">
              Au moins un parametre est hors spec - impossible d&apos;enregistrer sans passer sous
              derogation.
            </p>
            <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-red-800">
              <input
                type="checkbox"
                name="sous_derogation"
                checked={sousDerogation}
                onChange={(e) => setSousDerogation(e.target.checked)}
              />
              Je valide sous derogation
            </label>
            {sousDerogation ? (
              <label className="mt-3 grid gap-1 text-xs font-semibold text-red-800">
                Motif de la derogation
                <textarea
                  name="motif_derogation"
                  value={motifDerogation}
                  onChange={(e) => setMotifDerogation(e.target.value)}
                  rows={2}
                  required
                  className="rounded-2xl border border-red-300 bg-white px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                />
              </label>
            ) : null}
          </div>
        ) : (
          <input type="hidden" name="sous_derogation" value="" />
        )}

        <div>
          <SubmitButton
            disabled={anyHorsSpec && !sousDerogation}
            pendingLabel="Enregistrement..."
            className="rounded-full bg-violet-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Enregistrer le test labo
          </SubmitButton>
          {anyHorsSpec && !sousDerogation ? (
            <p className="mt-2 text-xs font-semibold text-red-700">
              Coche &quot;Je valide sous derogation&quot; pour pouvoir enregistrer malgre le hors spec.
            </p>
          ) : null}
        </div>
      </form>

      <div className="border-t border-slate-100 pt-6">
        {!showAjustement ? (
          <button
            type="button"
            onClick={() => setShowAjustement(true)}
            className="rounded-full bg-amber-100 px-5 py-2.5 text-sm font-semibold text-amber-800 transition hover:bg-amber-200"
          >
            + Ajuster une matiere premiere (parametre non conforme)
          </button>
        ) : (
          <form action={ajouterAjustementMpTestLaboAction} className="grid gap-4">
            <input type="hidden" name="ligne_id" value={ligneId} />
            <input type="hidden" name="code" value={code} />
            <h2 className="text-lg font-bold text-slate-900">Ajustement matiere premiere</h2>
            <p className="text-xs text-slate-500">
              Enregistre une VRAIE sortie de stock (Depot B) pour la matiere premiere ajoutee afin de
              corriger le parametre non conforme.
            </p>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="md:col-span-2">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Matiere premiere</span>
                <ProduitPickerField
                  articles={mpArticles}
                  hiddenName="article_id"
                  textName="produit_mp"
                  onSelect={handleSelectMpArticle}
                />
              </div>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                N lot
                <select
                  name="numero_lot"
                  value={numeroLot}
                  onChange={(e) => setNumeroLot(e.target.value)}
                  required
                  disabled={!mpArticleId || isLoadingLots}
                  className={inputClass}
                >
                  <option value="">
                    {!mpArticleId
                      ? "Choisis d'abord un article"
                      : isLoadingLots
                        ? "Chargement..."
                        : mpLots.length === 0
                          ? "Aucun lot disponible"
                          : "-"}
                  </option>
                  {mpLots.map((lot) => (
                    <option key={lot.numeroLot} value={lot.numeroLot}>
                      {lot.numeroLot} - disponible {lot.solde.toLocaleString("fr-FR")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Quantite
                <input type="number" step="0.01" name="quantite" required className={inputClass} />
              </label>
            </div>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Note (optionnel)
              <input type="text" name="note" className={inputClass} />
            </label>
            <div className="flex items-center gap-3">
              <SubmitButton
                pendingLabel="Ajout..."
                className="rounded-full bg-amber-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-500"
              >
                Ajouter l&apos;ajustement
              </SubmitButton>
              <button
                type="button"
                onClick={() => setShowAjustement(false)}
                className="rounded-full bg-slate-100 px-6 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
              >
                Annuler
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
