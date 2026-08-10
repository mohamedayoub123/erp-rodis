"use client";

import { useState, useTransition } from "react";
import { saveTestLaboAction, ajouterAjustementMpTestLaboAction } from "../../../actions";
import { ProduitPickerField } from "../../../produit-picker-field";
import { fetchAvailableLotsAction } from "@/app/depots/transfer-order/actions";

type RapportInfo = {
  ph: number | null;
  densite: number | null;
  viscosite: number | null;
  degre_alcool: number | null;
  stabilite: string | null;
  couleur: string | null;
  remarque: string | null;
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
  stabilite: string | null;
  couleur: string | null;
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
}: {
  label: string;
  name: string;
  defaultValue: number | null | undefined;
  specMin: number | null | undefined;
  specMax: number | null | undefined;
}) {
  const [value, setValue] = useState(defaultValue !== null && defaultValue !== undefined ? String(defaultValue) : "");
  const parsed = parseNumber(value);
  const hasSpec = specMin !== null && specMin !== undefined && specMax !== null && specMax !== undefined;
  const nonConforme = hasSpec && parsed !== null && (parsed < specMin! || parsed > specMax!);

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
            />
            <NumericSpecField
              label="Densite"
              name="densite"
              defaultValue={rapport?.densite}
              specMin={spec?.densite_min}
              specMax={spec?.densite_max}
            />
            <NumericSpecField
              label="Viscosite"
              name="viscosite"
              defaultValue={rapport?.viscosite}
              specMin={spec?.viscosite_min}
              specMax={spec?.viscosite_max}
            />
            <NumericSpecField
              label="Degre d'alcool"
              name="degre_alcool"
              defaultValue={rapport?.degre_alcool}
              specMin={spec?.degre_alcool_min}
              specMax={spec?.degre_alcool_max}
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

        <div>
          <button
            type="submit"
            className="rounded-full bg-violet-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-600"
          >
            Enregistrer le test labo
          </button>
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
              <button
                type="submit"
                className="rounded-full bg-amber-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-500"
              >
                Ajouter l&apos;ajustement
              </button>
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
