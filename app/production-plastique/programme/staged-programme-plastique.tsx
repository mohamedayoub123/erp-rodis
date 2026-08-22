"use client";

import { useMemo, useState, useTransition } from "react";
import { useComboboxNav } from "@/app/_components/use-combobox-nav";
import { matchesArticleSearch } from "@/lib/article-search";
import { saveProgrammePlastiqueAction } from "../actions";

export type ArticlePlastiqueOption = {
  id: number;
  label: string;
};

export type DepotOption = {
  id: number;
  label: string;
};

type PendingLigne = {
  article_id: number;
  article_label: string;
  quantite: number;
  numero_lot: string;
};

export function StagedProgrammePlastique({
  articles,
  depots,
  depotSourceDefault,
  depotDestinationDefault,
}: {
  articles: ArticlePlastiqueOption[];
  depots: DepotOption[];
  depotSourceDefault: number;
  depotDestinationDefault: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [articleInput, setArticleInput] = useState("");
  const [showArticleDropdown, setShowArticleDropdown] = useState(false);
  const [quantite, setQuantite] = useState("");
  const [numeroLot, setNumeroLot] = useState("");
  const [depotSourceId, setDepotSourceId] = useState(String(depotSourceDefault));
  const [depotDestinationId, setDepotDestinationId] = useState(String(depotDestinationDefault));
  const [rows, setRows] = useState<PendingLigne[]>([]);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const selectedArticle = useMemo(
    () => articles.find((article) => article.label === articleInput) ?? null,
    [articleInput, articles]
  );

  const filteredArticles = useMemo(() => {
    if (!articleInput.trim()) return articles;
    return articles.filter((article) => matchesArticleSearch(article.label, articleInput));
  }, [articleInput, articles]);

  function selectArticle(article: ArticlePlastiqueOption) {
    setArticleInput(article.label);
    setShowArticleDropdown(false);
  }

  const articleNav = useComboboxNav(filteredArticles, selectArticle);

  function addRow() {
    const qty = Number(quantite.replace(",", "."));

    if (!selectedArticle) {
      setMessage("");
      setErrorMessage("Article introuvable - choisis-le dans la liste qui s'affiche.");
      return;
    }
    if (!qty || qty <= 0) {
      setMessage("");
      setErrorMessage("Quantite invalide.");
      return;
    }

    setMessage("");
    setErrorMessage("");

    setRows((current) => [
      ...current,
      {
        article_id: selectedArticle.id,
        article_label: selectedArticle.label,
        quantite: qty,
        numero_lot: numeroLot.trim(),
      },
    ]);

    setArticleInput("");
    setQuantite("");
    setNumeroLot("");
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  const depotSourceLabel = depots.find((d) => String(d.id) === depotSourceId)?.label || `Depot #${depotSourceId}`;
  const depotDestinationLabel =
    depots.find((d) => String(d.id) === depotDestinationId)?.label || `Depot #${depotDestinationId}`;

  function save() {
    if (rows.length === 0) return;

    setMessage("");
    setErrorMessage("");

    const formData = new FormData();
    formData.set("depot_source_id", depotSourceId);
    formData.set("depot_destination_id", depotDestinationId);
    formData.set(
      "payload",
      JSON.stringify(rows.map((row) => ({ article_id: row.article_id, quantite: row.quantite, numero_lot: row.numero_lot })))
    );

    startTransition(async () => {
      try {
        await saveProgrammePlastiqueAction(formData);
        setRows([]);
        setMessage(
          `Programme enregistre : stock entre dans ${depotSourceLabel} puis transfere vers ${depotDestinationLabel}.`
        );
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Erreur pendant l'enregistrement.");
      }
    });
  }

  return (
    <section className="rounded-[2rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <h2 className="text-2xl font-black text-slate-900">Ajouter un programme</h2>
      <p className="mt-2 text-sm text-slate-600">
        Article fabrique en interne + quantite (lot optionnel). A l&apos;enregistrement, le stock entre dans le
        depot source (prix calcule automatiquement depuis la recette) puis part directement vers le depot
        destination.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-slate-900">
          <span>Depot source</span>
          <select
            value={depotSourceId}
            onChange={(event) => setDepotSourceId(event.target.value)}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none"
          >
            {depots.map((depot) => (
              <option key={depot.id} value={depot.id}>
                {depot.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-900">
          <span>Depot destination</span>
          <select
            value={depotDestinationId}
            onChange={(event) => setDepotDestinationId(event.target.value)}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none"
          >
            {depots.map((depot) => (
              <option key={depot.id} value={depot.id}>
                {depot.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto_auto]">
        <label className="relative grid gap-2 text-sm font-semibold text-slate-900">
          <span>Article</span>
          <input
            value={articleInput}
            onChange={(event) => {
              setArticleInput(event.target.value);
              setShowArticleDropdown(true);
              articleNav.setHighlightedIndex(0);
            }}
            onKeyDown={articleNav.handleKeyDown}
            onFocus={() => setShowArticleDropdown(true)}
            onBlur={() => setTimeout(() => setShowArticleDropdown(false), 150)}
            placeholder="Ecris puis choisis (fleches + Entree)"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none"
            autoComplete="off"
          />
          {showArticleDropdown && filteredArticles.length > 0 ? (
            <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
              {filteredArticles.map((article, index) => (
                <button
                  key={article.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectArticle(article)}
                  className={`block w-full px-4 py-2 text-left text-sm text-slate-800 ${
                    index === articleNav.highlightedIndex ? "bg-slate-100" : "hover:bg-slate-100"
                  }`}
                >
                  {article.label}
                </button>
              ))}
            </div>
          ) : null}
        </label>

        <label className="grid gap-2 text-sm font-semibold text-slate-900">
          <span>Quantite</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={quantite}
            onChange={(event) => setQuantite(event.target.value)}
            placeholder="Qte"
            className="w-32 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
        </label>

        <label className="grid gap-2 text-sm font-semibold text-slate-900">
          <span>Lot (optionnel)</span>
          <input
            type="text"
            value={numeroLot}
            onChange={(event) => setNumeroLot(event.target.value)}
            placeholder="Auto si vide"
            className="w-40 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={addRow}
        className="mt-4 rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
      >
        Ajouter la ligne
      </button>

      <div className="mt-6 rounded-[1.5rem] border border-slate-100 bg-slate-50 p-4">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Lignes a enregistrer</p>

        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Aucune ligne pour le moment.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Article</th>
                  <th className="px-3 py-2 font-semibold">Qte</th>
                  <th className="px-3 py-2 font-semibold">Lot</th>
                  <th className="px-3 py-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.article_id}-${index}`} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold text-slate-900">{row.article_label}</td>
                    <td className="px-3 py-2 text-slate-700">{row.quantite}</td>
                    <td className="px-3 py-2 text-slate-700">{row.numero_lot || "-"}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-900"
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
      </div>

      {errorMessage ? (
        <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{errorMessage}</p>
      ) : null}

      {message ? (
        <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</p>
      ) : null}

      <div className="mt-4">
        <button
          type="button"
          onClick={save}
          disabled={rows.length === 0 || isPending}
          className={`rounded-full px-5 py-3 text-sm font-semibold text-white ${
            rows.length === 0 || isPending ? "cursor-not-allowed bg-slate-300" : "bg-slate-950 transition hover:bg-slate-800"
          }`}
        >
          {isPending ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </section>
  );
}
