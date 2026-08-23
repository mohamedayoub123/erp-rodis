"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retournerConditionnementAction } from "./actions";

export type DepotOption = {
  id: number;
  label: string;
};

export type LeftoverLigne = {
  reserveId: number;
  articleId: number;
  nomArticle: string;
  numeroLot: string;
  quantite: number;
  depotNom: string;
  produit: string | null;
  code: string;
};

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

export function RetourConditionnementForm({
  pdCode,
  lignes,
  depots,
  depotSourceDefault,
  depotDestinationDefault,
}: {
  pdCode: string;
  lignes: LeftoverLigne[];
  depots: DepotOption[];
  depotSourceDefault: number;
  depotDestinationDefault: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [checked, setChecked] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(lignes.map((ligne) => [ligne.reserveId, true]))
  );
  const [depotSourceId, setDepotSourceId] = useState(String(depotSourceDefault));
  const [depotDestinationId, setDepotDestinationId] = useState(String(depotDestinationDefault));
  const [dateJour, setDateJour] = useState(() => new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const selectedCount = useMemo(() => lignes.filter((ligne) => checked[ligne.reserveId]).length, [lignes, checked]);
  const allChecked = selectedCount === lignes.length;

  function toggleAll() {
    setChecked(Object.fromEntries(lignes.map((ligne) => [ligne.reserveId, !allChecked])));
  }

  function toggleOne(reserveId: number) {
    setChecked((current) => ({ ...current, [reserveId]: !current[reserveId] }));
  }

  const depotSourceLabel = depots.find((d) => String(d.id) === depotSourceId)?.label || `Depot #${depotSourceId}`;
  const depotDestinationLabel =
    depots.find((d) => String(d.id) === depotDestinationId)?.label || `Depot #${depotDestinationId}`;

  function save() {
    const selected = lignes.filter((ligne) => checked[ligne.reserveId]);
    if (selected.length === 0) {
      setMessage("");
      setErrorMessage("Coche au moins une ligne a retourner.");
      return;
    }
    if (depotSourceId === depotDestinationId) {
      setMessage("");
      setErrorMessage("Le depot destination doit etre different du depot source.");
      return;
    }

    setMessage("");
    setErrorMessage("");

    const formData = new FormData();
    formData.set("depot_source_id", depotSourceId);
    formData.set("depot_destination_id", depotDestinationId);
    formData.set("date_jour", dateJour);
    formData.set("pd_label", pdCode);
    formData.set(
      "payload",
      JSON.stringify(
        selected.map((ligne) => ({
          reserve_id: ligne.reserveId,
          article_id: ligne.articleId,
          quantite: ligne.quantite,
        }))
      )
    );

    startTransition(async () => {
      try {
        const result = await retournerConditionnementAction(formData);
        if (!result.ok) {
          setErrorMessage(result.message || "Erreur pendant la creation du retour.");
          return;
        }
        setMessage(
          `Retour cree : Transfer Order (TO) de ${depotSourceLabel} vers ${depotDestinationLabel} en attente - va l'approuver puis faire le TI depuis Depots.`
        );
        router.refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Erreur pendant la creation du retour.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Tout selectionner" />
              </th>
              <th className="px-4 py-2 font-semibold">Produit / Code</th>
              <th className="px-4 py-2 font-semibold">Article</th>
              <th className="px-4 py-2 font-semibold">Lot</th>
              <th className="px-4 py-2 font-semibold">Quantite restante</th>
              <th className="px-4 py-2 font-semibold">Depot d&apos;origine</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne) => (
              <tr key={ligne.reserveId} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={Boolean(checked[ligne.reserveId])}
                    onChange={() => toggleOne(ligne.reserveId)}
                  />
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {ligne.produit ? `${ligne.produit} - ` : ""}
                  {ligne.code}
                </td>
                <td className="px-4 py-2 font-medium text-slate-900">{ligne.nomArticle}</td>
                <td className="px-4 py-2 text-slate-600">{ligne.numeroLot}</td>
                <td className="px-4 py-2 text-slate-600">{formatNumber(ligne.quantite)}</td>
                <td className="px-4 py-2 text-slate-600">{ligne.depotNom}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 rounded-[1.5rem] border border-slate-100 bg-slate-50 p-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <label className="grid gap-2 text-sm font-semibold text-slate-900">
          <span>Depot source</span>
          <select
            value={depotSourceId}
            onChange={(event) => setDepotSourceId(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal outline-none"
          >
            {depots.map((depot) => (
              <option key={depot.id} value={depot.id}>
                {depot.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-900">
          <span>Depot destination</span>
          <select
            value={depotDestinationId}
            onChange={(event) => setDepotDestinationId(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal outline-none"
          >
            {depots.map((depot) => (
              <option key={depot.id} value={depot.id}>
                {depot.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-900">
          <span>Date</span>
          <input
            type="date"
            value={dateJour}
            onChange={(event) => setDateJour(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={save}
            disabled={selectedCount === 0 || isPending}
            className={`w-full rounded-full px-5 py-3 text-sm font-semibold text-white ${
              selectedCount === 0 || isPending ? "cursor-not-allowed bg-slate-300" : "bg-slate-950 transition hover:bg-slate-800"
            }`}
          >
            {isPending ? "Enregistrement..." : `Creer le retour (TO) - ${selectedCount} ligne${selectedCount > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{errorMessage}</p>
      ) : null}
      {message ? (
        <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</p>
      ) : null}
    </div>
  );
}
