"use client";

import { useMemo, useState, useTransition } from "react";
import { createEntreeMpBatchAction, createSortieMpBatchAction } from "./actions";
import { DateJmaInput } from "@/app/_components/date-jma-input";
import { formatDate } from "@/lib/format-date";

export type ArticleMpOption = {
  id: number;
  label: string;
  unite: string;
};

export type LotMpOption = {
  id: number;
  articleLabel: string;
  numeroLot: string;
  unite: string;
  stock: number;
};

type PendingEntreeMp = {
  article_id: number;
  article_label: string;
  date_reception: string;
  quantite: number;
  unite: string;
  numero_lot: string;
  date_fabrication: string;
  date_expiration: string;
  fournisseur: string;
  n_doss_erp: string;
  n_doss_4d: string;
  emplacement: string;
  note: string;
};

type PendingSortieMp = {
  article_id: number;
  article_label: string;
  numero_lot: string;
  date_sortie: string;
  quantite: number;
  client: string;
  n_doss_erp: string;
  n_doss_4d: string;
  note: string;
};

export function EntreePanelMp({
  articles,
  onLotsCreated,
}: {
  articles: ArticleMpOption[];
  onLotsCreated: React.Dispatch<React.SetStateAction<LotMpOption[]>>;
}) {
  const [isPending, startTransition] = useTransition();
  const [articleInput, setArticleInput] = useState("");
  const [showArticleDropdown, setShowArticleDropdown] = useState(false);
  const [dateReception, setDateReception] = useState("");
  const [quantite, setQuantite] = useState("");
  const [unite, setUnite] = useState("");
  const [numeroLot, setNumeroLot] = useState("");
  const [dateFabrication, setDateFabrication] = useState("");
  const [dateExpiration, setDateExpiration] = useState("");
  const [fournisseur, setFournisseur] = useState("");
  const [nDossErp, setNDossErp] = useState("");
  const [nDoss4d, setNDoss4d] = useState("");
  const [emplacement, setEmplacement] = useState("");
  const [note, setNote] = useState("");
  const [memeDossier, setMemeDossier] = useState(false);
  const [rows, setRows] = useState<PendingEntreeMp[]>([]);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const selectedArticle = useMemo(
    () => articles.find((article) => article.label === articleInput) ?? null,
    [articleInput, articles]
  );

  const filteredArticles = useMemo(() => {
    const words = articleInput.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return articles.slice(0, 80);

    return articles.filter((article) => {
      const label = article.label.toLowerCase();
      return words.every((word) => label.includes(word));
    });
  }, [articleInput, articles]);

  function addRow() {
    const qty = Number(quantite.replace(",", "."));

    if (!selectedArticle || !numeroLot.trim() || !dateReception || !qty || qty <= 0) {
      return;
    }

    setMessage("");
    setErrorMessage("");

    setRows((current) => [
      ...current,
      {
        article_id: selectedArticle.id,
        article_label: selectedArticle.label,
        date_reception: dateReception,
        quantite: qty,
        unite: unite.trim(),
        numero_lot: numeroLot.trim(),
        date_fabrication: dateFabrication,
        date_expiration: dateExpiration,
        fournisseur: fournisseur.trim(),
        n_doss_erp: nDossErp.trim(),
        n_doss_4d: nDoss4d.trim(),
        emplacement: emplacement.trim(),
        note: note.trim(),
      },
    ]);

    setArticleInput("");
    setDateReception("");
    setQuantite("");
    setUnite("");
    setNumeroLot("");
    setDateFabrication("");
    setDateExpiration("");
    setEmplacement("");
    setNote("");

    // "Meme dossier" : garde fournisseur/doss ERP/doss 4D remplis pour ne
    // pas les retaper a chaque article ajoute au meme lot de validation.
    if (!memeDossier) {
      setFournisseur("");
      setNDossErp("");
      setNDoss4d("");
    }
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  const payload = JSON.stringify(
    rows.map((row) => ({
      article_id: row.article_id,
      date_reception: row.date_reception,
      quantite: row.quantite,
      unite: row.unite,
      numero_lot: row.numero_lot,
      date_fabrication: row.date_fabrication,
      date_expiration: row.date_expiration,
      fournisseur: row.fournisseur,
      n_doss_erp: row.n_doss_erp,
      n_doss_4d: row.n_doss_4d,
      emplacement: row.emplacement,
      note: row.note,
    }))
  );

  function approveRows() {
    if (rows.length === 0) return;

    setMessage("");
    setErrorMessage("");

    const formData = new FormData();
    formData.set("payload", payload);

    startTransition(async () => {
      try {
        await createEntreeMpBatchAction(formData);
        onLotsCreated((currentLots) => [
          ...rows.map((row, index) => ({
            id: -(Date.now() + index),
            articleLabel: row.article_label,
            numeroLot: row.numero_lot,
            unite: row.unite,
            stock: row.quantite,
          })),
          ...currentLots,
        ]);
        setRows([]);
        setMessage("Entree enregistree dans le stock matiere premiere.");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Erreur pendant l'approbation.");
      }
    });
  }

  return (
    <section className="rounded-[2rem] border border-emerald-200 bg-white p-5 shadow-[0_18px_40px_rgba(16,185,129,0.08)]">
      <h2 className="text-2xl font-black text-emerald-900">Entrer stock - Matiere Premiere</h2>

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
                    if (!unite) setUnite(article.unite || "");
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
          <label className="grid gap-2 text-sm font-semibold text-slate-900">
            <span>Date de reception</span>
            <DateJmaInput value={dateReception} onChange={setDateReception} />
          </label>
          <div className="grid gap-4 grid-cols-2">
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={quantite}
              onChange={(event) => setQuantite(event.target.value)}
              placeholder="Quantite recue"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <input
              type="text"
              value={unite}
              onChange={(event) => setUnite(event.target.value)}
              placeholder="Unite (kg, L...)"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
          </div>
        </div>

        <input
          type="text"
          value={numeroLot}
          onChange={(event) => setNumeroLot(event.target.value)}
          placeholder="Numero de lot"
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
        />

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold text-slate-900">
            <span>Date de fabrication</span>
            <DateJmaInput value={dateFabrication} onChange={setDateFabrication} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-900">
            <span>Date d&apos;expiration</span>
            <DateJmaInput value={dateExpiration} onChange={setDateExpiration} />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <input
            type="text"
            value={fournisseur}
            onChange={(event) => setFournisseur(event.target.value)}
            placeholder="Fournisseur"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
          <input
            type="text"
            value={emplacement}
            onChange={(event) => setEmplacement(event.target.value)}
            placeholder="Emplacement"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <input
            type="text"
            value={nDossErp}
            onChange={(event) => setNDossErp(event.target.value)}
            placeholder="N. dossier ERP"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
          <input
            type="text"
            value={nDoss4d}
            onChange={(event) => setNDoss4d(event.target.value)}
            placeholder="N. dossier 4D"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
        </div>

        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={memeDossier}
            onChange={(event) => setMemeDossier(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Meme dossier (fournisseur, doss. ERP, doss. 4D gardes pour les prochains ajouts)
        </label>

        <input
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Note"
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
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
                  <th className="px-3 py-2 font-semibold">Unite</th>
                  <th className="px-3 py-2 font-semibold">Lot</th>
                  <th className="px-3 py-2 font-semibold">Reception</th>
                  <th className="px-3 py-2 font-semibold">Fournisseur</th>
                  <th className="px-3 py-2 font-semibold">Note</th>
                  <th className="px-3 py-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.article_id}-${row.numero_lot}-${index}`} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold text-slate-900">{row.article_label}</td>
                    <td className="px-3 py-2 text-slate-700">{row.quantite}</td>
                    <td className="px-3 py-2 text-slate-700">{row.unite || "-"}</td>
                    <td className="px-3 py-2 text-slate-700">{row.numero_lot}</td>
                    <td className="px-3 py-2 text-slate-700">{formatDate(row.date_reception)}</td>
                    <td className="px-3 py-2 text-slate-700">{row.fournisseur || "-"}</td>
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

export function SortiePanelMp({ articles }: { articles: ArticleMpOption[] }) {
  const [isPending, startTransition] = useTransition();
  const [articleInput, setArticleInput] = useState("");
  const [showArticleDropdown, setShowArticleDropdown] = useState(false);
  const [numeroLot, setNumeroLot] = useState("");
  const [dateSortie, setDateSortie] = useState("");
  const [quantite, setQuantite] = useState("");
  const [client, setClient] = useState("");
  const [nDossErp, setNDossErp] = useState("");
  const [nDoss4d, setNDoss4d] = useState("");
  const [note, setNote] = useState("");
  const [memeDossier, setMemeDossier] = useState(false);
  const [rows, setRows] = useState<PendingSortieMp[]>([]);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Article et numero de lot en saisie libre (comme Entree) - le stock peut
  // partir en negatif, donc pas besoin qu'un lot existe deja pour sortir un
  // article ; c'est ecrit ici, pas choisi dans une liste de lots existants.
  const selectedArticle = useMemo(
    () => articles.find((article) => article.label === articleInput) ?? null,
    [articleInput, articles]
  );

  const filteredArticles = useMemo(() => {
    const words = articleInput.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return articles.slice(0, 80);

    return articles.filter((article) => {
      const label = article.label.toLowerCase();
      return words.every((word) => label.includes(word));
    });
  }, [articleInput, articles]);

  function addRow() {
    const qty = Number(quantite.replace(",", "."));

    if (!selectedArticle || !numeroLot.trim() || !dateSortie || !qty || qty <= 0) {
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
        date_sortie: dateSortie,
        quantite: qty,
        client: client.trim(),
        n_doss_erp: nDossErp.trim(),
        n_doss_4d: nDoss4d.trim(),
        note: note.trim(),
      },
    ]);

    setArticleInput("");
    setNumeroLot("");
    setDateSortie("");
    setQuantite("");
    setNote("");

    // "Meme dossier" : garde client/doss ERP/doss 4D remplis pour ne pas
    // les retaper a chaque article ajoute au meme lot de validation.
    if (!memeDossier) {
      setClient("");
      setNDossErp("");
      setNDoss4d("");
    }
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  const payload = JSON.stringify(
    rows.map((row) => ({
      article_id: row.article_id,
      numero_lot: row.numero_lot,
      date_sortie: row.date_sortie,
      quantite: row.quantite,
      client: row.client,
      n_doss_erp: row.n_doss_erp,
      n_doss_4d: row.n_doss_4d,
      note: row.note,
    }))
  );

  function approveRows() {
    if (rows.length === 0) return;

    setMessage("");
    setErrorMessage("");

    const formData = new FormData();
    formData.set("payload", payload);

    startTransition(async () => {
      try {
        await createSortieMpBatchAction(formData);
        setRows([]);
        setMessage("Sortie enregistree dans le stock matiere premiere.");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Erreur pendant l'approbation.");
      }
    });
  }

  return (
    <section className="rounded-[2rem] border border-sky-200 bg-white p-5 shadow-[0_18px_40px_rgba(14,165,233,0.08)]">
      <h2 className="text-2xl font-black text-sky-900">Sortie stock - Matiere Premiere</h2>

      <div className="mt-4 grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
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

          <label className="grid gap-2 text-sm font-semibold text-slate-900">
            <span>Numero de lot</span>
            <input
              type="text"
              value={numeroLot}
              onChange={(event) => setNumeroLot(event.target.value)}
              placeholder="Numero de lot"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold text-slate-900">
            <span>Date de sortie</span>
            <DateJmaInput value={dateSortie} onChange={setDateSortie} />
          </label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={quantite}
            onChange={(event) => setQuantite(event.target.value)}
            placeholder="Quantite sortie"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none self-end"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <input
            type="text"
            value={client}
            onChange={(event) => setClient(event.target.value)}
            placeholder="Client"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
          <input
            type="text"
            value={nDossErp}
            onChange={(event) => setNDossErp(event.target.value)}
            placeholder="N. dossier ERP"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
          <input
            type="text"
            value={nDoss4d}
            onChange={(event) => setNDoss4d(event.target.value)}
            placeholder="N. dossier 4D"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
        </div>

        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={memeDossier}
            onChange={(event) => setMemeDossier(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Meme dossier (client, doss. ERP, doss. 4D gardes pour les prochains ajouts)
        </label>

        <input
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Note"
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
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
                key={`${row.article_id}-${row.numero_lot}-${index}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-sm"
              >
                <p className="text-slate-700">
                  <span className="font-semibold text-slate-900">
                    {row.article_label} | {row.numero_lot}
                  </span>
                  {` — Qt sortie ${row.quantite} | Date ${formatDate(row.date_sortie)}`}
                  {row.client ? ` | Client ${row.client}` : ""}
                  {row.n_doss_erp ? ` | ERP ${row.n_doss_erp}` : ""}
                  {row.n_doss_4d ? ` | 4D ${row.n_doss_4d}` : ""}
                  {row.note ? ` | Note ${row.note}` : ""}
                </p>
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-900"
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
