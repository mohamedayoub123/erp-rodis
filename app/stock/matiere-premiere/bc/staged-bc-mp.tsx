"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { matchesArticleSearch } from "@/lib/article-search";
import { DateJmaInput } from "@/app/_components/date-jma-input";
import { DEVISE_OPTIONS } from "@/lib/devise-options";
import { createCommandeBcBatchAction } from "./actions";

type PendingLigne = {
  article: string;
  quantite: number;
  prixUnitaire: number | null;
  devise: string;
  tauxChange: number | null;
  // Optionnel - si vide, repli sur le fournisseur "par defaut" saisi une
  // fois pour toute la commande (voir createCommandeBcBatchAction).
  fournisseur: string | null;
};

export function StagedBcMp({
  articleOptions,
  canVoirPrix,
}: {
  articleOptions: string[];
  canVoirPrix: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [articleInput, setArticleInput] = useState("");
  const [showArticleOptions, setShowArticleOptions] = useState(false);
  const [quantite, setQuantite] = useState("");
  const [prixUnitaire, setPrixUnitaire] = useState("");
  const [devise, setDevise] = useState("FCFA");
  const [tauxChange, setTauxChange] = useState("");
  const [fournisseurLigne, setFournisseurLigne] = useState("");
  const [dateCommande, setDateCommande] = useState("");
  const [nDoss4d, setNDoss4d] = useState("");
  const [nDossErp, setNDossErp] = useState("");
  const [fournisseur, setFournisseur] = useState("");
  const [lignes, setLignes] = useState<PendingLigne[]>([]);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const totalQuantite = lignes.reduce((sum, ligne) => sum + ligne.quantite, 0);

  // Recherche multi-mots (meme logique que le reste de l'appli) sans
  // plafond sur le nombre de resultats - un plafond cachait des articles
  // reels a la recherche vide comme a la recherche filtree.
  const filteredArticles = useMemo(
    () => articleOptions.filter((option) => matchesArticleSearch(option, articleInput)),
    [articleInput, articleOptions]
  );

  function selectArticle(option: string) {
    setArticleInput(option);
    setShowArticleOptions(false);
  }

  function addLigne() {
    const qty = Number(quantite.replace(",", "."));
    const prixTrim = prixUnitaire.trim().replace(",", ".");
    const prix = prixTrim ? Number(prixTrim) : null;
    const tauxTrim = tauxChange.trim().replace(",", ".");
    const taux = tauxTrim ? Number(tauxTrim) : null;

    if (!articleInput.trim() || !qty || qty <= 0) {
      setErrorMessage("Choisis un article et une quantite valide avant d'ajouter.");
      return;
    }

    if (prixTrim && (prix === null || Number.isNaN(prix) || prix < 0)) {
      setErrorMessage("Prix unitaire invalide.");
      return;
    }

    if (prix !== null && devise !== "FCFA" && (taux === null || Number.isNaN(taux) || taux <= 0)) {
      setErrorMessage("Taux de change invalide.");
      return;
    }

    setErrorMessage("");
    setLignes((current) => [
      ...current,
      {
        article: articleInput.trim(),
        quantite: qty,
        prixUnitaire: prix,
        devise,
        tauxChange: devise !== "FCFA" ? taux : null,
        fournisseur: fournisseurLigne.trim() || null,
      },
    ]);
    setArticleInput("");
    setQuantite("");
    setPrixUnitaire("");
    setDevise("FCFA");
    setTauxChange("");
    setFournisseurLigne("");
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
    formData.set("date_jour", dateCommande);
    formData.set("fournisseur", fournisseur.trim());

    startTransition(async () => {
      try {
        const result = await createCommandeBcBatchAction(formData);
        setMessage(`Commande enregistree sous le code ${result.code}.`);
        setLignes([]);
        setNDoss4d("");
        setNDossErp("");
        setDateCommande("");
        setFournisseur("");
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
        <div
          className={`grid gap-3 ${
            canVoirPrix ? "sm:grid-cols-[1fr_auto_auto_auto_auto]" : "sm:grid-cols-[1fr_auto_auto_auto]"
          }`}
        >
          <div className="relative">
            <input
              type="text"
              autoComplete="off"
              value={articleInput}
              onChange={(event) => {
                setArticleInput(event.target.value);
                setShowArticleOptions(true);
              }}
              onFocus={() => setShowArticleOptions(true)}
              onBlur={() => {
                // Delai court pour laisser le clic sur une option s'executer
                // avant que la liste ne se ferme (onBlur arrive avant onClick).
                setTimeout(() => setShowArticleOptions(false), 150);
              }}
              placeholder="Ecrire un article..."
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            {showArticleOptions && filteredArticles.length > 0 ? (
              <ul className="absolute left-0 top-full z-20 mt-1 max-h-72 w-full min-w-[28rem] max-w-[90vw] overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-[0_18px_40px_rgba(15,23,42,0.15)]">
                {filteredArticles.map((option) => (
                  <li key={option}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectArticle(option)}
                      className="block w-full whitespace-normal px-4 py-2 text-left text-sm text-slate-800 hover:bg-slate-100"
                    >
                      {option}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
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
          {canVoirPrix ? (
            <input
              type="number"
              step="0.01"
              min="0"
              value={prixUnitaire}
              onChange={(event) => setPrixUnitaire(event.target.value)}
              placeholder="Prix unitaire"
              className="w-36 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
          ) : null}
          <input
            type="text"
            value={fournisseurLigne}
            onChange={(event) => setFournisseurLigne(event.target.value)}
            placeholder="Fournisseur (vide = celui du bas)"
            className="w-56 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
          <button
            type="button"
            onClick={addLigne}
            className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Ajouter article
          </button>
        </div>
        {canVoirPrix ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={devise}
              onChange={(event) => setDevise(event.target.value)}
              className="rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
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
                value={tauxChange}
                onChange={(event) => setTauxChange(event.target.value)}
                placeholder={`Taux (1 ${devise} = ? FCFA)`}
                className="w-44 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {lignes.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Article</th>
                <th className="px-4 py-3 font-semibold">Quantite</th>
                {canVoirPrix ? <th className="px-4 py-3 font-semibold">Prix unitaire</th> : null}
                <th className="px-4 py-3 font-semibold">Fournisseur</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((ligne, index) => (
                <tr key={`${ligne.article}-${index}`} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{ligne.article}</td>
                  <td className="px-4 py-3 text-slate-600">{ligne.quantite}</td>
                  {canVoirPrix ? (
                    <td className="px-4 py-3 text-slate-600">
                      {ligne.prixUnitaire != null
                        ? `${ligne.prixUnitaire}${ligne.devise !== "FCFA" ? ` ${ligne.devise}` : ""}`
                        : "-"}
                    </td>
                  ) : null}
                  <td className="px-4 py-3 text-slate-600">
                    {ligne.fournisseur || <span className="text-slate-400">(celui du bas)</span>}
                  </td>
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
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td className="px-4 py-3 font-semibold text-slate-900">Total</td>
                <td className="px-4 py-3 font-semibold text-slate-900">{totalQuantite}</td>
                {canVoirPrix ? <td></td> : null}
                <td></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Aucun article ajoute pour le moment.</p>
      )}

      <div>
        <h2 className="mb-3 text-lg font-bold text-slate-900">Dossier</h2>
        <div className="grid gap-3 sm:grid-cols-3">
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
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Fournisseur par defaut
            <input
              type="text"
              value={fournisseur}
              onChange={(event) => setFournisseur(event.target.value)}
              placeholder="Utilise pour les articles sans fournisseur precise plus haut"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
            />
          </label>
        </div>
        <label className="mt-3 grid gap-1 text-xs font-semibold text-slate-500">
          Date de la commande (par defaut : aujourd&apos;hui)
          <DateJmaInput value={dateCommande} onChange={setDateCommande} />
        </label>
      </div>

      {message ? <p className="text-sm font-semibold text-emerald-700">{message}</p> : null}
      {errorMessage ? <p className="text-sm font-semibold text-red-700">{errorMessage}</p> : null}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={enregistrerCommande}
          disabled={isPending}
          className="rounded-full bg-sky-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:opacity-60"
        >
          {isPending ? "Enregistrement..." : "Enregistrer commande"}
        </button>
        {lignes.length > 0 ? (
          <p className="text-sm font-semibold text-slate-700">
            Total : {totalQuantite} ({lignes.length} article{lignes.length > 1 ? "s" : ""})
          </p>
        ) : null}
      </div>
    </div>
  );
}
