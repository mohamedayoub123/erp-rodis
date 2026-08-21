"use client";

import { useState } from "react";
import { ProduitPickerField } from "@/app/production/suivi-production/produit-picker-field";
import { addPrixSpecialAction, deletePrixSpecialAction, updatePrixVenteAction } from "./actions";

export type Special = { id: number; clientId: number; clientNom: string; prix: number };
export type ClientOption = { id: number; label: string };

function formatNombre(value: number | null) {
  if (value === null) return "-";
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

export function PrixVenteRow({
  articleId,
  nomArticle,
  code,
  coutParCarton,
  prixVente: prixVenteInitial,
  speciaux: speciauxInitial,
  clients,
  canWrite,
}: {
  articleId: number;
  nomArticle: string;
  code: string;
  coutParCarton: number | null;
  prixVente: number | null;
  speciaux: Special[];
  clients: ClientOption[];
  canWrite: boolean;
}) {
  const [prixVente, setPrixVente] = useState(prixVenteInitial);
  const [editingPrix, setEditingPrix] = useState(false);
  const [prixTexte, setPrixTexte] = useState("");
  const [busyPrix, setBusyPrix] = useState(false);
  const [speciaux, setSpeciaux] = useState(speciauxInitial);
  const [showAddSpecial, setShowAddSpecial] = useState(false);
  const [nouveauClientId, setNouveauClientId] = useState<number | null>(null);
  const [nouveauPrix, setNouveauPrix] = useState("");
  const [busySpecial, setBusySpecial] = useState(false);
  const [erreur, setErreur] = useState("");

  const marge = prixVente !== null && coutParCarton !== null ? prixVente - coutParCarton : null;

  async function handleSavePrix(rawValue: string) {
    setEditingPrix(false);
    const trimmed = rawValue.trim().replace(",", ".");
    const nextValue = trimmed === "" ? null : Number(trimmed);
    if (nextValue !== null && Number.isNaN(nextValue)) {
      setErreur("Prix invalide.");
      return;
    }
    if (nextValue === prixVente) return;

    setBusyPrix(true);
    setErreur("");
    const previous = prixVente;
    setPrixVente(nextValue);
    const result = await updatePrixVenteAction(articleId, nextValue);
    if (!result.ok) {
      setPrixVente(previous);
      setErreur(result.message || "Erreur pendant l'enregistrement.");
    }
    setBusyPrix(false);
  }

  async function handleAddSpecial() {
    if (!nouveauClientId) {
      setErreur("Choisis un client dans la liste.");
      return;
    }
    const prixNum = Number(nouveauPrix.trim().replace(",", "."));
    if (!prixNum || prixNum <= 0) {
      setErreur("Prix invalide.");
      return;
    }

    setBusySpecial(true);
    setErreur("");
    const result = await addPrixSpecialAction(articleId, nouveauClientId, prixNum);
    if (!result.ok || !result.id) {
      setErreur(result.message || "Erreur pendant l'ajout.");
      setBusySpecial(false);
      return;
    }

    const clientNom = clients.find((c) => c.id === nouveauClientId)?.label ?? `#${nouveauClientId}`;
    setSpeciaux((current) => {
      const withoutSameClient = current.filter((s) => s.clientId !== nouveauClientId);
      return [...withoutSameClient, { id: result.id as number, clientId: nouveauClientId, clientNom, prix: prixNum }];
    });
    setNouveauClientId(null);
    setNouveauPrix("");
    setShowAddSpecial(false);
    setBusySpecial(false);
  }

  async function handleDeleteSpecial(id: number) {
    setBusySpecial(true);
    setErreur("");
    const previous = speciaux;
    setSpeciaux((current) => current.filter((s) => s.id !== id));
    const result = await deletePrixSpecialAction(id);
    if (!result.ok) {
      setSpeciaux(previous);
      setErreur(result.message || "Erreur pendant la suppression.");
    }
    setBusySpecial(false);
  }

  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-4 py-3">
        <p className="font-semibold text-slate-900">{nomArticle}</p>
        <p className="text-xs text-slate-500">{code}</p>
      </td>
      <td className="px-4 py-3 text-slate-600">{formatNombre(coutParCarton)}</td>
      <td className="px-4 py-3">
        {canWrite ? (
          editingPrix ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                autoFocus
                value={prixTexte}
                disabled={busyPrix}
                placeholder="Prix"
                onChange={(e) => setPrixTexte(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSavePrix(prixTexte);
                  if (e.key === "Escape") setEditingPrix(false);
                }}
                className="w-20 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none"
              />
              <button
                type="button"
                onClick={() => handleSavePrix(prixTexte)}
                disabled={busyPrix}
                className="rounded-full bg-slate-900 px-2 py-1.5 text-xs font-semibold text-white"
                title="Enregistrer"
              >
                OK
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setPrixTexte(prixVente !== null ? String(prixVente) : "");
                setEditingPrix(true);
              }}
              className="w-28 rounded-2xl border border-transparent px-3 py-2 text-left text-sm font-semibold text-slate-900 hover:border-slate-200"
              disabled={busyPrix}
            >
              {formatNombre(prixVente)}
            </button>
          )
        ) : (
          <span className="font-semibold text-slate-900">{formatNombre(prixVente)}</span>
        )}
      </td>
      <td className="px-4 py-3">
        {marge === null ? (
          <span className="text-slate-400">-</span>
        ) : (
          <span className={`font-semibold ${marge >= 0 ? "text-emerald-700" : "text-red-700"}`}>
            {formatNombre(marge)}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1.5">
          {speciaux.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
            >
              <span className="truncate">
                {s.clientNom} : {formatNombre(s.prix)}
              </span>
              {canWrite ? (
                <button
                  type="button"
                  onClick={() => handleDeleteSpecial(s.id)}
                  disabled={busySpecial}
                  className="shrink-0 text-red-600"
                  title="Effacer"
                >
                  ✕
                </button>
              ) : null}
            </div>
          ))}

          {canWrite ? (
            showAddSpecial ? (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 p-2">
                <div className="w-40">
                  <ProduitPickerField
                    articles={clients}
                    hiddenName={`client_id_${articleId}`}
                    textName={`client_display_${articleId}`}
                    onSelect={(clientId) => setNouveauClientId(clientId)}
                  />
                </div>
                <input
                  type="text"
                  placeholder="Prix"
                  value={nouveauPrix}
                  onChange={(e) => setNouveauPrix(e.target.value)}
                  className="w-20 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddSpecial}
                  disabled={busySpecial}
                  className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Ajouter
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddSpecial(false);
                    setNouveauClientId(null);
                    setNouveauPrix("");
                  }}
                  className="text-xs font-semibold text-slate-500"
                >
                  Annuler
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddSpecial(true)}
                className="w-fit rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:border-slate-400"
              >
                + Prix client special
              </button>
            )
          ) : null}

          {erreur ? <p className="text-xs font-semibold text-red-700">{erreur}</p> : null}
        </div>
      </td>
    </tr>
  );
}
