"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { matchesArticleSearch } from "@/lib/article-search";
import { formatDate } from "@/lib/format-date";
import type { CodeOption } from "./fifo-code-picker";

type ArticleOption = { value: string; label: string };

// Meme principe que FifoCodePicker (code choisi dans une liste qui n'a
// que du stock > 0, date auto), mais ici l'article n'est pas fixe - donc
// pas de <form> HTML classique : useTransition + FormData manuelle, pour
// pouvoir reconstruire la liste de codes des que l'article choisi change.
//
// Les codes disponibles ET la liste des articles sont recuperes A LA
// DEMANDE (au montage de ce composant, qui n'a lieu qu'a la premiere
// ouverture de la section grace a LazyDetails) - avant, la page commande
// precalculait la liste des ~920 articles du systeme et la serialisait a
// CHAQUE ouverture de commande, meme si cette section repliee par defaut
// n'etait jamais utilisee (part significative du temps de rendu observe en
// production).
export function FifoAddLigneForm({
  commandeId,
  defaultPreparateur,
  addAction,
  fetchCodesAction,
  fetchArticlesAction,
}: {
  commandeId: number;
  defaultPreparateur: string;
  addAction: (formData: FormData) => Promise<{ error: string } | void>;
  fetchCodesAction: (articleId: number, commandeId: number) => Promise<CodeOption[]>;
  fetchArticlesAction: () => Promise<ArticleOption[]>;
}) {
  const codeListId = useId();
  const [articles, setArticles] = useState<ArticleOption[]>([]);
  const [articleInput, setArticleInput] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<ArticleOption | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [code, setCode] = useState("");
  const [quantite, setQuantite] = useState("");
  const [preparateur, setPreparateur] = useState(defaultPreparateur);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [codes, setCodes] = useState<CodeOption[]>([]);
  const [isLoadingCodes, setIsLoadingCodes] = useState(false);

  useEffect(() => {
    fetchArticlesAction().then(setArticles);
  }, [fetchArticlesAction]);

  const filtered = useMemo(
    () => articles.filter((option) => matchesArticleSearch(option.label, articleInput)),
    [articleInput, articles]
  );

  const selectedCodeOption = codes.find((option) => option.code.toUpperCase() === code.toUpperCase());
  const filteredCodes = useMemo(() => {
    const query = code.trim();
    if (!query) return codes;
    return codes.filter((option) => matchesArticleSearch(option.code, query));
  }, [code, codes]);

  function preventEnterSubmit(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") event.preventDefault();
  }

  function selectArticle(article: ArticleOption) {
    setArticleInput(article.label);
    setSelectedArticle(article);
    setShowOptions(false);
    setCode("");
    setCodes([]);
    setError("");
    setIsLoadingCodes(true);
    fetchCodesAction(Number(article.value), commandeId)
      .then((fetchedCodes) => {
        setCodes(fetchedCodes);
        setCode(fetchedCodes[0]?.code ?? "");
      })
      .catch(() => setError("Impossible de charger les codes disponibles."))
      .finally(() => setIsLoadingCodes(false));
  }

  function handleSubmit() {
    if (!selectedArticle) {
      setError("Choisis d'abord un produit.");
      return;
    }
    if (!code) {
      setError("Choisis un code (aucun code en stock pour ce produit).");
      return;
    }
    const qty = Number(quantite.replace(",", "."));
    if (!qty || qty <= 0) {
      setError("Quantite invalide.");
      return;
    }
    setError("");

    const formData = new FormData();
    formData.set("commande_id", String(commandeId));
    formData.set("article_id", selectedArticle.value);
    formData.set("numero_lot", code);
    formData.set("preparateur", preparateur);
    formData.set("quantite_chargee", String(qty));

    startTransition(async () => {
      let result: { error: string } | void;
      try {
        result = await addAction(formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
        return;
      }
      if (result?.error) {
        setError(result.error);
        return;
      }
      setArticleInput("");
      setSelectedArticle(null);
      setCode("");
      setQuantite("");
    });
  }

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-4">
      <div className="relative sm:col-span-2">
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Produit
          <input
            type="text"
            value={articleInput}
            onChange={(event) => {
              setArticleInput(event.target.value);
              setSelectedArticle(null);
              setCode("");
              setShowOptions(true);
            }}
            onFocus={() => setShowOptions(true)}
            onBlur={() => setTimeout(() => setShowOptions(false), 150)}
            onKeyDown={preventEnterSubmit}
            placeholder="Chercher un produit..."
            autoComplete="off"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
          />
        </label>
        {showOptions && filtered.length > 0 ? (
          <ul className="absolute left-0 top-full z-20 mt-1 max-h-64 w-full min-w-[20rem] max-w-[90vw] overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-[0_18px_40px_rgba(15,23,42,0.15)]">
            {filtered.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectArticle(option)}
                  className="block w-full whitespace-normal px-4 py-2 text-left text-sm text-slate-800 hover:bg-slate-100"
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <label className="grid gap-1 text-xs font-semibold text-slate-500">
        Code (stock &gt; 0)
        <input
          list={codeListId}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={preventEnterSubmit}
          disabled={!selectedArticle || isLoadingCodes}
          placeholder="Taper le code..."
          autoComplete="off"
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none disabled:bg-slate-50"
        />
        <datalist id={codeListId}>
          {filteredCodes.map((option) => (
            <option key={option.code} value={option.code}>
              {`${option.quantite} disponible`}
            </option>
          ))}
        </datalist>
        <span className="text-xs text-slate-500">
          {!selectedArticle
            ? ""
            : isLoadingCodes
              ? "Chargement des codes disponibles..."
              : codes.length === 0
                ? "Aucun code en stock pour ce produit."
                : selectedCodeOption
                  ? `${selectedCodeOption.quantite} dispo - Date fab. : ${formatDate(selectedCodeOption.dateFabrication)}`
                  : "Code inconnu ou stock epuise."}
        </span>
      </label>

      <label className="grid gap-1 text-xs font-semibold text-slate-500">
        Qt a charger
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={quantite}
          onChange={(event) => setQuantite(event.target.value)}
          onKeyDown={preventEnterSubmit}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-sky-700 outline-none"
        />
      </label>

      <label className="grid gap-1 text-xs font-semibold text-slate-500">
        Preparateur
        <input
          type="text"
          value={preparateur}
          onChange={(event) => setPreparateur(event.target.value)}
          onKeyDown={preventEnterSubmit}
          placeholder="Preparateur"
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
        />
      </label>

      {error ? <p className="text-xs font-semibold text-red-700 sm:col-span-4">{error}</p> : null}

      <div className="sm:col-span-4">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || isLoadingCodes}
          className="rounded-full bg-sky-700 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isPending ? "Ajout..." : "Ajouter la ligne"}
        </button>
      </div>
    </div>
  );
}
