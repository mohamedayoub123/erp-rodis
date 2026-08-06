"use client";

import { useMemo, useState } from "react";
import { createManualEntryLigneAction } from "../../suivi-production/actions";
import { DateJmaInput } from "@/app/_components/date-jma-input";

type ZoneChaineOption = { zone: string; chaine: string };
type ArticleOption = { id: number; label: string };

// Meme motif que ProduitCell (Programme par ligne) : texte libre + menu qui
// se filtre au fur et a mesure, article_id transmis a part en champ cache.
function ProduitPicker({
  articles,
  value,
  onChange,
  onSelect,
}: {
  articles: ArticleOption[];
  value: string;
  onChange: (value: string) => void;
  onSelect: (articleId: number | null) => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);

  const filtered = useMemo(() => {
    const words = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return articles.slice(0, 50);
    return articles.filter((article) => {
      const label = article.label.toLowerCase();
      return words.every((word) => label.includes(word));
    });
  }, [value, articles]);

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          onSelect(null);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        placeholder="Produit"
        autoComplete="off"
        required
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
      />
      {showDropdown && filtered.length > 0 ? (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
          {filtered.map((article) => (
            <button
              key={article.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(article.label);
                onSelect(article.id);
                setShowDropdown(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100"
            >
              {article.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ManualEntryButton({
  target,
  label,
  zoneChaineOptions,
  articles,
}: {
  target: "conditionnement" | "emballage";
  label: string;
  zoneChaineOptions: ZoneChaineOption[];
  articles: ArticleOption[];
}) {
  const [open, setOpen] = useState(false);
  const firstOption = zoneChaineOptions[0];
  const [zoneChaine, setZoneChaine] = useState(
    firstOption ? `${firstOption.zone}::${firstOption.chaine}` : ""
  );
  const [produit, setProduit] = useState("");
  const [articleId, setArticleId] = useState<number | null>(null);
  const [numeroLot, setNumeroLot] = useState("");
  const [date, setDate] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Ajouter une fiche ${label} manuelle (sans programme dispatche)`}
        className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-base font-bold leading-none text-sky-700 hover:bg-sky-200"
      >
        +
      </button>
    );
  }

  return (
    <div className="absolute left-0 top-full z-50 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
      <p className="mb-3 text-xs font-semibold text-slate-600">
        Nouvelle fiche {label} - sans programme deja dispatche.
      </p>
      <form action={createManualEntryLigneAction} className="grid gap-3">
        <input type="hidden" name="target" value={target} />
        <input type="hidden" name="article_id" value={articleId ?? ""} />
        <input type="hidden" name="produit" value={produit} />
        <input type="hidden" name="date_jour" value={date} />

        <select
          name="zone_chaine"
          value={zoneChaine}
          onChange={(event) => setZoneChaine(event.target.value)}
          required
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
        >
          {zoneChaineOptions.map((option) => (
            <option key={`${option.zone}::${option.chaine}`} value={`${option.zone}::${option.chaine}`}>
              {option.zone} / {option.chaine}
            </option>
          ))}
        </select>

        <ProduitPicker articles={articles} value={produit} onChange={setProduit} onSelect={setArticleId} />

        <input
          type="text"
          value={numeroLot}
          onChange={(event) => setNumeroLot(event.target.value)}
          name="numero_lot"
          placeholder="N de lot"
          required
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
        />

        <div>
          <p className="mb-1 text-xs font-semibold text-slate-500">Date</p>
          <DateJmaInput value={date} onChange={setDate} required />
        </div>

        <div className="mt-1 flex items-center gap-2">
          <button
            type="submit"
            className="rounded-full bg-sky-700 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-600"
          >
            Creer la fiche
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
