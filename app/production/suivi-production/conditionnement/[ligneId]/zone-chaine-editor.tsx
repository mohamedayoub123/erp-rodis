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
        {options.map((option) => (
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
