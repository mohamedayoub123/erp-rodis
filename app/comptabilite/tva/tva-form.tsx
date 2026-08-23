"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDeclarationTvaAction, deleteDeclarationTvaAction } from "./actions";

export type DeclarationTvaRow = {
  periode: string;
  tvaCollectee: number;
  tvaDeductible: number;
  net: number;
  dateDeclaration: string;
};

function moisActuel() {
  return new Date().toISOString().slice(0, 7);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function TvaForm({
  declarations,
  canWrite,
}: {
  declarations: DeclarationTvaRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [periode, setPeriode] = useState(moisActuel);
  const [tvaCollectee, setTvaCollectee] = useState("");
  const [tvaDeductible, setTvaDeductible] = useState("");
  const [dateDeclaration, setDateDeclaration] = useState(todayIso);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function save() {
    setMessage("");
    setErrorMessage("");
    const formData = new FormData();
    formData.set("periode", periode);
    formData.set("tva_collectee", tvaCollectee || "0");
    formData.set("tva_deductible", tvaDeductible || "0");
    formData.set("date_declaration", dateDeclaration);

    startTransition(async () => {
      const result = await createDeclarationTvaAction(formData);
      if (!result.ok) {
        setErrorMessage(result.message || "Erreur pendant l'enregistrement.");
        return;
      }
      setTvaCollectee("");
      setTvaDeductible("");
      setMessage("Declaration enregistree.");
      router.refresh();
    });
  }

  function supprimer(periodeASupprimer: string) {
    if (!confirm(`Supprimer la declaration TVA de ${periodeASupprimer} ?`)) return;
    startTransition(async () => {
      const result = await deleteDeclarationTvaAction(periodeASupprimer);
      if (!result.ok) {
        setErrorMessage(result.message || "Erreur pendant la suppression.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {declarations.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Periode</th>
                <th className="px-4 py-2 font-semibold">TVA collectee</th>
                <th className="px-4 py-2 font-semibold">TVA deductible</th>
                <th className="px-4 py-2 font-semibold">Solde</th>
                {canWrite ? <th className="px-4 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {declarations.map((d) => (
                <tr key={d.periode} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-900">{d.periode}</td>
                  <td className="px-4 py-2 text-slate-700">{d.tvaCollectee.toLocaleString("fr-FR")} FCFA</td>
                  <td className="px-4 py-2 text-slate-700">{d.tvaDeductible.toLocaleString("fr-FR")} FCFA</td>
                  <td className="px-4 py-2">
                    <span className={d.net >= 0 ? "font-semibold text-red-600" : "font-semibold text-emerald-700"}>
                      {d.net >= 0
                        ? `A payer : ${d.net.toLocaleString("fr-FR")} FCFA`
                        : `A reporter : ${Math.abs(d.net).toLocaleString("fr-FR")} FCFA`}
                    </span>
                  </td>
                  {canWrite ? (
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => supprimer(d.periode)}
                        className="text-sm font-semibold text-red-600 hover:underline"
                      >
                        Supprimer
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Aucune declaration TVA pour le moment.</p>
      )}

      {canWrite ? (
        <div className="rounded-2xl border border-slate-100 p-4">
          <p className="mb-3 text-sm font-bold text-slate-900">Nouvelle declaration</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Periode
              <input
                type="month"
                value={periode}
                onChange={(event) => setPeriode(event.target.value)}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Date de declaration
              <input
                type="date"
                value={dateDeclaration}
                onChange={(event) => setDateDeclaration(event.target.value)}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              TVA collectee (sur ventes)
              <input
                type="number"
                step="0.01"
                min="0"
                value={tvaCollectee}
                onChange={(event) => setTvaCollectee(event.target.value)}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              TVA deductible (sur achats)
              <input
                type="number"
                step="0.01"
                min="0"
                value={tvaDeductible}
                onChange={(event) => setTvaDeductible(event.target.value)}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
              />
            </label>
          </div>

          {errorMessage ? (
            <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{errorMessage}</p>
          ) : null}
          {message ? (
            <p className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</p>
          ) : null}

          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className={`mt-4 rounded-full px-6 py-3 text-sm font-semibold text-white ${
              isPending ? "cursor-not-allowed bg-slate-300" : "bg-amber-700 transition hover:bg-amber-600"
            }`}
          >
            {isPending ? "Enregistrement..." : "Enregistrer la declaration"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
