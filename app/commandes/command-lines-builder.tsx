"use client";

import { useMemo, useState } from "react";

type ArticleOption = {
  value: string;
  label: string;
};

type CommandLine = {
  article: string;
  quantite: string;
};

type CommandLinesBuilderProps = {
  articles: ArticleOption[];
  formId: string;
};

export function CommandLinesBuilder({ articles, formId }: CommandLinesBuilderProps) {
  const [articleInput, setArticleInput] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [quantiteInput, setQuantiteInput] = useState("");
  const [lines, setLines] = useState<CommandLine[]>([]);

  const filteredArticles = useMemo(() => {
    const words = articleInput.trim().toLowerCase().split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      return articles.slice(0, 100);
    }

    // Each word typed is matched independently anywhere in the name, so
    // "la wh" still finds "Lait WHITE SECRET 500ml" without needing the
    // full word. No cap: native <datalist> dropdowns silently truncate
    // the suggestions a browser will show, so this list is rendered by us
    // instead, in a scrollable panel, to show every real match.
    return articles.filter((article) => {
      const label = article.label.toLowerCase();
      return words.every((word) => label.includes(word));
    });
  }, [articleInput, articles]);

  const selectedArticle = useMemo(
    () => articles.find((article) => article.label === articleInput) ?? null,
    [articleInput, articles]
  );

  const serializedLines = useMemo(
    () => lines.map((line) => `${line.article} | ${line.quantite}`).join("\n"),
    [lines]
  );

  function selectArticle(article: ArticleOption) {
    setArticleInput(article.label);
    setShowDropdown(false);
  }

  function addLine() {
    const quantiteValue = Number(quantiteInput.replace(",", "."));

    if (!selectedArticle || Number.isNaN(quantiteValue) || quantiteValue <= 0) {
      return;
    }

    setLines((current) => [
      ...current,
      {
        article: selectedArticle.label,
        quantite: quantiteInput,
      },
    ]);
    setArticleInput("");
    setQuantiteInput("");
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  const totalQuantite = lines.reduce((sum, line) => {
    const quantiteValue = Number(line.quantite.replace(",", "."));
    return sum + (Number.isNaN(quantiteValue) ? 0 : quantiteValue);
  }, 0);

  return (
    <div className="grid gap-4">
      <input type="hidden" name="lignes" value={serializedLines} required form={formId} />

      <div className="grid gap-4 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 xl:grid-cols-[1.5fr_0.7fr_auto]">
        <label className="relative grid gap-2 text-sm font-semibold text-slate-900">
          <span>Article</span>
          <input
            value={articleInput}
            onChange={(event) => {
              setArticleInput(event.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            placeholder="Ecris un article puis choisis dans la liste"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none"
            autoComplete="off"
          />
          {showDropdown && filteredArticles.length > 0 ? (
            <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
              {filteredArticles.map((article) => (
                <button
                  key={article.value}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectArticle(article)}
                  className="block w-full px-4 py-2 text-left text-sm text-slate-800 hover:bg-slate-100"
                >
                  {article.label}
                </button>
              ))}
            </div>
          ) : null}
          <p className="text-xs text-slate-500">
            {selectedArticle
              ? "Article valide selectionne."
              : articleInput
                ? `${filteredArticles.length} article(s) trouve(s) - choisis dans la liste pour continuer.`
                : "Commence a ecrire pour chercher un article existant."}
          </p>
        </label>

        <label className="grid gap-2 text-sm font-semibold text-slate-900">
          <span>Quantite</span>
          <input
            type="number"
            min="1"
            step="0.01"
            value={quantiteInput}
            onChange={(event) => setQuantiteInput(event.target.value)}
            placeholder="Ex: 100"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none"
          />
        </label>

        <div className="flex items-end">
          <button
            type="button"
            onClick={addLine}
            className="w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Ajouter ligne
          </button>
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-semibold">Lignes preparees</p>
        <p className="mt-1">
          {lines.length} ligne(s) | quantite totale :
          <span className="ml-2 font-bold">{totalQuantite}</span>
        </p>
      </div>

      {lines.length === 0 ? (
        <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">
          Aucune ligne ajoutee. Choisis un article existant puis sa quantite.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Article</th>
                <th className="px-4 py-3 font-semibold">Quantite</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={`${line.article}-${index}`} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{line.article}</td>
                  <td className="px-4 py-3 text-slate-600">{line.quantite}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-900 transition hover:bg-red-100"
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-[1.5rem] border border-sky-100 bg-sky-50 p-4 text-sm text-sky-900">
        <p className="font-semibold">Lignes generees automatiquement</p>
        <textarea
          value={serializedLines}
          readOnly
          rows={Math.max(4, lines.length + 1)}
          className="mt-3 w-full rounded-[1.25rem] border border-sky-200 bg-white px-4 py-4 text-sm outline-none"
        />
      </div>
    </div>
  );
}
