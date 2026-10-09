import type { ReactNode } from "react";
import type { RapportCharge } from "./donnees-rapport";

// Bandeau sous une diapositive de chiffres : d'ou viennent les chiffres, quand ils ont ete calcules et
// les alertes (ex : "juin 2026 sans chiffre"). Visible sur la page, jamais dans le diaporama ni le PowerPoint.
export function jourHeure(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BandeauFiabilite({
  source,
  rapport,
  alertes = [],
}: {
  source: string;
  rapport: Pick<RapportCharge, "calculeLe">;
  alertes?: ReactNode[];
}) {
  return (
    <div
      data-hors-diapo
      className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600"
    >
      <span>
        <strong className="font-semibold text-slate-700">Source :</strong> {source}
      </span>
      <span>Calculé le {jourHeure(rapport.calculeLe)} (se met à jour à chaque ouverture de la page)</span>
      {alertes.map((alerte, index) => (
        <span key={index} className="font-semibold text-amber-700">
          ⚠ {alerte}
        </span>
      ))}
    </div>
  );
}
