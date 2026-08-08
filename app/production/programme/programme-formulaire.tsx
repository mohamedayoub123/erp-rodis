"use client";

import { useMemo, useState } from "react";
import { ProduitPickerField } from "@/app/production/suivi-production/produit-picker-field";

type ArticleOption = {
  id: number;
  label: string;
  vracArticleId: number | null;
  vracLabel: string | null;
  contenance: number | null;
  piecePartCarton: number | null;
};

type MachineOption = { id: number; label: string };

type CapaciteInfo = {
  capacite: number | null;
  capaciteMin: number | null;
  capaciteMax: number | null;
  tempsMinutes: number | null;
};

function round(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Calcul automatique de qt carton / qt vrac a partir de la capacite des
// machines choisies (table machine_produits) : la machine Conditionnement
// donne une capacite en piece/min pour l'article fini choisi, la machine
// Fabrication donne un lot min/max de vrac pour le vrac correspondant.
// Si ce que la ligne de conditionnement peut produire dans la duree
// prevue pese moins lourd (en vrac necessaire) que ce que la fabrication
// peut fournir, on limite le vrac a ce que le conditionnement peut
// vraiment consommer - sinon on part du lot de fabrication max.
export function ProgrammeFormulaire({
  articles,
  machinesFabrication,
  machinesConditionnement,
  machinesEmballage,
  capaciteParMachineArticle,
}: {
  articles: ArticleOption[];
  machinesFabrication: MachineOption[];
  machinesConditionnement: MachineOption[];
  machinesEmballage: MachineOption[];
  capaciteParMachineArticle: Record<string, CapaciteInfo>;
}) {
  const [articleId, setArticleId] = useState<number | null>(null);
  const [machineFabricationId, setMachineFabricationId] = useState<number | null>(null);
  const [machineConditionnementId, setMachineConditionnementId] = useState<number | null>(null);
  const [dureeMinutes, setDureeMinutes] = useState("");
  const [qtCarton, setQtCarton] = useState("");
  const [qtVrac, setQtVrac] = useState("");
  const [qtEmballage, setQtEmballage] = useState("");
  const [autoCalcule, setAutoCalcule] = useState(false);

  const articleSelectionne = useMemo(() => articles.find((article) => article.id === articleId) ?? null, [
    articleId,
    articles,
  ]);

  const capaciteFabrication = useMemo(() => {
    if (!machineFabricationId || !articleSelectionne?.vracArticleId) return null;
    return capaciteParMachineArticle[`${machineFabricationId}-${articleSelectionne.vracArticleId}`] ?? null;
  }, [machineFabricationId, articleSelectionne, capaciteParMachineArticle]);

  const capaciteConditionnement = useMemo(() => {
    if (!machineConditionnementId || !articleId) return null;
    return capaciteParMachineArticle[`${machineConditionnementId}-${articleId}`] ?? null;
  }, [machineConditionnementId, articleId, capaciteParMachineArticle]);

  function calculer() {
    const duree = Number(dureeMinutes);
    if (!articleSelectionne || !duree) return;

    const { contenance, piecePartCarton } = articleSelectionne;
    const vracParCarton = contenance && piecePartCarton ? contenance * piecePartCarton : null;

    // Ce que la ligne de Conditionnement peut produire en cartons pendant
    // la duree prevue (capacite en piece/min -> cartons via piece_par_carton).
    const cartonMaxConditionnement =
      capaciteConditionnement?.capacite && piecePartCarton
        ? (capaciteConditionnement.capacite * duree) / piecePartCarton
        : null;

    // Lot de vrac que la machine Fabrication peut fournir (on prend le max
    // du lot - capacite_max).
    const vracDisponibleFabrication = capaciteFabrication?.capaciteMax ?? null;

    let carton: number | null = cartonMaxConditionnement;
    let vrac: number | null = vracDisponibleFabrication;

    if (vracParCarton && cartonMaxConditionnement !== null && vracDisponibleFabrication !== null) {
      const vracNecessairePourConditionnement = cartonMaxConditionnement * vracParCarton;
      if (vracNecessairePourConditionnement < vracDisponibleFabrication) {
        // Le conditionnement est le facteur limitant : pas la peine de
        // fabriquer plus de vrac que ce qu'il peut consommer.
        vrac = round(vracNecessairePourConditionnement);
        carton = round(cartonMaxConditionnement);
      } else {
        // Le vrac disponible est le facteur limitant : le conditionnement
        // absorbe tout, qt carton se deduit du vrac disponible.
        vrac = round(vracDisponibleFabrication);
        carton = round(vracDisponibleFabrication / vracParCarton);
      }
    } else if (cartonMaxConditionnement !== null) {
      carton = round(cartonMaxConditionnement);
      vrac = vracParCarton ? round(cartonMaxConditionnement * vracParCarton) : vrac;
    } else if (vracDisponibleFabrication !== null && vracParCarton) {
      vrac = round(vracDisponibleFabrication);
      carton = round(vracDisponibleFabrication / vracParCarton);
    }

    setQtCarton(carton !== null ? String(carton) : "");
    setQtVrac(vrac !== null ? String(vrac) : "");
    setAutoCalcule(true);
  }

  return (
    <div className="grid gap-6">
      <input type="hidden" name="vrac_article_id" value={articleSelectionne?.vracArticleId ?? ""} />

      <div className="rounded-2xl border border-slate-200 p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Article
        </h2>
        <ProduitPickerField
          articles={articles}
          hiddenName="article_id"
          textName="produit"
          onSelect={setArticleId}
        />
        {articleSelectionne ? (
          <p className="mt-2 text-sm text-slate-600">
            Vrac utilise :{" "}
            <span className="font-semibold text-slate-900">
              {articleSelectionne.vracLabel || "non renseigne (voir Recette Conditionnement)"}
            </span>
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
            Machine Fabrication
          </h2>
          <select
            name="machine_fabrication_id"
            value={machineFabricationId ?? ""}
            onChange={(event) => setMachineFabricationId(Number(event.target.value) || null)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          >
            <option value="">Choisir...</option>
            {machinesFabrication.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {machine.label}
              </option>
            ))}
          </select>
          {capaciteFabrication ? (
            <p className="mt-2 text-xs text-slate-500">
              Lot vrac : {capaciteFabrication.capaciteMin ?? "-"} a {capaciteFabrication.capaciteMax ?? "-"}
              {capaciteFabrication.tempsMinutes ? ` (${capaciteFabrication.tempsMinutes} min)` : ""}
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
            Machine Conditionnement
          </h2>
          <select
            name="machine_conditionnement_id"
            value={machineConditionnementId ?? ""}
            onChange={(event) => setMachineConditionnementId(Number(event.target.value) || null)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          >
            <option value="">Choisir...</option>
            {machinesConditionnement.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {machine.label}
              </option>
            ))}
          </select>
          {capaciteConditionnement?.capacite ? (
            <p className="mt-2 text-xs text-slate-500">Capacite : {capaciteConditionnement.capacite} piece/min</p>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Duree prevue et quantites
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Duree prevue (minutes)
            <input
              type="number"
              step="1"
              min="0"
              name="duree_minutes"
              value={dureeMinutes}
              onChange={(event) => setDureeMinutes(event.target.value)}
              placeholder="Ex: 480 (8h)"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={calculer}
              className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Calculer qt carton / qt vrac
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Qt carton {autoCalcule ? "(calcule, modifiable)" : ""}
            <input
              type="number"
              step="0.001"
              min="0"
              name="qt_carton"
              value={qtCarton}
              onChange={(event) => setQtCarton(event.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Qt vrac (kg) {autoCalcule ? "(calcule, modifiable)" : ""}
            <input
              type="number"
              step="0.001"
              min="0"
              name="qt_vrac"
              value={qtVrac}
              onChange={(event) => setQtVrac(event.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
            />
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Emballage
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-500">Machine Emballage</p>
            <select
              name="machine_emballage_id"
              defaultValue=""
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            >
              <option value="">Choisir...</option>
              {machinesEmballage.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.label}
                </option>
              ))}
            </select>
          </div>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Qt emballage (saisie manuelle)
            <input
              type="number"
              step="0.001"
              min="0"
              name="qt_emballage"
              value={qtEmballage}
              onChange={(event) => setQtEmballage(event.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
