"use client";

import { useMemo, useState } from "react";
import { matchesArticleSearch } from "@/lib/article-search";
import { DateJmaInput } from "@/app/_components/date-jma-input";

type ArticleOption = { id: number; label: string };

type ExtraLigne = {
  articleId: number;
  articleLabel: string;
  code: string;
  quantite: number;
  dateFabrication: string;
  datePeremption: string;
  chambre: string;
  codePays: string;
};

const fieldClass = "rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none";

// Ligne ajoutee a la main sur un groupe "Entree Production" - pour un
// article qui n'est jamais passe par l'Emballage/Suivi Production (arrivage
// exceptionnel, correction...). Portee en JSON dans un champ cache du MEME
// <form> que les lignes automatiques, pour que "Valider cette entree" les
// enregistre toutes ensemble dans le meme mouvement de stock.
export function ExtraLignesField({ articleOptions }: { articleOptions: ArticleOption[] }) {
  const [lignes, setLignes] = useState<ExtraLigne[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [articleInput, setArticleInput] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<ArticleOption | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [code, setCode] = useState("");
  const [quantite, setQuantite] = useState("");
  const [dateFabrication, setDateFabrication] = useState("");
  const [datePeremption, setDatePeremption] = useState("");
  const [chambre, setChambre] = useState("");
  const [codePays, setCodePays] = useState("");
  const [error, setError] = useState("");

  const filtered = useMemo(
    () => articleOptions.filter((option) => matchesArticleSearch(option.label, articleInput)),
    [articleInput, articleOptions]
  );

  function reset() {
    setArticleInput("");
    setSelectedArticle(null);
    setCode("");
    setQuantite("");
    setDateFabrication("");
    setDatePeremption("");
    setChambre("");
    setCodePays("");
  }

  function addLigne() {
    const qty = Number(quantite.replace(",", "."));
    if (!selectedArticle || !code.trim() || !qty || qty <= 0 || !dateFabrication) {
      setError("Article, code, quantite et date de fabrication sont obligatoires.");
      return;
    }
    setError("");
    setLignes((current) => [
      ...current,
      {
        articleId: selectedArticle.id,
        articleLabel: selectedArticle.label,
        code: code.trim(),
        quantite: qty,
        dateFabrication,
        datePeremption,
        chambre: chambre.trim(),
        codePays: codePays.trim(),
      },
    ]);
    reset();
  }

  function removeLigne(index: number) {
    setLignes((current) => current.filter((_, i) => i !== index));
  }

  // Ce composant n'a pas son propre <form> : il est rendu a l'interieur du
  // <form> "Valider cette entree" du groupe parent. Sans ce garde, la touche
  // Entree dans un champ (ex: recherche article) declenche la soumission du
  // formulaire parent au lieu de juste faire la recherche.
  function preventEnterSubmit(event: React.KeyboardEvent<HTMLDivElement>) {
    const tag = (event.target as HTMLElement).tagName;
    if (event.key === "Enter" && (tag === "INPUT" || tag === "SELECT")) {
      event.preventDefault();
    }
  }

  return (
    <div className="border-t border-slate-100 px-5 py-4" onKeyDown={preventEnterSubmit}>
      <input type="hidden" name="extra_lignes" value={JSON.stringify(lignes)} />

      {lignes.length > 0 ? (
        <div className="mb-3 overflow-hidden rounded-2xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Article (ajoute a la main)</th>
                <th className="px-4 py-2 font-semibold">Code</th>
                <th className="px-4 py-2 font-semibold">Quantite</th>
                <th className="px-4 py-2 font-semibold">Date fabrication</th>
                <th className="px-4 py-2 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((ligne, index) => (
                <tr key={index} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-900">{ligne.articleLabel}</td>
                  <td className="px-4 py-2 text-slate-600">{ligne.code}</td>
                  <td className="px-4 py-2 text-slate-600">{ligne.quantite}</td>
                  <td className="px-4 py-2 text-slate-600">{ligne.dateFabrication}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeLigne(index)}
                      className="text-xs font-semibold text-red-700"
                    >
                      Retirer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {showForm ? (
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          <div className="relative sm:col-span-2">
            <input
              type="text"
              autoComplete="off"
              value={articleInput}
              onChange={(event) => {
                setArticleInput(event.target.value);
                setSelectedArticle(null);
                setShowOptions(true);
              }}
              onFocus={() => setShowOptions(true)}
              onBlur={() => setTimeout(() => setShowOptions(false), 150)}
              placeholder="Ecrire un article..."
              className={`w-full ${fieldClass}`}
            />
            {showOptions && filtered.length > 0 ? (
              <ul className="absolute left-0 top-full z-20 mt-1 max-h-64 w-full min-w-[24rem] max-w-[90vw] overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-[0_18px_40px_rgba(15,23,42,0.15)]">
                {filtered.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setArticleInput(option.label);
                        setSelectedArticle(option);
                        setShowOptions(false);
                      }}
                      className="block w-full whitespace-normal px-4 py-2 text-left text-sm text-slate-800 hover:bg-slate-100"
                    >
                      {option.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <input
            type="text"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Code"
            className={fieldClass}
          />
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={quantite}
            onChange={(event) => setQuantite(event.target.value)}
            placeholder="Quantite"
            className={fieldClass}
          />
          <label className="grid gap-1 text-xs text-slate-500">
            Date fabrication
            <DateJmaInput value={dateFabrication} onChange={setDateFabrication} />
          </label>
          <label className="grid gap-1 text-xs text-slate-500">
            Date peremption
            <DateJmaInput value={datePeremption} onChange={setDatePeremption} />
          </label>
          <input
            type="text"
            value={chambre}
            onChange={(event) => setChambre(event.target.value)}
            placeholder="Chambre"
            className={fieldClass}
          />
          <input
            type="text"
            value={codePays}
            onChange={(event) => setCodePays(event.target.value)}
            placeholder="Code pays"
            className={fieldClass}
          />
          {error ? <p className="text-xs font-semibold text-red-700 sm:col-span-2">{error}</p> : null}
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={addLigne}
              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
            >
              Ajouter cette ligne
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                reset();
                setError("");
              }}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="text-xs font-semibold text-sky-700 underline"
        >
          + Ajouter une ligne
        </button>
      )}
    </div>
  );
}
