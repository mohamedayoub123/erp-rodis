import Link from "next/link";
import type { ModesSaisieConditionnement } from "@/lib/conditionnement-modes";

// Choix entre "Entree simple" (formulaire habituel) et "Entree par ligne" (releves + casiers) pour un code.
// Les deux sont exclusives : des qu'un code a ete saisi d'une facon, l'autre est fermee (cartons comptes
// une seule fois).
export function ModeSaisieSwitch({
  ligneId,
  code,
  actuel,
  modes,
}: {
  ligneId: number;
  code: string;
  actuel: "simple" | "par_ligne";
  modes: ModesSaisieConditionnement;
}) {
  const parametreCode = `?code=${encodeURIComponent(code)}`;
  const base = `/production/suivi-production/conditionnement/${ligneId}`;

  const simpleBloque = modes.parLigne;
  const parLigneBloque = modes.simple || modes.colonneAbsente;

  const raisonSimple = simpleBloque ? "Deja saisi en Entree par ligne" : null;
  const raisonParLigne = modes.colonneAbsente
    ? "Pas encore activee (SQL a executer)"
    : modes.simple
      ? "Deja saisi en Entree simple"
      : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Onglet
        href={`${base}${parametreCode}`}
        libelle="Entree simple"
        actif={actuel === "simple"}
        bloque={simpleBloque && actuel !== "simple"}
        raison={raisonSimple}
      />
      <Onglet
        href={`${base}/par-ligne${parametreCode}`}
        libelle="Entree par ligne"
        actif={actuel === "par_ligne"}
        bloque={parLigneBloque && actuel !== "par_ligne"}
        raison={raisonParLigne}
      />
    </div>
  );
}

function Onglet({
  href,
  libelle,
  actif,
  bloque,
  raison,
}: {
  href: string;
  libelle: string;
  actif: boolean;
  bloque: boolean;
  raison: string | null;
}) {
  if (bloque) {
    return (
      <span
        title={raison ?? undefined}
        className="cursor-not-allowed rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-400"
      >
        {libelle}
        {raison ? <span className="ml-2 font-normal">- {raison}</span> : null}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-current={actif ? "page" : undefined}
      className={
        actif
          ? "rounded-full bg-sky-700 px-4 py-2 text-xs font-semibold text-white"
          : "rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-800 transition hover:bg-sky-100"
      }
    >
      {libelle}
    </Link>
  );
}
