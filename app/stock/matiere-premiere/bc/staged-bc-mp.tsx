"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCommandeBcBatchAction } from "./actions";

type PendingLigne = {
  article: string;
  quantite: number;
};

export function StagedBcMp({ articleOptions }: { articleOptions: string[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [articleInput, setArticleInput] = useState("");
  const [quantite, setQuantite] = useState("");
  const [nDoss4d, setNDoss4d] = useState("");
  const [nDossErp, setNDossErp] = useState("");
  const [lignes, setLignes] = useState<PendingLigne[]>([]);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const filteredArticles = useMemo(() => {
    const words = articleInput.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return articleOptions.slice(0, 50);
    return articleOptions.filter((option) => {
      const label = option.toLowerCase();
      return words.every((word) => label.includes(word));
    });
  }, [articleInput, articleOptions]);

  function addLigne() {
    const qty = Number(quantite.replace(",", "."));

    if (!articleInput.trim() || !qty || qty <= 0) {
      setErrorMessage("Choisis un article et une quantite valide avant d'ajouter.");
      return;
    }

    setErrorMessage("");
    setLignes((current) => [...current, { article: articleInput.trim(), quantite: qty }]);
    setArticleInput("");
    setQuantite("");
  }

  function removeLigne(index: number) {
    setLignes((current) => current.filter((_, i) => i !== index));
  }

  function enregistrerCommande() {
    if (lignes.length === 0) {
      setErrorMessage("Ajoute au moins un article avant d'enregistrer.");
      return;
    }

    setMessage("");
    setErrorMessage("");

    const formData = new FormData();
    formData.set("payload", JSON.stringify(lignes));
    formData.set("n_doss_4d", nDoss4d.trim());
    formData.set("n_doss_erp", nDossErp.trim());

    startTransition(async () => {
      try {
        const result = await createCommandeBcBatchAction(formData);
        setMessage(`Commande enregistree sous le code ${result.code}.`);
        setLignes([]);
        setNDoss4d("");
        setNDossErp("");
        router.push(`/stock/matiere-premiere/bc/${result.code}`);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Erreur pendant l'enregistrement.");
      }
    });
  }

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="mb-3 text-lg font-bold text-slate-900">Ajouter des articles</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div>
            <input
              type="text"
              list="bc-article-options"
              autoComplete="off"
              value={articleInput}
              onChange={(event) => setArticleInput(event.target.value)}
              placeholder="Ecrire un article..."
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <datalist id="bc-article-options">
              {filteredArticles.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>
          <input
            type="number"
            step="0.01"
            min="0"
            value={quantite}
            onChange={(event) => setQuantite(event.target.value)}
            placeholder="Quantite"
            className="w-32 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
          <button
            type="button"
            onClick={addLigne}
            className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Ajouter article
          </button>
        </div>
      </div>

      {lignes.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Article</th>
                <th className="px-4 py-3 font-semibold">Quantite</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((ligne, index) => (
                <tr key={`${ligne.article}-${index}`} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{ligne.article}</td>
                  <td className="px-4 py-3 text-slate-600">{ligne.quantite}</td>
                  <td className="px-4 py-3 text-right">
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
      ) : (
        <p className="text-sm text-slate-500">Aucun article ajoute pour le moment.</p>
      )}

      <div>
        <h2 className="mb-3 text-lg font-bold text-slate-900">Dossier</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Doss. 4D
            <input
              type="text"
              value={nDoss4d}
              onChange={(event) => setNDoss4d(event.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Doss. ERP
            <input
              type="text"
              value={nDossErp}
              onChange={(event) => setNDossErp(event.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
            />
          </label>
        </div>
      </div>

      {message ? <p className="text-sm font-semibold text-emerald-700">{message}</p> : null}
      {errorMessage ? <p className="text-sm font-semibold text-red-700">{errorMessage}</p> : null}

      <div>
        <button
          type="button"
          onClick={enregistrerCommande}
          disabled={isPending}
          className="rounded-full bg-sky-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:opacity-60"
        >
          {isPending ? "Enregistrement..." : "Enregistrer commande"}
        </button>
      </div>
    </div>
  );
}
