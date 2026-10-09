"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { lireRotationArticleMpAction } from "./actions";
import type { NiveauRotationMp, RotationArticleMp } from "@/lib/rotation-mp-article";

type Resultat = { articleId: number; version: number; rotation: RotationArticleMp | null; message: string | null };

const NIVEAUX: Record<NiveauRotationMp, { libelle: string; classes: string }> = {
  FORTE: { libelle: "Forte rotation", classes: "bg-emerald-100 text-emerald-800" },
  MOYENNE: { libelle: "Rotation moyenne", classes: "bg-sky-100 text-sky-800" },
  FAIBLE: { libelle: "Faible rotation", classes: "bg-amber-100 text-amber-800" },
  DORMANT: { libelle: "Dormant (aucune sortie en 12 mois)", classes: "bg-slate-200 text-slate-700" },
};

function nombre(valeur: number, decimales = 2) {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: decimales });
}

// Carte "Rotation de l'article" des ecrans Entree / Sortie MP : par MOIS (sorties des 6 derniers mois + mois en
// cours, moyenne, couverture du stock) et par AN (meme rotation que le rapport Rotation de Stock MP).
// Se met a jour quand l'article change, et apres chaque enregistrement ("version").
export function RotationArticleCarte({
  articleId,
  articleLabel,
  unite,
  version,
}: {
  articleId: number | null;
  articleLabel: string;
  unite: string;
  version: number;
}) {
  const [resultat, setResultat] = useState<Resultat | null>(null);

  useEffect(() => {
    if (articleId === null) return;
    let annule = false;
    lireRotationArticleMpAction(articleId)
      .then((reponse) => {
        if (annule) return;
        setResultat({
          articleId,
          version,
          rotation: reponse.ok ? reponse.rotation : null,
          message: reponse.ok ? null : reponse.message,
        });
      })
      .catch(() => {
        if (!annule) setResultat({ articleId, version, rotation: null, message: "Rotation indisponible pour le moment." });
      });
    return () => {
      annule = true;
    };
  }, [articleId, version]);

  if (articleId === null) return null;

  const actuel = resultat && resultat.articleId === articleId && resultat.version === version ? resultat : null;
  const suffixe = unite ? ` ${unite}` : "";

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-slate-900">Rotation de l&apos;article</p>
        <div className="flex items-center gap-3">
          {actuel?.rotation?.niveau ? (
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${NIVEAUX[actuel.rotation.niveau].classes}`}>
              {NIVEAUX[actuel.rotation.niveau].libelle}
            </span>
          ) : null}
          <Link
            href={`/stock/matiere-premiere/rotation?article=${encodeURIComponent(articleLabel)}`}
            className="text-xs font-semibold text-sky-700 underline"
            target="_blank"
          >
            Voir le detail
          </Link>
        </div>
      </div>

      {!actuel ? (
        <p className="mt-2 text-xs text-slate-500">Calcul de la rotation...</p>
      ) : actuel.message || !actuel.rotation ? (
        <p className="mt-2 text-xs text-red-700">{actuel.message ?? "Rotation indisponible."}</p>
      ) : (
        <ContenuRotation rotation={actuel.rotation} suffixe={suffixe} />
      )}
    </div>
  );
}

export function ContenuRotation({ rotation, suffixe }: { rotation: RotationArticleMp; suffixe: string }) {
  const maximum = Math.max(1, ...rotation.mois.map((m) => m.sorties));

  return (
    <div className="mt-3 grid gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Par mois - sorties</p>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {rotation.mois.map((mois) => (
            <div key={mois.cle} className="flex min-w-[4.5rem] flex-1 flex-col items-center gap-1 text-center">
              <div className="flex h-10 items-end">
                <div
                  className={`w-5 rounded-t ${mois.enCours ? "bg-sky-300" : "bg-sky-600"}`}
                  style={{ height: `${Math.max(2, Math.round((mois.sorties / maximum) * 40))}px` }}
                  aria-hidden="true"
                />
              </div>
              <p className="text-xs font-bold text-slate-900">{nombre(mois.sorties)}</p>
              <p className="text-[0.7rem] text-slate-500">
                {mois.libelle}
                {mois.enCours ? " (en cours)" : ""}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-700">
          Moyenne 3 mois : <span className="font-semibold">{nombre(rotation.moyenne3Mois)}{suffixe}</span> - moyenne 6
          mois : <span className="font-semibold">{nombre(rotation.moyenne6Mois)}{suffixe}</span> - stock actuel :{" "}
          <span className="font-semibold">{nombre(rotation.stockActuel)}{suffixe}</span>
          {rotation.couvertureMois !== null && rotation.stockActuel > 0 ? (
            <>
              {" "}
              = <span className="font-semibold">{nombre(rotation.couvertureMois, 1)} mois</span> de couverture
            </>
          ) : rotation.moyenne3Mois <= 0 ? (
            <> (aucune sortie ces 3 derniers mois)</>
          ) : null}
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Par an - 12 derniers mois</p>
        <p className="mt-1 text-xs text-slate-700">
          {rotation.rotation !== null ? (
            <>
              Rotation : <span className="font-semibold">{nombre(rotation.rotation)} fois par an</span> - sorties :{" "}
              <span className="font-semibold">{nombre(rotation.sorties12Mois)}{suffixe}</span> / stock moyen :{" "}
              <span className="font-semibold">{nombre(rotation.stockMoyen)}{suffixe}</span>
              {rotation.joursCouverture !== null && rotation.stockActuel > 0 ? (
                <>
                  {" "}
                  - le stock actuel couvre environ{" "}
                  <span className="font-semibold">{nombre(rotation.joursCouverture, 0)} jours</span>
                </>
              ) : null}
            </>
          ) : (
            <>Pas de rotation calculable (stock moyen nul). Sorties 12 mois : {nombre(rotation.sorties12Mois)}{suffixe}</>
          )}
        </p>
      </div>
    </div>
  );
}
