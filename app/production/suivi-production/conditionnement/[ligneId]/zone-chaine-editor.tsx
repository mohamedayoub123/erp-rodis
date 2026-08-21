"use client";

import { useState, useTransition } from "react";
import { updateLigneZoneChaineAction } from "../../actions";

type Option = { zone: string; chaine: string };

export function LigneZoneChaineEditor({
  ligneId,
  zone,
  chaine,
  options,
}: {
  ligneId: number;
  zone: string;
  chaine: string;
  options: Option[];
}) {
  const [selected, setSelected] = useState(`${zone}::${chaine}`);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");
  const [saved, setSaved] = useState(false);

  // La liste vient des vraies machines Conditionnement (voir
  // lib/machines-conditionnement.ts) - une ligne deja enregistree avec
  // l'ancienne casse/liste fixe (ex: "CHAINE 4", jamais renommee toute
  // seule vers "chaine 4" cote machines) doit quand meme s'afficher
  // correctement ici, jamais un select qui parait vide/faux parce que sa
  // valeur actuelle ne matche aucune option exacte.
  const currentEstDansLaListe = options.some((o) => o.zone === zone && o.chaine === chaine);
  const displayOptions = currentEstDansLaListe ? options : [{ zone, chaine }, ...options];

  function handleChange(value: string) {
    setSelected(value);
    setErrorMessage("");
    setSaved(false);
    const [nextZone, nextChaine] = value.split("::");

    startTransition(async () => {
      try {
        await updateLigneZoneChaineAction(ligneId, nextZone, nextChaine);
        setSaved(true);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Erreur pendant la modification.");
      }
    });
  }

  return (
    <span className="inline-flex flex-col gap-1 align-middle">
      <select
        value={selected}
        onChange={(event) => handleChange(event.target.value)}
        disabled={isPending}
        className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-900 outline-none disabled:opacity-60"
      >
        {displayOptions.map((option) => (
          <option key={`${option.zone}::${option.chaine}`} value={`${option.zone}::${option.chaine}`}>
            {option.zone} / {option.chaine}
          </option>
        ))}
      </select>
      {errorMessage ? <span className="text-xs font-semibold text-red-700">{errorMessage}</span> : null}
      {!errorMessage && saved && !isPending ? (
        <span className="text-xs font-semibold text-emerald-700">Modifie.</span>
      ) : null}
    </span>
  );
}
