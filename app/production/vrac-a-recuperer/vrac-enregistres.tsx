"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { VoirToutBanner } from "@/app/_components/voir-tout-banner";
import { formaterQuantiteVrac, type VracEnregistre } from "@/lib/vrac-a-recuperer";
import { supprimerVracARecupererAction } from "./actions";

function dateFr(iso: string): string {
  const [annee, mois, jour] = iso.split("-");
  return annee && mois && jour ? `${jour}-${mois}-${annee}` : iso;
}

export function VracEnregistres({
  lignes,
  total,
  canDelete,
  hrefTout,
}: {
  lignes: VracEnregistre[];
  total: number;
  canDelete: boolean;
  hrefTout: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function supprimer(l: VracEnregistre) {
    if (!window.confirm(`Retirer ${l.code} (${l.article}) du Depot B ?`)) return;
    setMessage(null);
    demarrer(async () => {
      try {
        const reponse = await supprimerVracARecupererAction(l.id);
        if (!reponse.ok) {
          setMessage(reponse.message);
          return;
        }
        router.refresh();
      } catch {
        setMessage("Suppression impossible (session fermee ?). Recharge la page.");
      }
    });
  }

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-bold text-slate-900">Vrac enregistre ({total})</h2>
        <p className="mt-1 text-sm text-slate-600">
          Le stock Depot B est le stock actuel de ce code (entrees moins sorties). Quand il tombe a 0, le vrac est
          entierement utilise.
        </p>
      </div>

      {message ? <p className="px-5 pt-4 text-sm font-semibold text-red-600">{message}</p> : null}

      {lignes.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">Aucun vrac enregistre pour le moment.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-950">
              <tr>
                <th className="px-5 py-3 font-semibold">Date</th>
                <th className="px-5 py-3 font-semibold">Article vrac</th>
                <th className="px-5 py-3 font-semibold">Code</th>
                <th className="px-5 py-3 text-right font-semibold">Quantite entree (kg)</th>
                <th className="px-5 py-3 text-right font-semibold">Stock Depot B (kg)</th>
                <th className="px-5 py-3 font-semibold">Remarque</th>
                <th className="px-5 py-3 font-semibold">Saisi par</th>
                {canDelete ? <th className="px-5 py-3" /> : null}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.id} className="border-t border-slate-100 align-middle">
                  <td className="px-5 py-3 font-semibold text-slate-900">{dateFr(l.date)}</td>
                  <td className="px-5 py-3 font-medium text-slate-900">{l.article}</td>
                  <td className="px-5 py-3 font-semibold text-sky-800">{l.code}</td>
                  <td className="px-5 py-3 text-right text-slate-700">{formaterQuantiteVrac(l.quantite)}</td>
                  <td className="px-5 py-3 text-right">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        l.solde > 0 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {formaterQuantiteVrac(l.solde)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{l.remarque ?? "-"}</td>
                  <td className="px-5 py-3 text-slate-600">{l.utilisateur ?? "-"}</td>
                  {canDelete ? (
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => supprimer(l)}
                        disabled={enCours}
                        className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-60"
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
      )}

      <VoirToutBanner affiches={lignes.length} total={total} href={hrefTout} />
    </section>
  );
}
