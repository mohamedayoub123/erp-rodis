"use client";

import { useState } from "react";
import { DEVISE_OPTIONS } from "@/lib/devise-options";

const fieldClass = "rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none";

// Devise + taux de change, fige sur la ligne au moment de la saisie (pas un
// taux global) - meme motif que DateJmaFormField (app/_components/date-jma-input.tsx) :
// un morceau "use client" reutilisable dans un <form action={serverAction}>
// sans rendre toute la page client.
export function DeviseTauxFormField({
  deviseDefaultValue,
  tauxDefaultValue,
}: {
  deviseDefaultValue?: string | null;
  tauxDefaultValue?: number | null;
}) {
  const [devise, setDevise] = useState(deviseDefaultValue || "FCFA");
  const [taux, setTaux] = useState(tauxDefaultValue != null ? String(tauxDefaultValue) : "");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        name="devise"
        value={devise}
        onChange={(event) => setDevise(event.target.value)}
        className={fieldClass}
      >
        {DEVISE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {devise !== "FCFA" ? (
        <input
          type="number"
          step="0.01"
          min="0"
          name="taux_change"
          value={taux}
          onChange={(event) => setTaux(event.target.value)}
          placeholder={`Taux (1 ${devise} = ? FCFA)`}
          className={`w-40 ${fieldClass}`}
        />
      ) : (
        <input type="hidden" name="taux_change" value="" />
      )}
    </div>
  );
}
