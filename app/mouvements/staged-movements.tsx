"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createEntreeStockBatchAction,
  createSortieStockBatchAction,
} from "./actions";
import { DateJmaInput } from "@/app/_components/date-jma-input";

export type ArticleOption = {
  id: number;
  label: string;
};

export type LotOption = {
  id: number;
  articleLabel: string;
  numeroLot: string;
  chambre: string;
  codePays: string;
  stock: number;
};

type PendingEntree = {
  article_id: number;
  article_label: string;
  numero_lot: string;
  date_fabrication: string;
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
};

function formatLotLabel(lot: LotOption) {
  return `${lot.articleLabel} | ${lot.numeroLot} | restant ${lot.stock}${
    lot.chambre ? ` | ${lot.chambre}` : ""
  }${lot.codePays ? ` | ${lot.codePays}` : ""}`;
}

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

  const filteredArticles = useMemo(() => {
    const words = articleInput.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return articles.slice(0, 80);

    // Each word typed is matched independently anywhere in the name, so
    // "la wh" still finds "Lait WHITE SECRET 500ml" without needing the
    // full word.
    return articles.filter((article) => {
      const label = article.label.toLowerCase();
      return words.every((word) => label.includes(word));
    });
  }, [articleInput, articles]);

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
        quantite: qty,
        chambre: chambre.trim(),
        code_pays: codePays.trim(),
        note: note.trim(),
      },
    ]);

    setArticleInput("");
    setNumeroLot("");
    setDateFabrication("");
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
          ...rows.map((row, index) => ({
            id: -(Date.now() + index),
            articleLabel: row.article_label,
            numeroLot: row.numero_lot,
            chambre: row.chambre,
            codePays: row.code_pays,
            stock: row.quantite,
          })),
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
            }}
            onFocus={() => setShowArticleDropdown(true)}
            onBlur={() => setTimeout(() => setShowArticleDropdown(false), 150)}
            placeholder="Ecris l'article puis choisis"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none"
            autoComplete="off"
          />
          {showArticleDropdown && filteredArticles.length > 0 ? (
            <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
              {filteredArticles.map((article) => (
                <button
                  key={article.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setArticleInput(article.label);
                    setShowArticleDropdown(false);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-slate-800 hover:bg-slate-100"
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
          <DateJmaInput value={dateFabrication} onChange={setDateFabrication} />
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
                  <th className="px-3 py-2 font-semibold">Date</th>
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
  const [lotInput, setLotInput] = useState("");
  const [showLotDropdown, setShowLotDropdown] = useState(false);
  const [quantite, setQuantite] = useState("");
  const [code, setCode] = useState("");
  const [livrePour, setLivrePour] = useState("");
  const [numeroBl, setNumeroBl] = useState("");
  const [preparateur, setPreparateur] = useState("");
  const [rows, setRows] = useState<PendingSortie[]>([]);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const selectedLot = useMemo(
    () => lots.find((lot) => formatLotLabel(lot) === lotInput) ?? null,
    [lotInput, lots]
  );

  const filteredLots = useMemo(() => {
    const words = lotInput.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return lots.slice(0, 80);

    return lots.filter((lot) => {
      const label = formatLotLabel(lot).toLowerCase();
      return words.every((word) => label.includes(word));
    });
  }, [lotInput, lots]);

  function addRow() {
    const qty = Number(quantite.replace(",", "."));

    if (!selectedLot || !qty || qty <= 0) {
      return;
    }

    setMessage("");
    setErrorMessage("");

    setRows((current) => [
      ...current,
      {
        lot_id: selectedLot.id,
        lot_label: formatLotLabel(selectedLot),
        quantite: qty,
        code: code.trim(),
        livre_pour: livrePour.trim(),
        numero_bl: numeroBl.trim(),
        preparateur: preparateur.trim(),
      },
    ]);

    setLotInput("");
    setQuantite("");
    setCode("");
    setLivrePour("");
    setNumeroBl("");
    setPreparateur("");
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
              const qty = qtyByLot.get(lot.id) ?? 0;
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
    }))
  );

  return (
    <section className="rounded-[2rem] border border-sky-200 bg-white p-5 shadow-[0_18px_40px_rgba(14,165,233,0.08)]">
      <h2 className="text-2xl font-black text-sky-900">Sortie stock</h2>

      <div className="mt-4 grid gap-4">
        <label className="relative grid gap-2 text-sm font-semibold text-slate-900">
          <span>Lot a sortir</span>
          <input
            value={lotInput}
            onChange={(event) => {
              setLotInput(event.target.value);
              setShowLotDropdown(true);
            }}
            onFocus={() => setShowLotDropdown(true)}
            onBlur={() => setTimeout(() => setShowLotDropdown(false), 150)}
            placeholder="Ecris article, lot ou chambre puis choisis"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none"
            autoComplete="off"
          />
          {showLotDropdown && filteredLots.length > 0 ? (
            <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
              {filteredLots.map((lot) => (
                <button
                  key={lot.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setLotInput(formatLotLabel(lot));
                    setShowLotDropdown(false);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-slate-800 hover:bg-slate-100"
                >
                  {formatLotLabel(lot)}
                </button>
              ))}
            </div>
          ) : null}
        </label>

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
            placeholder="Code"
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
            value={preparateur}
            onChange={(event) => setPreparateur(event.target.value)}
            placeholder="Preparateur"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
        </div>

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
                  {row.preparateur ? `| Prep ${row.preparateur}` : ""}
                </p>
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

