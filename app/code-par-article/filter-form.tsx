"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

function useSuggestions(options: string[], value: string) {
  return useMemo(() => {
    const words = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return options.slice(0, 100);

    return options.filter((option) => {
      const label = option.toLowerCase();
      return words.every((word) => label.includes(word));
    });
  }, [options, value]);
}

function FilterField({
  name,
  placeholder,
  defaultValue,
  options,
}: {
  name: string;
  placeholder: string;
  defaultValue: string;
  options: string[];
}) {
  const [value, setValue] = useState(defaultValue);
  const [showDropdown, setShowDropdown] = useState(false);
  const suggestions = useSuggestions(options, value);

  return (
    <label className="relative grid gap-0">
      <input
        type="text"
        name={name}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-0 placeholder:text-slate-400"
      />
      {showDropdown && suggestions.length > 0 ? (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
          {suggestions.map((option) => (
            <button
              key={option}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setValue(option);
                setShowDropdown(false);
              }}
              className="block w-full px-4 py-2 text-left text-sm text-slate-800 hover:bg-slate-100"
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </label>
  );
}

export function CodeParArticleFilterForm({
  defaultArticle,
  defaultGamme,
  defaultCodeAuto,
  defaultCodeManu,
  articleOptions,
  gammeOptions,
  codeAutoOptions,
  codeManuOptions,
}: {
  defaultArticle: string;
  defaultGamme: string;
  defaultCodeAuto: string;
  defaultCodeManu: string;
  articleOptions: string[];
  gammeOptions: string[];
  codeAutoOptions: string[];
  codeManuOptions: string[];
}) {
  return (
    <form className="grid gap-3 border-b border-slate-100 px-6 py-5 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto_auto]">
      <FilterField
        name="article"
        placeholder="Ecrire article..."
        defaultValue={defaultArticle}
        options={articleOptions}
      />
      <FilterField
        name="gamme"
        placeholder="Ecrire gamme..."
        defaultValue={defaultGamme}
        options={gammeOptions}
      />
      <FilterField
        name="code_auto"
        placeholder="Ecrire code auto..."
        defaultValue={defaultCodeAuto}
        options={codeAutoOptions}
      />
      <FilterField
        name="code_manu"
        placeholder="Ecrire code manuel..."
        defaultValue={defaultCodeManu}
        options={codeManuOptions}
      />
      <button
        type="submit"
        className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        Filtrer
      </button>
      <Link
        href="/code-par-article"
        className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
      >
        Effacer
      </Link>
    </form>
  );
}
