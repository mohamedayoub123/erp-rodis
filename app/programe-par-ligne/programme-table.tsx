"use client";

import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveProgrammeLigneBatchAction } from "./actions";
import type { MachineCapacite } from "@/lib/machine-capacite";
import {
  TOLERANCE_CARTON,
  capaciteBatch,
  computeMaxPossible,
  formatHeures,
  repartirJournee,
  type EntreeRepartition,
  type QuantitesLigne,
} from "@/lib/programme-auto-quantites";

const MOIS_OPTIONS = [
  { value: "01", label: "Janvier" },
  { value: "02", label: "Fevrier" },
  { value: "03", label: "Mars" },
  { value: "04", label: "Avril" },
  { value: "05", label: "Mai" },
  { value: "06", label: "Juin" },
  { value: "07", label: "Juillet" },
  { value: "08", label: "Aout" },
  { value: "09", label: "Septembre" },
  { value: "10", label: "Octobre" },
  { value: "11", label: "Novembre" },
  { value: "12", label: "Decembre" },
];

export type LigneRow = {
  zone: string;
  chaine: string;
  // Machine Conditionnement reelle derriere cette ligne (voir
  // fetchConditionnementZoneGroups, page.tsx) - toujours fixe une fois la
  // grille affichee, comme zone/chaine.
  machineId: number;
  typeProduit: string[];
};

// Machine de Fabrication proposee dans le nouveau picker par ligne -
// "categorie" vient de machines.zone (Automatique/Manuel/Semi auto pour les
// machines Fabrication, PAS une vraie zone - voir page.tsx).
export type FabricationMachineOption = {
  id: number;
  nom: string;
  categorie: string | null;
  typeProduit: string[];
};

export type PrefillLigne = {
  zone: string;
  chaine: string;
  article_id: number | null;
  produit: string | null;
  type_article: string | null;
  qt_carton: number | null;
  vrac_a_fabriquer: number | null;
  plateforme: string | null;
  programe: string | null;
  machine_fabrication_id?: number | null;
  remarque?: string | null;
};

export type ArticleOption = {
  id: number;
  label: string;
  type: string;
  contenance: number | null;
  piecePerCarton: number | null;
  maxVracAuto: number | null;
  vracMaxManuel: number | null;
  // Article vrac (matiere en cuve) derriere ce produit fini - la capacite
  // Fabrication (machine_produits) est enregistree sur CET article-la, pas
  // sur l'article fini (voir MachineCapacite plus bas).
  vracArticleId: number | null;
};

// MachineCapacite/HEURES_PAR_JOUR/findCapaciteFabrication : voir
// lib/machine-capacite.ts (partage avec le Dispatch, app/programe-par-ligne/actions.ts,
// pour que les 2 utilisent exactement le meme calcul).
export type { MachineCapacite } from "@/lib/machine-capacite";

// "Max possible" (le plus limitant des 2 machines) : calcul dans
// lib/programme-auto-quantites.ts (computeMaxPossible), partage avec le remplissage
// automatique de Qt carton / Vrac a fabriquer plus bas.
function MaxPossibleCell({
  article,
  machineConditionnementId,
  machineFabricationId,
  capacites,
}: {
  article: ArticleOption | null;
  machineConditionnementId: number | null;
  machineFabricationId: number | null;
  capacites: Map<string, MachineCapacite>;
}) {
  const result = computeMaxPossible(article, machineConditionnementId, machineFabricationId, capacites);

  if (!result) {
    return <td className="px-4 py-3 text-xs text-slate-400">-</td>;
  }

  const label =
    result.limitant === "les deux"
      ? "Conditionnement + Fabrication"
      : result.limitant === "conditionnement"
        ? "Conditionnement"
        : "Fabrication";

  return (
    <td className="px-4 py-3 text-xs">
      <p className="font-semibold text-slate-800">
        {Math.round(result.maxKg).toLocaleString("fr-FR")} kg
        {result.maxCarton !== null ? ` - ${result.maxCarton.toLocaleString("fr-FR")} carton(s)` : ""}
      </p>
      <p className="text-slate-400">limite par {label}</p>
    </td>
  );
}

type RowState = {
  zone: string;
  chaine: string;
  machineId: number;
  articleId: number | null;
  produit: string;
  typeArticle: string;
  qtCarton: number | null;
  vracAFabriquer: number | null;
  plateforme: string;
  programe: string;
  machineFabricationId: number | null;
};

// Ce qui decide des quantites d'une ligne (porte par le tableau, reactif) : les articles d'une meme chaine se
// partagent ses 8 h, donc la quantite d'une ligne depend des autres lignes de la chaine.
type EtatLigne = {
  machineId: number;
  articleId: number | null;
  // Texte du champ Vrac saisi ; ne compte que si vracManuel
  vracInput: string;
  vracManuel: boolean;
  machineFabricationId: number | null;
};

