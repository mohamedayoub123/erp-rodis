"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { SubmitButton } from "@/app/_components/submit-button";
import { updateProduitDimensionsAction } from "./actions";

type Dimensions = {
  longueur: number | null;
  largeur: number | null;
  hauteur: number | null;
  poids_net: number | null;
  poids_brut: number | null;
};

// Meme motif que type-produit-select.tsx (SavedIndicator) - doit etre un
// enfant du <form> pour lire son etat via useFormStatus().
function SavedIndicator() {
  const { pending } = useFormStatus();
  const [justSaved, setJustSaved] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      setJustSaved(true);
      const timeout = setTimeout(() => setJustSaved(false), 2000);
      return () => clearTimeout(timeout);
    }
    wasPending.current = pending;
  }, [pending]);

  if (pending) return <span className="text-xs text-slate-400">Enregistrement...</span>;
  if (justSaved) return <span className="text-xs font-semibold text-emerald-600">✓ Enregistre</span>;
  return null;
}

function formatValue(value: number | null) {
  return value === null ? "-" : value.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

// Volume carton = Longueur x Largeur x Hauteur (cm), affiche en litres
// (dm3, unite habituelle pour le chargement/transport) - jamais enregistre
// en base, uniquement calcule a l'affichage a partir des 3 dimensions.
function volumeLitres(longueur: number | null, largeur: number | null, hauteur: number | null): number | null {
  if (longueur === null || largeur === null || hauteur === null) return null;
  if (longueur <= 0 || largeur <= 0 || hauteur <= 0) return null;
  return (longueur * largeur * hauteur) / 1000;
}

function parseInputNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function ProduitDimensionsForm({
  type,
  articleId,
  dimensions,
  canWrite,
}: {
  type: "mp" | "pf";
  articleId: number;
  dimensions: Dimensions;
  canWrite: boolean;
}) {
  if (!canWrite) {
    const hasAny =
      dimensions.longueur !== null ||
      dimensions.largeur !== null ||
      dimensions.hauteur !== null ||
      dimensions.poids_net !== null ||
      dimensions.poids_brut !== null;
    if (!hasAny) return null;

    const volume = volumeLitres(dimensions.longueur, dimensions.largeur, dimensions.hauteur);

    return (
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
        <span>Longueur : {formatValue(dimensions.longueur)} cm</span>
        <span>Largeur : {formatValue(dimensions.largeur)} cm</span>
        <span>Hauteur : {formatValue(dimensions.hauteur)} cm</span>
        <span>Poids net : {formatValue(dimensions.poids_net)} kg</span>
        <span>Poids brut : {formatValue(dimensions.poids_brut)} kg</span>
        {volume !== null ? <span className="font-semibold text-slate-800">Volume carton : {formatValue(volume)} L</span> : null}
      </div>
    );
  }

  const [longueur, setLongueur] = useState(dimensions.longueur);
  const [largeur, setLargeur] = useState(dimensions.largeur);
  const [hauteur, setHauteur] = useState(dimensions.hauteur);
  const volume = volumeLitres(longueur, largeur, hauteur);

  return (
    <form action={updateProduitDimensionsAction} className="mt-4 flex flex-wrap items-end gap-3">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="article_id" value={articleId} />
      <label className="grid gap-1 text-xs font-semibold text-slate-500">
        Longueur (cm)
        <input
          type="number"
          step="0.01"
          name="longueur"
          value={longueur ?? ""}
          onChange={(event) => setLongueur(parseInputNumber(event.target.value))}
          className="w-28 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none"
        />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-500">
        Largeur (cm)
        <input
          type="number"
          step="0.01"
          name="largeur"
          value={largeur ?? ""}
          onChange={(event) => setLargeur(parseInputNumber(event.target.value))}
          className="w-28 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none"
        />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-500">
        Hauteur (cm)
        <input
          type="number"
          step="0.01"
          name="hauteur"
          value={hauteur ?? ""}
          onChange={(event) => setHauteur(parseInputNumber(event.target.value))}
          className="w-28 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none"
        />
      </label>
      <div className="grid gap-1 text-xs font-semibold text-slate-500">
        Volume carton
        <p className="px-1 py-2 text-sm font-semibold text-slate-800">
          {volume !== null ? `${formatValue(volume)} L` : "-"}
        </p>
      </div>
      <label className="grid gap-1 text-xs font-semibold text-slate-500">
        Poids net (kg)
        <input
          type="number"
          step="0.01"
          name="poids_net"
          defaultValue={dimensions.poids_net ?? ""}
          className="w-28 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none"
        />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-500">
        Poids brut (kg)
        <input
          type="number"
          step="0.01"
          name="poids_brut"
          defaultValue={dimensions.poids_brut ?? ""}
          className="w-28 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none"
        />
      </label>
      <SubmitButton
        pendingLabel="..."
        className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        Enregistrer
      </SubmitButton>
      <SavedIndicator />
    </form>
  );
}
