"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createEntreeStockBatchAction,
  createSortieStockBatchAction,
} from "./actions";
import { DateJmaInput } from "@/app/_components/date-jma-input";
import { useComboboxNav } from "@/app/_components/use-combobox-nav";
import { matchesArticleSearch } from "@/lib/article-search";
import { formatDate } from "@/lib/format-date";

export type ArticleOption = {
  id: number;
  label: string;
};

export type LotBatchOption = {
  id: number;
  dateFabrication: string;
};

export type LotOption = {
  id: number;
  articleId: number;
  articleLabel: string;
  numeroLot: string;
  chambre: string;
  codePays: string;
  datePeremption: string;
  stock: number;
  batches: LotBatchOption[];
};

type PendingEntree = {
  article_id: number;
  article_label: string;
  numero_lot: string;
  date_fabrication: string;
  date_peremption: string;
  quantite: number;
  chambre: string;
  code_pays: string;
  note: string;
};

type PendingSortie = {
  lot_id: number;
  lot_label: string;
  quantite: number;
  code: string;
  livre_pour: string;
  numero_bl: string;
  preparateur: string;
  remarque: string;
  numero_proforma: string;
};

export function EntreePanel({
  articles,
  onLotsCreated,
}: {
  articles: ArticleOption[];
  onLotsCreated: React.Dispatch<React.SetStateAction<LotOption[]>>;
}) {
  const [isPending, startTransition] = useTransition();
  const [articleInput, setArticleInput] = useState("");
  const [showArticleDropdown, setShowArticleDropdown] = useState(false);
  const [numeroLot, setNumeroLot] = useState("");
  const [dateFabrication, setDateFabrication] = useState("");
  const [datePeremption, setDatePeremption] = useState("");
  const [quantite, setQuantite] = useState("");
  const [chambre, setChambre] = useState("");
  const [codePays, setCodePays] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<PendingEntree[]>([]);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const selectedArticle = useMemo(
    () => articles.find((article) => article.label === articleInput) ?? null,
    [articleInput, articles]
  );

  // Pas de plafond : limiter le catalogue quand le champ est vide cachait
  // la grande majorite des articles des qu'on ouvrait la liste sans avoir
  // encore tape de recherche.
  const filteredArticles = useMemo(() => {
    if (!articleInput.trim()) return articles;
    return articles.filter((article) => matchesArticleSearch(article.label, articleInput));
  }, [articleInput, articles]);

  function selectArticle(article: ArticleOption) {
    setArticleInput(article.label);
    setShowArticleDropdown(false);
  }

  const articleNav = useComboboxNav(filteredArticles, selectArticle);

  function addRow() {
    const qty = Number(quantite.replace(",", "."));

    if (!selectedArticle || !numeroLot.trim() || !dateFabrication || !qty || qty <= 0) {
      return;
    }

    setMessage("");
    setErrorMessage("");

    setRows((current) => [
      ...current,
      {
        article_id: selectedArticle.id,
        article_label: selectedArticle.label,
        numero_lot: numeroLot.trim(),
        date_fabrication: dateFabrication,
        date_peremption: datePeremption,
        quantite: qty,
        chambre: chambre.trim(),
        code_pays: codePays.trim(),
        note: note.trim(),
      },
    ]);

    setArticleInput("");
    setNumeroLot("");
    setDateFabrication("");
    setDatePeremption("");
    setQuantite("");
    setChambre("");
    setCodePays("");
    setNote("");
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function approveRows() {
    if (rows.length === 0) return;

    setMessage("");
    setErrorMessage("");

    const formData = new FormData();
    formData.set("payload", payload);

    startTransition(async () => {
      try {
        await createEntreeStockBatchAction(formData);
        onLotsCreated((currentLots) => [
          ...rows.map((row, index) => {
            const fakeId = -(Date.now() + index);
            return {
              id: fakeId,
              articleId: row.article_id,
              articleLabel: row.article_label,
              numeroLot: row.numero_lot,
              chambre: row.chambre,
              codePays: row.code_pays,
              datePeremption: row.date_peremption,
              stock: row.quantite,
              batches: [{ id: fakeId, dateFabrication: row.date_fabrication }],
            };
          }),
          ...currentLots,
        ]);
        setRows([]);
        setMessage("Entree enregistree dans le stock.");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Erreur pendant l'approbation.");
      }
    });
  }

  const payload = JSON.stringify(
    rows.map((row) => ({
      article_id: row.article_id,
      numero_lot: row.numero_lot,
      date_fabrication: row.date_fabrication,
      date_peremption: row.date_peremption,
      quantite: row.quantite,
      chambre: row.chambre,
      code_pays: row.code_pays,
      note: row.note,
    }))
  );

  return (
    <section className="rounded-[2rem] border border-emerald-200 bg-white p-5 shadow-[0_18px_40px_rgba(16,185,129,0.08)]">
      <h2 className="text-2xl font-black text-emerald-900">Entrer stock</h2>

      <div className="mt-4 grid gap-4">
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
            placeholder="Ecris l'article puis choisis (fleches + Entree)"
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

        <div className="grid gap-4 md:grid-cols-2">
          <input
            type="text"
            value={numeroLot}
            onChange={(event) => setNumeroLot(event.target.value)}
            placeholder="Numero lot"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Date fabrication
            <DateJmaInput value={dateFabrication} onChange={setDateFabrication} />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Date d&apos;expiration
            <DateJmaInput value={datePeremption} onChange={setDatePeremption} />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={quantite}
            onChange={(event) => setQuantite(event.target.value)}
            placeholder="Quantite"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
          <input
            type="text"
            value={chambre}
            onChange={(event) => setChambre(event.target.value)}
            placeholder="Chambre"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
          <input
            type="text"
            value={codePays}
            onChange={(event) => setCodePays(event.target.value)}
            placeholder="Code pays"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
        </div>

        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          placeholder="Note"
          className="rounded-[1.5rem] border border-slate-200 px-4 py-3 text-sm outline-none"
        />

        <button
          type="button"
          onClick={addRow}
          className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600"
        >
          Valider entree
        </button>
      </div>

      <div className="mt-6 rounded-[1.5rem] border border-emerald-100 bg-emerald-50 p-4">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-800">
          Liste a controler
        </p>

        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-emerald-900/70">Aucune entree validee pour le moment.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="text-emerald-900/70">
                <tr>
                  <th className="px-3 py-2 font-semibold">Article</th>
                  <th className="px-3 py-2 font-semibold">Qt</th>
                  <th className="px-3 py-2 font-semibold">Date fab.</th>
                  <th className="px-3 py-2 font-semibold">Date exp.</th>
                  <th className="px-3 py-2 font-semibold">Code</th>
                  <th className="px-3 py-2 font-semibold">Pays</th>
                  <th className="px-3 py-2 font-semibold">Chambre</th>
                  <th className="px-3 py-2 font-semibold">Note</th>
                  <th className="px-3 py-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.article_id}-${row.numero_lot}-${index}`} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold text-slate-900">{row.article_label}</td>
                    <td className="px-3 py-2 text-slate-700">{row.quantite}</td>
                    <td className="px-3 py-2 text-slate-700">{row.date_fabrication}</td>
                    <td className="px-3 py-2 text-slate-700">{row.date_peremption || "-"}</td>
                    <td className="px-3 py-2 text-slate-700">{row.numero_lot}</td>
                    <td className="px-3 py-2 text-slate-700">{row.code_pays || "-"}</td>
                    <td className="px-3 py-2 text-slate-700">{row.chambre || "-"}</td>
                    <td className="px-3 py-2 text-slate-700">{row.note || "-"}</td>
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
        <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {errorMessage}
        </p>
      ) : null}

      {message ? (
        <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {message}
        </p>
      ) : null}

      <div className="mt-4">
        <button
          type="button"
          onClick={approveRows}
          disabled={rows.length === 0 || isPending}
          className={`rounded-full px-5 py-3 text-sm font-semibold text-white ${
            rows.length === 0 || isPending
              ? "cursor-not-allowed bg-slate-300"
              : "bg-slate-950 transition hover:bg-slate-800"
          }`}
        >
          {isPending ? "Approbation..." : "Approuver entree"}
        </button>
      </div>
    </section>
  );
}