function ProduitCell({
  articles,
  initialLabel,
  onSelect,
}: {
  articles: ArticleOption[];
  initialLabel?: string;
  onSelect: (article: ArticleOption | null) => void;
}) {
  const [value, setValue] = useState(initialLabel || "");
  const [showDropdown, setShowDropdown] = useState(false);

  const filtered = useMemo(() => {
    const words = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return articles.slice(0, 50);

    return articles.filter((article) => {
      const label = article.label.toLowerCase();
      return words.every((word) => label.includes(word));
    });
  }, [value, articles]);

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setShowDropdown(true);
          onSelect(null);
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        placeholder="Ecris puis choisis..."
        autoComplete="off"
        className="w-full min-w-[14rem] rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
      />
      {showDropdown && filtered.length > 0 ? (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-full min-w-[18rem] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
          {filtered.map((article) => (
            <button
              key={article.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setValue(article.label);
                onSelect(article);
                setShowDropdown(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100"
            >
              {article.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PlateformeCell({
  initialValue,
  onChange,
}: {
  initialValue?: "M" | "A" | null;
  onChange: (value: string) => void;
}) {
  const [selected, setSelected] = useState<"M" | "A" | null>(initialValue ?? null);

  return (
    <div className="flex gap-2">
      {(["M", "A"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => {
            const next = selected === option ? null : option;
            setSelected(next);
            onChange(next || "");
          }}
          className={`h-9 w-9 rounded-xl border text-sm font-bold transition ${
            selected === option
              ? "border-sky-600 bg-sky-600 text-white"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

// Categorie machine Fabrication (Automatique/Manuel/Semi auto, voir
// machines.zone) -> valeur Plateforme (M/A) deduite automatiquement des
// qu'une machine Fabrication est choisie. "Semi auto" compte comme "M"
// (Manuel) - demande explicite : avant, elle ne forcait rien et finissait
// par tomber sur "A" par defaut, ce qui n'est pas le comportement voulu.
function plateformeFromCategorie(categorie: string | null): "M" | "A" | null {
  const value = (categorie || "").trim().toLowerCase();
  if (value === "automatique") return "A";
  if (value === "manuel" || value === "semi auto") return "M";
  return null;
}

// Categorie machine Fabrication -> Plateforme (M/A) deduit + le `<select>`
// lui-meme. Le remount de PlateformeCell (voir plus bas, "key" liee a la
// machine choisie) applique la valeur deduite une seule fois au changement
// de machine, sans reimposer la meme valeur a chaque re-render - reste
// re-togglable a la main ensuite.
function MachineFabricationSelect({
  fabricationMachines,
  typeArticle,
  value,
  onChange,
}: {
  fabricationMachines: FabricationMachineOption[];
  typeArticle: string;
  value: number | null;
  onChange: (machineId: number | null, categorie: string | null) => void;
}) {
  // Sans article choisi : toutes les machines. Avec un type choisi : SEULES
  // les machines compatibles apparaissent (jamais juste desactivees) -
  // demande explicite ("il faut m'interdire de produire autre chose").
  const options = typeArticle
    ? fabricationMachines.filter((m) => m.typeProduit.includes(typeArticle))
    : fabricationMachines;

  return (
    <select
      value={value ?? ""}
      onChange={(event) => {
        const nextId = event.target.value ? Number(event.target.value) : null;
        const nextMachine = fabricationMachines.find((m) => m.id === nextId) ?? null;
        onChange(nextId, nextMachine?.categorie ?? null);
      }}
      className="w-40 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
    >
      <option value="">Choisir...</option>
      {options.map((machine) => (
        <option key={machine.id} value={machine.id}>
          {machine.nom}
        </option>
      ))}
    </select>
  );
}

// Machine Fabrication + Plateforme dans 2 colonnes separees (comme demande)
// mais un seul etat reactif partage : choisir une machine deduit Plateforme
// automatiquement (remount de PlateformeCell via sa key), tout en restant
// re-togglable a la main ensuite.
function MachineFabricationAndPlateformeCells({
  fabricationMachines,
  typeArticle,
  initialMachineFabricationId,
  initialPlateforme,
  onUpdate,
}: {
  fabricationMachines: FabricationMachineOption[];
  typeArticle: string;
  initialMachineFabricationId?: number | null;
  initialPlateforme?: string | null;
  onUpdate: (partial: { machineFabricationId?: number | null; plateforme?: string }) => void;
}) {
  const [machineFabricationId, setMachineFabricationId] = useState<number | null>(
    initialMachineFabricationId ?? null
  );
  const [categorie, setCategorie] = useState<string | null>(null);

  return (
    <>
      <td className="px-4 py-3">
        <MachineFabricationSelect
          fabricationMachines={fabricationMachines}
          typeArticle={typeArticle}
          value={machineFabricationId}
          onChange={(nextId, nextCategorie) => {
            setMachineFabricationId(nextId);
            setCategorie(nextCategorie);
            const deduced = plateformeFromCategorie(nextCategorie);
            onUpdate({
              machineFabricationId: nextId,
              ...(deduced ? { plateforme: deduced } : {}),
            });
          }}
        />
      </td>
      <td className="px-4 py-3">
        <PlateformeCell
          key={machineFabricationId ?? "none"}
          initialValue={(plateformeFromCategorie(categorie) ?? initialPlateforme ?? null) as "M" | "A" | null}
          onChange={(value) => onUpdate({ plateforme: value })}
        />
      </td>
    </>
  );
}

// Machine Conditionnement modifiable par ligne - liste limitee aux machines
// de la MEME zone (demande explicite : "si le zone est b1z1... je choisis
// les chaines de cette zone seulement"). La zone elle-meme reste fixe, seule
// la machine a l'interieur peut changer.
function MachineConditionnementSelect({
  options,
  value,
  onChange,
}: {
  options: LigneRow[];
  value: number;
  onChange: (machine: LigneRow) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => {
        const nextId = Number(event.target.value);
        const nextMachine = options.find((m) => m.machineId === nextId);
        if (nextMachine) onChange(nextMachine);
      }}
      className="w-40 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
    >
      {options.map((m) => (
        <option key={m.machineId} value={m.machineId}>
          {m.chaine}
        </option>
      ))}
    </select>
  );
}

// Champ libre, independant du code MB1/MB2/MB3 auto-genere au Save - ce
// que l'utilisateur ecrit ici est sauvegarde tel quel, jamais remplace.
function ProgrameCell({
  initialValue,
  onChange,
}: {
  initialValue?: string;
  onChange: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue || "");

  return (
    <input
      type="text"
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
        onChange(event.target.value);
      }}
      placeholder="Ecris ici..."
      className="w-32 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
    />
  );
}

// Qt carton = (vrac a fabriquer / contenance de l'article) / piece par
// carton de l'article, toujours arrondi au carton SUPERIEUR : calcul dans
// lib/programme-auto-quantites.ts (computeQtCarton). Ex: Lait White Secret
// 500ml (contenance 0.5), piece par carton 24, vrac saisi 3000 ->
// 3000/0.5 = 6000 pieces -> 6000/24 = 250 cartons.
//
// Produit et Vrac sont pilotes par le tableau (etat remonte, voir
// ProgrammeLigneTable) : Qt carton et Vrac viennent de repartirJournee
// (lib/programme-auto-quantites.ts) - les articles d'une meme chaine se
// partagent ses 8 h, et un vrac saisi a la main reste prioritaire.
function LigneRowCells({
  articles,
  machineTypeProduit,
  selectedArticle,
  quantites,
  batchs,
  onSelectArticle,
  onVracChange,
}: {
  articles: ArticleOption[];
  // Types acceptes par la machine Conditionnement de cette ligne - liste
  // vide = machine pas encore configuree, aucune restriction (evite de
  // bloquer une ligne existante juste parce que personne n'a encore rempli
  // type_produit sur cette machine).
  machineTypeProduit: string[];
  selectedArticle: ArticleOption | null;
  quantites: QuantitesLigne;
  // Nombre de batchs du vrac sur la machine Fabrication choisie (Max = taille d'un batch)
  batchs: { nombre: number; max: number } | null;
  onSelectArticle: (article: ArticleOption | null) => void;
  onVracChange: (next: string) => void;
}) {
  const { qtCarton, vracInput, minutes } = quantites;

  // Interdit de choisir un article que cette machine ne sait pas produire -
  // filtre la liste elle-meme (jamais juste desactivee/avertie).
  const compatibleArticles =
    machineTypeProduit.length > 0
      ? articles.filter((article) => machineTypeProduit.includes(article.type))
      : articles;

  return (
    <>
      <td className="px-4 py-3 text-slate-700">{selectedArticle?.type || "-"}</td>
      <td className="px-4 py-3">
        <ProduitCell articles={compatibleArticles} initialLabel={selectedArticle?.label} onSelect={onSelectArticle} />
      </td>
      <td className="px-4 py-3 text-slate-700">
        {qtCarton !== null ? Math.round(qtCarton).toLocaleString("fr-FR") : "-"}
      </td>
      <td className="px-4 py-3">
        <input
          type="text"
          inputMode="decimal"
          value={vracInput}
          onChange={(event) => onVracChange(event.target.value)}
          placeholder="Ex: 3000"
          title="Rempli automatiquement avec ce que la chaine peut produire en 8 h (les articles d'une meme chaine se partagent les 8 h). Tu peux le changer : la Qt carton suit et les autres articles de la chaine se recalculent."
          className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
        />
        {minutes != null ? <p className="mt-1 text-[11px] text-slate-500">{formatHeures(minutes)} de chaine</p> : null}
        {batchs ? (
          <p className="text-[11px] text-slate-500">
            {batchs.nombre} batch{batchs.nombre > 1 ? "s" : ""} de {batchs.max.toLocaleString("fr-FR")} kg max
          </p>
        ) : null}
      </td>
    </>
  );
}

function ProgrammeRow({
  zoneLabel,
  zoneMachineOptions,
  defaultMachine,
  canChangerMachine,
  articles,
  fabricationMachines,
  machineCapacites,
  etat,
  quantites,
  prefillTypeArticle,
  prefillMachineFabricationId,
  prefillPlateforme,
  prefillProgramme,
  isLast,
  subRowCount,
  onAddSubRow,
  onRemoveSubRow,
  onEtat,
  onUpdate,
}: {
  zoneLabel: string;
  zoneMachineOptions: LigneRow[];
  defaultMachine: LigneRow;
  // "Changer Machine Conditionnement" (permission admin) - sans elle, la
  // machine reste affichee en texte fixe, comme avant (comportement par
  // defaut demande : "si je ecrit une fois il faut qu'il reste toujours la
  // meme").
  canChangerMachine: boolean;
  articles: ArticleOption[];
  fabricationMachines: FabricationMachineOption[];
  machineCapacites: Map<string, MachineCapacite>;
  // Etat des quantites de cette ligne (produit, vrac saisi, machine Fabrication) et leur resultat : portes par
  // le tableau, car les articles d'une meme chaine se partagent ses 8 h (voir repartirJournee)
  etat: EtatLigne;
  quantites: QuantitesLigne;
  prefillTypeArticle?: string | null;
  prefillMachineFabricationId?: number | null;
  prefillPlateforme?: string | null;
  prefillProgramme?: string | null;
  isLast: boolean;
  subRowCount: number;
  onAddSubRow: () => void;
  onRemoveSubRow: () => void;
  onEtat: (partial: Partial<EtatLigne>) => void;
  onUpdate: (partial: Partial<RowState>) => void;
}) {
  // Reactif (pas seulement dans rowsRef, qui ne redeclenche pas de rendu) -
  // le picker Machine Fabrication doit se filtrer en direct des que le
  // Produit change sur cette meme ligne.
  const [typeArticle, setTypeArticle] = useState(prefillTypeArticle || "");
  // Machine Conditionnement modifiable (demande explicite) - part du
  // positionnement par defaut de la grille, reste changeable ensuite parmi
  // les machines de la meme zone.
  const [machine, setMachine] = useState<LigneRow>(defaultMachine);
  // Incremente a chaque changement de machine (jamais au 1er rendu) pour
  // forcer un remontage "propre" de LigneRowCells qui vide le Produit/Vrac
  // choisis avant (potentiellement incompatibles avec la nouvelle machine) -
  // le prefill historique ne doit s'appliquer qu'une seule fois, au tout
  // premier rendu.
  const [resetToken, setResetToken] = useState(0);
  // Produit, vrac saisi et machine Fabrication de cette ligne viennent du tableau (etat remonte) : ce sont
  // eux qui servent a partager les 8 h de la chaine entre ses articles (repartirJournee).
  const articleChoisi = etat.articleId != null ? articles.find((a) => a.id === etat.articleId) ?? null : null;
  const maxBatch = capaciteBatch(articleChoisi, etat.machineFabricationId, machineCapacites);
  const batchs =
    maxBatch && quantites.vrac && quantites.vrac > 0
      ? { nombre: Math.ceil(quantites.vrac / maxBatch - TOLERANCE_CARTON), max: maxBatch }
      : null;

  function handleSelectArticle(article: ArticleOption | null) {
    // Qt carton et Vrac sont recalcules par le tableau (capacite de la chaine partagee entre ses articles)
    onEtat({ articleId: article?.id ?? null });
    handleUpdate({
      articleId: article?.id ?? null,
      produit: article?.label ?? "",
      typeArticle: article?.type ?? "",
    });
  }

  // Ecrire le vrac a la main le rend prioritaire (jamais remplace par le calcul) ; le vider rend la main
  // au calcul automatique.
  function handleVracChange(next: string) {
    onEtat({ vracInput: next, vracManuel: next.trim() !== "" });
  }

  function handleUpdate(partial: Partial<RowState>) {
    if (partial.typeArticle !== undefined) setTypeArticle(partial.typeArticle);
    // La machine Fabrication peut arrondir le vrac en batchs entiers
    if (partial.machineFabricationId !== undefined) onEtat({ machineFabricationId: partial.machineFabricationId });
    onUpdate(partial);
  }

  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-4 py-3 font-medium text-slate-900">{zoneLabel}</td>
      <td className="px-4 py-3">
        {canChangerMachine ? (
          <MachineConditionnementSelect
            options={zoneMachineOptions}
            value={machine.machineId}
            onChange={(nextMachine) => {
              setMachine(nextMachine);
              setResetToken((token) => token + 1);
              onEtat({ machineId: nextMachine.machineId, articleId: null, vracInput: "", vracManuel: false });
              handleUpdate({
                machineId: nextMachine.machineId,
                chaine: nextMachine.chaine,
                articleId: null,
                produit: "",
                typeArticle: "",
                vracAFabriquer: null,
                qtCarton: null,
              });
            }}
          />
        ) : (
          <span className="font-medium text-slate-900">{machine.chaine}</span>
        )}
      </td>
      <td className="px-4 py-3 text-slate-700">{machine.typeProduit.join(", ") || "-"}</td>
      <LigneRowCells
        key={resetToken}
        articles={articles}
        machineTypeProduit={machine.typeProduit}
        selectedArticle={articleChoisi}
        quantites={quantites}
        batchs={batchs}
        onSelectArticle={handleSelectArticle}
        onVracChange={handleVracChange}
      />
      <MachineFabricationAndPlateformeCells
        fabricationMachines={fabricationMachines}
        typeArticle={typeArticle}
        initialMachineFabricationId={prefillMachineFabricationId}
        initialPlateforme={prefillPlateforme}
        onUpdate={handleUpdate}
      />
      <MaxPossibleCell
        article={articleChoisi}
        machineConditionnementId={machine.machineId}
        machineFabricationId={etat.machineFabricationId}
        capacites={machineCapacites}
      />
      <td className="px-4 py-3">
        <ProgrameCell
          initialValue={prefillProgramme || undefined}
          onChange={(value) => onUpdate({ programe: value })}
        />
      </td>
      <td className="px-4 py-3">
        {isLast ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onAddSubRow}
              title="Ajouter un article sur cette chaine"
              className="h-9 w-9 rounded-xl border border-slate-200 bg-white text-lg font-bold text-slate-600 hover:border-slate-400"
            >
              +
            </button>
            {subRowCount > 1 ? (
              <button
                type="button"
                onClick={onRemoveSubRow}
                className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
              >
                Annuler
              </button>
            ) : null}
          </div>
        ) : null}
      </td>
    </tr>
  );
}

export function ProgrammeLigneTable({
  zoneGroups,
  articles,
  fabricationMachines,
  prefillLignes = [],
  prefillRemarque = "",
  canChangerMachine,
  machineCapacites,
}: {
  zoneGroups: LigneRow[][];
  articles: ArticleOption[];
  fabricationMachines: FabricationMachineOption[];
  prefillLignes?: PrefillLigne[];
  prefillRemarque?: string;
  canChangerMachine: boolean;
  machineCapacites: MachineCapacite[];
}) {
  const router = useRouter();
  const capacitesByMachineArticle = useMemo(() => {
    const map = new Map<string, MachineCapacite>();
    for (const capacite of machineCapacites) {
      map.set(`${capacite.machineId}::${capacite.articleId}`, capacite);
    }
    return map;
  }, [machineCapacites]);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  // Articles non dispatches faute de capacite Fabrication configuree sur
  // leur machine (voir actions.ts, assignDispatcherCodesAndInsert) - le
  // Dispatch des autres lignes reussit quand meme, seuls ceux-la sont
  // signales plutot que de tout bloquer.
  const [dispatchWarnings, setDispatchWarnings] = useState<string[]>([]);
  // Pas de valeur par defaut (surtout pas la date du jour) - l'utilisateur
  // doit toujours choisir explicitement pour quel jour est ce programme.
  // Jour/Mois/Annee saisis separement (mois nomme dans une liste) pour
  // eviter toute confusion JJ/MM vs MM/JJ avec un champ date natif dont
  // l'ordre affiche depend de la langue du navigateur.
  const [jourDate, setJourDate] = useState("");
  const [moisDate, setMoisDate] = useState("");
  const [anneeDate, setAnneeDate] = useState("");
  const [remarque, setRemarque] = useState(prefillRemarque);
  const dateJour =
    jourDate && moisDate && anneeDate
      ? `${anneeDate.padStart(4, "0")}-${moisDate.padStart(2, "0")}-${jourDate.padStart(2, "0")}`
      : "";
  // Change de valeur apres un Save reussi pour forcer le remontage de
  // toutes les lignes (vide tous les champs, comme si on rechargeait la
  // page) - la table est prete pour un nouveau programme.
  const [resetKey, setResetKey] = useState(0);

  // Associe chaque ligne prefilie (venant d'un programme de l'historique) a
  // sa position dans la grille actuelle (zone+chaine), dans l'ordre - permet
  // a plusieurs articles historiques sur la meme chaine de se repartir sur
  // plusieurs sous-lignes (comme le bouton "+"). Une zone/chaine qui n'existe
  // plus dans ZONE_GROUPS est simplement ignoree (pas de crash).
  const prefillByKey = useMemo(() => {
    const map = new Map<string, PrefillLigne>();
    const countByGroupKey: Record<string, number> = {};

    if (prefillLignes.length === 0) return { map, countByGroupKey };

    const positionByZoneChaine = new Map<string, { groupIndex: number; rowIndex: number }>();
    zoneGroups.forEach((group, groupIndex) => {
      group.forEach((row, rowIndex) => {
        positionByZoneChaine.set(`${row.zone}::${row.chaine}`, { groupIndex, rowIndex });
      });
    });

    for (const ligne of prefillLignes) {
      const position = positionByZoneChaine.get(`${ligne.zone}::${ligne.chaine}`);
      if (!position) continue;

      const groupKey = `${position.groupIndex}-${position.rowIndex}`;
      const subIndex = countByGroupKey[groupKey] ?? 0;
      countByGroupKey[groupKey] = subIndex + 1;
      map.set(`${groupKey}-${subIndex}`, ligne);
    }

    return { map, countByGroupKey };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rowsRef = useRef<Record<string, RowState>>({});
  // Nb de lignes affichees pour une meme chaine (1 par defaut, ou plus si un
  // programme prefilie a plusieurs articles sur la meme chaine) - le bouton
  // "+" permet d'ajouter un 2eme (ou 3eme...) article sur la meme chaine,
  // "Annuler" retire la derniere ligne ajoutee.
  const [subRowCounts, setSubRowCounts] = useState<Record<string, number>>(
    () => prefillByKey.countByGroupKey
  );

  function getSubRowCount(groupKey: string) {
    return subRowCounts[groupKey] ?? 1;
  }

  function ensureRow(key: string, row: LigneRow) {
    if (!rowsRef.current[key]) {
      const prefill = prefillByKey.map.get(key);
      rowsRef.current[key] = prefill
        ? {
            zone: row.zone,
            chaine: row.chaine,
            machineId: row.machineId,
            articleId: prefill.article_id,
            produit: prefill.produit || "",
            typeArticle: prefill.type_article || "",
            qtCarton: prefill.qt_carton,
            vracAFabriquer: prefill.vrac_a_fabriquer,
            plateforme: prefill.plateforme || "",
            programe: prefill.programe || "",
            machineFabricationId: prefill.machine_fabrication_id ?? null,
          }
        : {
            zone: row.zone,
            chaine: row.chaine,
            machineId: row.machineId,
            articleId: null,
            produit: "",
            typeArticle: "",
            qtCarton: null,
            vracAFabriquer: null,
            plateforme: "",
            programe: "",
            machineFabricationId: null,
          };
    }
  }

  function updateRow(key: string, partial: Partial<RowState>) {
    rowsRef.current[key] = { ...rowsRef.current[key], ...partial };
  }

  // Etat des quantites par ligne. Une ligne qui n'a pas encore ete touchee part du programme de
  // l'historique charge (le vrac d'un programme enregistre compte comme saisi a la main) ou de la grille vide.
  const [etats, setEtats] = useState<Record<string, EtatLigne>>({});

  function etatInitial(key: string, row: LigneRow): EtatLigne {
    const prefill = prefillByKey.map.get(key);
    const vracPrefill = prefill?.vrac_a_fabriquer != null ? String(prefill.vrac_a_fabriquer) : "";
    return {
      machineId: row.machineId,
      articleId: prefill?.article_id ?? null,
      vracInput: vracPrefill,
      vracManuel: vracPrefill !== "",
      machineFabricationId: prefill?.machine_fabrication_id ?? null,
    };
  }

  function changerEtat(key: string, row: LigneRow, partial: Partial<EtatLigne>) {
    setEtats((current) => ({ ...current, [key]: { ...(current[key] ?? etatInitial(key, row)), ...partial } }));
  }

  // Quantites de TOUTES les lignes affichees, calculees ensemble : les articles d'une meme chaine se
  // partagent ses 8 h (voir repartirJournee, lib/programme-auto-quantites.ts)
  const articleParId = useMemo(() => new Map(articles.map((article) => [article.id, article])), [articles]);
  const entreesRepartition: EntreeRepartition[] = [];
  zoneGroups.forEach((group, groupIndex) => {
    group.forEach((row, rowIndex) => {
      const groupKey = `${groupIndex}-${rowIndex}`;
      for (let subIndex = 0; subIndex < getSubRowCount(groupKey); subIndex++) {
        const key = `${groupKey}-${subIndex}`;
        const etat = etats[key] ?? etatInitial(key, row);
        entreesRepartition.push({
          key,
          machineConditionnementId: etat.machineId,
          article: etat.articleId != null ? articleParId.get(etat.articleId) ?? null : null,
          vracInput: etat.vracInput,
          vracManuel: etat.vracManuel,
          machineFabricationId: etat.machineFabricationId,
        });
      }
    });
  });
  const quantitesParLigne = repartirJournee(entreesRepartition, capacitesByMachineArticle);

  function addSubRow(groupKey: string) {
    setSubRowCounts((current) => ({ ...current, [groupKey]: getSubRowCount(groupKey) + 1 }));
  }

  function removeSubRow(groupKey: string, rowKey: string) {
    delete rowsRef.current[rowKey];
    setEtats((current) => {
      const suite = { ...current };
      delete suite[rowKey];
      return suite;
    });
    setSubRowCounts((current) => ({
      ...current,
      [groupKey]: Math.max(1, getSubRowCount(groupKey) - 1),
    }));
  }

  // "Dispatch" fait tout comme avant (Historique + Programme Dispatcher/
  // Ravitailleur). "Save" enregistre seulement dans l'Historique, sans
  // toucher au Dispatcher - pour poser un programme sans encore l'engager
  // en fabrication.
  function handleSave(withDispatch: boolean) {
    setMessage("");
    setErrorMessage("");
    setDispatchWarnings([]);

    if (!dateJour) {
      setErrorMessage("Choisis la date du programme avant d'enregistrer.");
      return;
    }

    // Qt carton et vrac enregistres = ceux affiches (repartirJournee), pas une copie ancienne : les articles
    // d'une meme chaine se partagent ses 8 h, donc une ligne peut changer quand une autre change.
    const payload = Object.entries(rowsRef.current).map(([key, row]) => {
      const quantites = quantitesParLigne.get(key);
      return {
        zone: row.zone,
        chaine: row.chaine,
        machine_id: row.machineId,
        article_id: row.articleId,
        produit: row.produit,
        type_article: row.typeArticle,
        qt_carton: quantites ? quantites.qtCarton : row.qtCarton,
        vrac_a_fabriquer: quantites ? quantites.vrac : row.vracAFabriquer,
        plateforme: row.plateforme,
        programe: row.programe,
        machine_fabrication_id: row.machineFabricationId,
      };
    });

    const formData = new FormData();
    formData.set("payload", JSON.stringify(payload));
    formData.set("date_jour", dateJour);
    formData.set("remarque", remarque);
    formData.set("with_dispatch", withDispatch ? "1" : "0");

    startTransition(async () => {
      try {
        const result = await saveProgrammeLigneBatchAction(formData);

        if (!result.ok) {
          setErrorMessage(result.message);
          return;
        }

        setMessage(`Enregistre sous le code ${result.code}.`);
        setDispatchWarnings(result.warnings);
        rowsRef.current = {};
        setEtats({});
        setSubRowCounts({});
        setResetKey((current) => current + 1);
        // Dispatch redirige vers Ravitailleur, la ou le programme vient d'etre
        // reparti en lots ; Save redirige directement sur le programme (PL) qui
        // vient d'etre cree (Historique programme). La grille est reinitialisee
        // pour quand on revient. La redirection quitte la page avant que le
        // bandeau d'avertissement soit visible - une alerte le montre donc en
        // plus, juste avant de partir.
        if (withDispatch) {
          if (result.warnings.length > 0) {
            window.alert(result.warnings.join("\n"));
          }
          router.push("/ravitailleur-par-ligne");
        } else {
          router.push(`/historique-programme/${result.groupe_id}`);
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Erreur pendant l'enregistrement.");
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-4">
        <p className="w-full text-xs font-semibold text-slate-500">Ce programme est pour quel jour ?</p>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Jour
          <input
            type="number"
            min="1"
            max="31"
            placeholder="JJ"
            value={jourDate}
            onChange={(event) => setJourDate(event.target.value)}
            required
            className="w-20 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Mois
          <select
            value={moisDate}
            onChange={(event) => setMoisDate(event.target.value)}
            required
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
          >
            <option value="">-</option>
            {MOIS_OPTIONS.map((mois) => (
              <option key={mois.value} value={mois.value}>
                {mois.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Annee
          <input
            type="number"
            min="2020"
            max="2100"
            placeholder="AAAA"
            value={anneeDate}
            onChange={(event) => setAnneeDate(event.target.value)}
            required
            className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
          />
        </label>
        {dateJour ? (
          <p className="text-xs font-semibold text-emerald-700">
            Date choisie : {jourDate.padStart(2, "0")}{" "}
            {MOIS_OPTIONS.find((mois) => mois.value === moisDate)?.label} {anneeDate}
          </p>
        ) : null}
        <label className="grid min-w-[16rem] flex-1 gap-1 text-xs font-semibold text-slate-500">
          Remarque
          <input
            type="text"
            value={remarque}
            onChange={(event) => setRemarque(event.target.value)}
            placeholder="Ecris ici..."
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => handleSave(false)}
          disabled={isPending}
          className="rounded-full border border-slate-200 px-6 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-60"
        >
          {isPending ? "Enregistrement..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => handleSave(true)}
          disabled={isPending}
          className="rounded-full bg-sky-700 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:opacity-60"
        >
          {isPending ? "Enregistrement..." : "Dispatch"}
        </button>
        {errorMessage ? <p className="w-full text-sm font-semibold text-red-700">{errorMessage}</p> : null}
        {message ? <p className="w-full text-sm font-semibold text-emerald-700">{message}</p> : null}
        {dispatchWarnings.length > 0 ? (
          <ul className="w-full space-y-1 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
            {dispatchWarnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-4 py-3 font-semibold">Zone</th>
            <th className="px-4 py-3 font-semibold">Machine Conditionnement</th>
            <th className="px-4 py-3 font-semibold">Type machine conditionnement</th>
            <th className="px-4 py-3 font-semibold">Type produit</th>
            <th className="px-4 py-3 font-semibold">Produit</th>
            <th className="px-4 py-3 font-semibold">Qt carton</th>
            <th className="px-4 py-3 font-semibold">Vrac a fabriquer</th>
            <th className="px-4 py-3 font-semibold">Machine Fabrication</th>
            <th className="px-4 py-3 font-semibold">Plateforme</th>
            <th className="px-4 py-3 font-semibold">Max possible</th>
            <th className="px-4 py-3 font-semibold">Programme</th>
            <th className="px-4 py-3 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody key={resetKey}>
          {zoneGroups.map((group, groupIndex) => (
            <Fragment key={`group-${groupIndex}`}>
              {groupIndex > 0 ? (
                <tr key={`divider-${groupIndex}`}>
                  <td colSpan={12} className="bg-slate-300 px-4 py-2" />
                </tr>
              ) : null}
              {group.flatMap((row, rowIndex) => {
                const groupKey = `${groupIndex}-${rowIndex}`;
                const subRowCount = getSubRowCount(groupKey);

                return Array.from({ length: subRowCount }).map((_, subIndex) => {
                  const key = `${groupKey}-${subIndex}`;
                  ensureRow(key, row);
                  const isLast = subIndex === subRowCount - 1;
                  const prefill = prefillByKey.map.get(key);

                  return (
                    <ProgrammeRow
                      key={key}
                      zoneLabel={subIndex === 0 ? row.zone : ""}
                      zoneMachineOptions={group}
                      defaultMachine={row}
                      canChangerMachine={canChangerMachine}
                      articles={articles}
                      fabricationMachines={fabricationMachines}
                      machineCapacites={capacitesByMachineArticle}
                      etat={etats[key] ?? etatInitial(key, row)}
                      quantites={
                        quantitesParLigne.get(key) ?? { vracInput: "", vrac: null, qtCarton: null, minutes: null }
                      }
                      onEtat={(partial) => changerEtat(key, row, partial)}
                      prefillTypeArticle={prefill?.type_article}
                      prefillMachineFabricationId={prefill?.machine_fabrication_id}
                      prefillPlateforme={prefill?.plateforme}
                      prefillProgramme={prefill?.programe}
                      isLast={isLast}
                      subRowCount={subRowCount}
                      onAddSubRow={() => addSubRow(groupKey)}
                      onRemoveSubRow={() => removeSubRow(groupKey, key)}
                      onUpdate={(partial) => updateRow(key, partial)}
                    />
                  );
                });
              })}
            </Fragment>
          ))}
        </tbody>
      </table>

      <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {message ? <p className="text-sm font-semibold text-emerald-700">{message}</p> : null}
          {errorMessage ? <p className="text-sm font-semibold text-red-700">{errorMessage}</p> : null}
          {dispatchWarnings.length > 0 ? (
            <ul className="mt-1 space-y-1 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
              {dispatchWarnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={isPending}
            className="rounded-full border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-60"
          >
            {isPending ? "Enregistrement..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={isPending}
            className="rounded-full bg-sky-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:opacity-60"
          >
            {isPending ? "Enregistrement..." : "Dispatch"}
          </button>
        </div>
      </div>
    </div>
  );
}
