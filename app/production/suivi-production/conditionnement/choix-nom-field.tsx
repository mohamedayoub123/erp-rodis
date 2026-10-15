"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

// Champ "Nom chef de zone" / "Nom chef de ligne" du Conditionnement : liste de choix (les noms se gerent dans Production > Noms
// Conditionnement). On peut taper pour filtrer, mais seul un nom de la liste est accepte. Tant que la liste est vide (aucun nom
// ajoute, ou table pas encore creee), la saisie reste libre comme avant. Une ancienne valeur qui n'est pas dans la liste n'est pas
// reprise : il faut choisir un nom de la liste. Le serveur refait le meme controle (lib/noms-conditionnement.ts).
export function ChoixNomField({
  name,
  noms,
  defaultValue = "",
  required,
  className,
  lienGerer,
}: {
  name: string;
  noms: string[];
  defaultValue?: string;
  required?: boolean;
  className: string;
  // Present seulement pour les personnes autorisees a gerer la liste
  lienGerer?: string;
}) {
  const strict = noms.length > 0;
  const departExact = noms.find((nom) => nom.toLowerCase() === defaultValue.trim().toLowerCase()) ?? null;
  const [valeur, setValeur] = useState(strict ? (departExact ?? "") : defaultValue);
  const [ouvert, setOuvert] = useState(false);
  const champ = useRef<HTMLInputElement>(null);

  const saisi = valeur.trim().toLowerCase();
  const exact = noms.find((nom) => nom.toLowerCase() === saisi) ?? null;

  useEffect(() => {
    if (!champ.current) return;
    champ.current.setCustomValidity(strict && saisi && !exact ? "Choisis un nom de la liste." : "");
  }, [strict, saisi, exact]);

  const filtres = useMemo(
    () => (saisi ? noms.filter((nom) => nom.toLowerCase().includes(saisi)) : noms),
    [noms, saisi]
  );

  return (
    <div className="relative">
      <input
        ref={champ}
        type="text"
        name={name}
        autoComplete="off"
        required={required}
        value={valeur}
        onChange={(event) => {
          setValeur(event.target.value);
          setOuvert(true);
        }}
        onFocus={() => setOuvert(true)}
        onBlur={() => {
          setTimeout(() => setOuvert(false), 150);
          if (exact) setValeur(exact);
        }}
        placeholder={strict ? "Choisir un nom..." : ""}
        className={`w-full ${className}`}
      />
      {strict && ouvert && filtres.length > 0 ? (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
          {filtres.map((nom) => (
            <button
              key={nom}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setValeur(nom);
                setOuvert(false);
              }}
              className="block w-full px-4 py-2 text-left text-sm font-normal text-slate-800 hover:bg-slate-100"
            >
              {nom}
            </button>
          ))}
        </div>
      ) : null}
      {strict && ouvert && saisi && filtres.length === 0 ? (
        <p className="absolute left-0 top-full z-20 mt-1 w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700">
          Ce nom n&apos;est pas dans la liste.
        </p>
      ) : null}
      {lienGerer ? (
        <Link href={lienGerer} className="mt-1 inline-block text-xs font-semibold text-sky-700 underline">
          Gerer la liste
        </Link>
      ) : null}
    </div>
  );
}