export function SortiePanel({
  lots,
  onLotsUpdated,
}: {
  lots: LotOption[];
  onLotsUpdated: React.Dispatch<React.SetStateAction<LotOption[]>>;
}) {
  const [isPending, startTransition] = useTransition();
  const [articleInput, setArticleInput] = useState("");
  const [showArticleDropdown, setShowArticleDropdown] = useState(false);
  const [selectedCode, setSelectedCode] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [quantite, setQuantite] = useState("");
  const [code, setCode] = useState("");
  const [livrePour, setLivrePour] = useState("");
  const [numeroBl, setNumeroBl] = useState("");
  const [preparateur, setPreparateur] = useState("");
  const [remarque, setRemarque] = useState("");
  const [numeroProforma, setNumeroProforma] = useState("");
  const [rows, setRows] = useState<PendingSortie[]>([]);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // 3 listes en cascade (Article -> Code -> Date de fabrication) plutot
  // qu'une seule recherche combinee : computeAvailableLots regroupe deja
  // les lots par article+code, mais collapsait auparavant les dates de
  // fabrication differentes d'un meme code sur une seule (la plus recente)
  // sans le dire - ici chaque etape ne propose que ce qui existe reellement
  // ET a du stock.
  const articleOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const lot of lots) {
      if (!seen.has(lot.articleId)) seen.set(lot.articleId, lot.articleLabel);
    }
    return [...seen.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [lots]);

  const selectedArticle = useMemo(
    () => articleOptions.find((article) => article.label === articleInput) ?? null,
    [articleInput, articleOptions]
  );

  const filteredArticles = useMemo(() => {
    if (!articleInput.trim()) return articleOptions;
    return articleOptions.filter((article) => matchesArticleSearch(article.label, articleInput));
  }, [articleInput, articleOptions]);

  function selectArticle(article: { id: number; label: string }) {
    setArticleInput(article.label);
    setShowArticleDropdown(false);
    setSelectedCode("");
    setSelectedBatchId(null);
  }

  const articleNav = useComboboxNav(filteredArticles, selectArticle);

  const codesForArticle = useMemo(
    () => (selectedArticle ? lots.filter((lot) => lot.articleId === selectedArticle.id) : []),
    [selectedArticle, lots]
  );

  const selectedLotOption = useMemo(
    () => codesForArticle.find((lot) => lot.numeroLot === selectedCode) ?? null,
    [codesForArticle, selectedCode]
  );

  const selectedBatch = useMemo(
    () => selectedLotOption?.batches.find((batch) => batch.id === selectedBatchId) ?? null,
    [selectedLotOption, selectedBatchId]
  );

  function selectCode(value: string) {
    setSelectedCode(value);
    const lot = codesForArticle.find((current) => current.numeroLot === value);
    setSelectedBatchId(lot?.batches[0]?.id ?? null);
  }

  function addRow() {
    const qty = Number(quantite.replace(",", "."));

    if (!selectedLotOption || !selectedBatch || !qty || qty <= 0) {
      return;
    }

    setMessage("");
    setErrorMessage("");

    setRows((current) => [
      ...current,
      {
        lot_id: selectedBatch.id,
        lot_label: `${selectedLotOption.articleLabel} | ${selectedLotOption.numeroLot} | fab. ${formatDate(
          selectedBatch.dateFabrication
        )}`,
        quantite: qty,
        code: code.trim(),
        livre_pour: livrePour.trim(),
        numero_bl: numeroBl.trim(),
        preparateur: preparateur.trim(),
        remarque: remarque.trim(),
        numero_proforma: numeroProforma.trim(),
      },
    ]);

    setArticleInput("");
    setSelectedCode("");
    setSelectedBatchId(null);
    setQuantite("");
    setCode("");
    setLivrePour("");
    setNumeroBl("");
    setPreparateur("");
    setRemarque("");
    setNumeroProforma("");
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function approveRows() {
    if (rows.length === 0) return;

    setMessage("");
    setErrorMessage("");

    const formData = new FormData();
    formData.set("payload", payload);

    startTransition(async () => {
      try {
        await createSortieStockBatchAction(formData);
        onLotsUpdated((currentLots) => {
          const qtyByLot = new Map<number, number>();

          for (const row of rows) {
            qtyByLot.set(row.lot_id, (qtyByLot.get(row.lot_id) ?? 0) + row.quantite);
          }

          return currentLots
            .map((lot) => {
              // Le solde restant reste au niveau du GROUPE (article+code),
              // pas d'un batch precis - la sortie choisit quelle date
              // fabrication tamponner sur la note, mais consomme toujours le
              // meme stock partage. lot.id est deja l'un des batch ids (le
              // plus recent) - dedupe pour ne pas compter cette quantite
              // deux fois.
              const idsToCheck = new Set([lot.id, ...lot.batches.map((batch) => batch.id)]);
              const qty = [...idsToCheck].reduce((sum, id) => sum + (qtyByLot.get(id) ?? 0), 0);
              if (!qty) {
                return lot;
              }

              return {
                ...lot,
                stock: Math.max(0, Number(lot.stock) - qty),
              };
            })
            .filter((lot) => lot.stock > 0);
        });
        setRows([]);
        setMessage("Sortie enregistree dans le stock.");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Erreur pendant l'approbation.");
      }
    });
  }

  const payload = JSON.stringify(
    rows.map((row) => ({
      lot_id: row.lot_id,
      quantite: row.quantite,
      code: row.code,
      livre_pour: row.livre_pour,
      numero_bl: row.numero_bl,
      preparateur: row.preparateur,
      remarque: row.remarque,
      numero_proforma: row.numero_proforma,
    }))
  );

  return (
    <section className="rounded-[2rem] border border-sky-200 bg-white p-5 shadow-[0_18px_40px_rgba(14,165,233,0.08)]">
      <h2 className="text-2xl font-black text-sky-900">Sortie stock</h2>

      <div className="mt-4 grid gap-4">
        <label className="relative grid gap-2 text-sm font-semibold text-slate-900">
          <span>Article</span>
          <input
            value={articleInput}
            onChange={(event) => {
              setArticleInput(event.target.value);
              setShowArticleDropdown(true);
              setSelectedCode("");
              setSelectedBatchId(null);
              articleNav.setHighlightedIndex(0);
            }}
            onKeyDown={articleNav.handleKeyDown}
            onFocus={() => setShowArticleDropdown(true)}
            onBlur={() => setTimeout(() => setShowArticleDropdown(false), 150)}
            placeholder="Ecris l'article puis choisis (fleches + Entree)"
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

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Code (seulement ceux qui ont du stock)
            <select
              value={selectedCode}
              onChange={(event) => selectCode(event.target.value)}
              disabled={!selectedArticle}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal normal-case text-slate-900 outline-none disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">
                {selectedArticle ? "Choisis un code" : "Choisis d'abord un article"}
              </option>
              {codesForArticle.map((lot) => (
                <option key={lot.numeroLot} value={lot.numeroLot}>
                  {lot.numeroLot} (restant {lot.stock})
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Date de fabrication
            <select
              value={selectedBatchId ?? ""}
              onChange={(event) => setSelectedBatchId(Number(event.target.value) || null)}
              disabled={!selectedLotOption}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal normal-case text-slate-900 outline-none disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">
                {selectedLotOption ? "Choisis une date" : "Choisis d'abord un code"}
              </option>
              {(selectedLotOption?.batches ?? []).map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {formatDate(batch.dateFabrication)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedLotOption ? (
          <p className="text-xs font-semibold text-slate-500">
            Date d&apos;expiration : {selectedLotOption.datePeremption || "non renseignee"} (reprise
            automatiquement du lot, pas modifiable ici)
          </p>
        ) : null}

        <input
          type="number"
          min="0.01"
          step="0.01"
          value={quantite}
          onChange={(event) => setQuantite(event.target.value)}
          placeholder="Quantite sortie"
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
        />

        <div className="grid gap-4 md:grid-cols-4">
          <input
            type="text"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Code (reference sortie)"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
          <input
            type="text"
            value={livrePour}
            onChange={(event) => setLivrePour(event.target.value)}
            placeholder="Livre pour qui"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
          <input
            type="text"
            value={numeroBl}
            onChange={(event) => setNumeroBl(event.target.value)}
            placeholder="Numero BL"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
          <input
            type="text"
            value={numeroProforma}
            onChange={(event) => setNumeroProforma(event.target.value)}
            placeholder="Numero proforma"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
          <input
            type="text"
            value={preparateur}
            onChange={(event) => setPreparateur(event.target.value)}
            placeholder="Preparateur"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
        </div>

        <textarea
          value={remarque}
          onChange={(event) => setRemarque(event.target.value)}
          rows={3}
          placeholder="Remarque"
          className="rounded-[1.5rem] border border-slate-200 px-4 py-3 text-sm outline-none"
        />

        <button
          type="button"
          onClick={addRow}
          className="rounded-full bg-sky-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-600"
        >
          Valider sortie
        </button>
      </div>

      <div className="mt-6 rounded-[1.5rem] border border-sky-100 bg-sky-50 p-4">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-800">
          Liste a controler
        </p>

        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-sky-900/70">Aucune sortie validee pour le moment.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {rows.map((row, index) => (
              <div
                key={`${row.lot_id}-${index}`}
                className="rounded-xl bg-white px-4 py-3 text-sm"
              >
                <p className="font-semibold text-slate-900">{row.lot_label}</p>
                <p className="text-slate-600">Qt sortie {row.quantite}</p>
                <p className="text-slate-500">
                  {row.code || "-"} {row.livre_pour ? `| ${row.livre_pour}` : ""}{" "}
                  {row.numero_bl ? `| BL ${row.numero_bl}` : ""}{" "}
                  {row.numero_proforma ? `| Proforma ${row.numero_proforma}` : ""}{" "}
                  {row.preparateur ? `| Prep ${row.preparateur}` : ""}
                </p>
                {row.remarque ? <p className="text-slate-500">Remarque : {row.remarque}</p> : null}
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className="mt-2 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-900"
                >
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {errorMessage ? (
        <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {errorMessage}
        </p>
      ) : null}

      {message ? (
        <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {message}
        </p>
      ) : null}

      <div className="mt-4">
        <button
          type="button"
          onClick={approveRows}
          disabled={rows.length === 0 || isPending}
          className={`rounded-full px-5 py-3 text-sm font-semibold text-white ${
            rows.length === 0 || isPending
              ? "cursor-not-allowed bg-slate-300"
              : "bg-slate-950 transition hover:bg-slate-800"
          }`}
        >
          {isPending ? "Approbation..." : "Approuver sortie"}
        </button>
      </div>
    </section>
  );
}

