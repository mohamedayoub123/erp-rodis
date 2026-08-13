"use client";

import { useState } from "react";

// Colonnes calculees en direct depuis les vraies donnees de l'appli (stock,
// BC, import 4D, A commander) - jamais depuis le fichier Excel fige.
const LIVE_COLUMNS = new Set([
  "Gamme",
  "stock",
  "en cours d'achat BC",
  "Qte BC et Date",
  "en cour d'achat 4D",
  "date le livraison prevu ds 4d",
  "A COMMANDER",
  "conso 1mois",
  "Conso reelle 12mois",
  "conso 9Mois",
  "conso 4mois",
]);

// Meme legende que le fichier Excel source (couleur de la cellule ORDRE).
const CATEGORIE_STYLES: Record<string, { bg: string; text: string }> = {
  "FORTE ROTATION": { bg: "#C55A11", text: "#ffffff" },
  "MOYENNE ROTATION": { bg: "#ffffff", text: "#0f172a" },
  DORMANT: { bg: "#BDD7EE", text: "#0f172a" },
  "NEW PROJECT": { bg: "#E2F0D9", text: "#0f172a" },
};

// Notes/legende complete en bas du fichier Excel source (lignes 200-209 de
// "1 INV MP COSMETIQUE.xlsx") - copie fidele du texte et de la couleur de
// fond de chaque ligne.
const NOTES_LEGEND: { text: string; bg: string; textColor?: string; bold?: boolean }[] = [
  { text: "Stock inférieur à 3 mois de conso", bg: "#FFC7CE", textColor: "#C00000", bold: true },
  { text: "Urgent mettre pression sur rimex  STOCK INFERIEUR A CONSO 4 MOIS", bg: "#FFFF00", bold: true },
  {
    text: "Urgent : verifier la date sur le dossier STOCK INFERIEUR A CONSO 4 MOIS/ CHARBEL",
    bg: "#00B050",
    bold: true,
  },
  { text: "stock dormant", bg: "#BDD7EE", bold: true },
  { text: "article important", bg: "#C55A11", bold: true },
  { text: "Stat 6 mois à mettre (nouveaux produits)", bg: "#FFC000" },
  { text: "BC ayant dépassé 3mois sans retour", bg: "#FF5050" },
  { text: "STAT A METTRE A JOUR", bg: "#FFC000", textColor: "#C00000", bold: true },
  { text: "A FAIRE OBLIGATOIREMENT L'INVENTAIRE TOURNANT CHAQ MOIS", bg: "#00B0F0", bold: true },
  { text: "E.T.D : Estimated Time of Departure (Heure estimée de départ)", bg: "transparent" },
];

// Couleur de fond manuelle de la cellule DESIGNATION dans le fichier Excel
// source (pas une formule - copiee telle quelle sur les articles concernes).
const DESIGNATION_COULEUR_BG: Record<string, string> = {
  "00B050": "#00B050",
  FFFF00: "#FFFF00",
};

// Memes regles de mise en forme conditionnelle que le fichier Excel source :
//   - DESIGNATION en rouge si stock > Conso reelle 12mois ("Stock superieur
//     a 1an de conso note en rouge").
//   - cellule stock en rose + texte rouge fonce si stock < 3 x conso 1mois
//     ("Stock inferieur a 3 mois de conso").
//   - A COMMANDER en rouge si negatif.
const RED_TEXT = "#FF0000";
const STOCK_BAS_BG = "#FFC7CE";
const STOCK_BAS_TEXT = "#9C0006";

function combineStyle(
  base: React.CSSProperties | undefined,
  rowOverride: ColorOverride | undefined,
  cellOverride: ColorOverride | undefined
): React.CSSProperties | undefined {
  if (!rowOverride?.bg && !rowOverride?.text && !cellOverride?.bg && !cellOverride?.text) return base;
  return {
    ...base,
    ...(rowOverride?.bg ? { backgroundColor: rowOverride.bg } : null),
    ...(rowOverride?.text ? { color: rowOverride.text } : null),
    ...(cellOverride?.bg ? { backgroundColor: cellOverride.bg } : null),
    ...(cellOverride?.text ? { color: cellOverride.text } : null),
  };
}

function formatCellValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") {
    return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  }
  return value;
}

export type LiveData = {
  gamme: string | null;
  stock: number;
  enCoursBc: number;
  qteBcEtDate: string;
  enCours4d: number;
  date4d: string;
  aCommander: number;
  conso12Mois: number;
  conso1Mois: number;
  conso4Mois: number;
  conso9Mois: number;
};

export type RapportRowWithLive = {
  id: number;
  ordre: number;
  designation: string;
  categorie: string | null;
  donnees: Record<string, string | number | null>;
  live: LiveData | null;
};

// Coloration manuelle "comme sur Excel" - fond et/ou texte, sur une cellule
// precise OU sur la ligne entiere (cle "__row__"). Stockee par ligne dans
// donnees.custom_colors (voir saveRapportGammeStatistiqueAction), au meme
// endroit que designation_couleur (colonne DESIGNATION, deja manuelle,
// mais figee depuis l'import Excel) - ceci est la version editable depuis
// l'appli. Une couleur de cellule l'emporte sur la couleur de ligne, qui
// l'emporte elle-meme sur les couleurs automatiques (categorie/stock bas).
type ColorOverride = { bg?: string; text?: string };
type RowColorTarget = "__row__" | string;
type RowColors = Record<RowColorTarget, ColorOverride>;

function parseStoredColors(value: unknown): RowColors {
  if (!value || typeof value !== "object") return {};
  return value as RowColors;
}

function isColorsEmpty(colors: RowColors) {
  return Object.values(colors).every((c) => !c.bg && !c.text);
}

function preventEnterSubmit(event: React.KeyboardEvent<HTMLFormElement>) {
  const target = event.target as HTMLElement;
  if (event.key === "Enter" && target.tagName === "INPUT") {
    event.preventDefault();
  }
}

export function RapportTable({
  gammeStatistique,
  rapportColumns,
  rows,
  canEdit,
  saveAction,
}: {
  gammeStatistique: string;
  rapportColumns: string[];
  rows: RapportRowWithLive[];
  canEdit: boolean;
  saveAction: (formData: FormData) => void | Promise<void>;
}) {
  const [colorsByRow, setColorsByRow] = useState<Record<number, RowColors>>(() =>
    Object.fromEntries(rows.map((row) => [row.id, parseStoredColors(row.donnees?.["custom_colors"])]))
  );
  const [selected, setSelected] = useState<{ rowId: number; target: RowColorTarget } | null>(null);

  function selectTarget(rowId: number, target: RowColorTarget) {
    if (!canEdit) return;
    setSelected({ rowId, target });
  }

  function updateSelectedColor(kind: "bg" | "text", value: string | null) {
    if (!selected) return;
    setColorsByRow((prev) => {
      const rowColors = { ...(prev[selected.rowId] || {}) };
      const current = { ...(rowColors[selected.target] || {}) };
      if (value) current[kind] = value;
      else delete current[kind];

      if (!current.bg && !current.text) delete rowColors[selected.target];
      else rowColors[selected.target] = current;

      return { ...prev, [selected.rowId]: rowColors };
    });
  }

  const selectedColor = selected ? colorsByRow[selected.rowId]?.[selected.target] : undefined;

  return (
    <form action={saveAction} onKeyDown={preventEnterSubmit} className="space-y-6">
      <input type="hidden" name="gamme_statistique" value={gammeStatistique} />
      {rows.map((row) => (
        <input key={row.id} type="hidden" name="row_id" value={row.id} />
      ))}
      {rows.map((row) => {
        const colors = colorsByRow[row.id] || {};
        return (
          <input
            key={row.id}
            type="hidden"
            name={`donnees_${row.id}`}
            value={JSON.stringify({
              ...row.donnees,
              custom_colors: isColorsEmpty(colors) ? null : colors,
            })}
          />
        );
      })}

      <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Legende (rotation)
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(CATEGORIE_STYLES).map(([label, style]) => (
                <span
                  key={label}
                  className="rounded-full px-4 py-1.5 text-xs font-semibold ring-1 ring-black/10"
                  style={{ backgroundColor: style.bg, color: style.text }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          {canEdit ? (
            <button
              type="submit"
              className="rounded-full bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500"
            >
              Enregistrer
            </button>
          ) : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="border border-slate-200 px-4 py-4 font-semibold">ORDRE</th>
                <th className="border border-slate-200 px-4 py-4 font-semibold">DESIGNATION</th>
                {rapportColumns.map((col) =>
                  col === "__SPACER__" ? (
                    <th key={col} className="w-28 border-0 bg-white p-0" />
                  ) : (
                    <th key={col} className="whitespace-nowrap border border-slate-200 px-4 py-4 font-semibold">
                      {col}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const style = row.categorie ? CATEGORIE_STYLES[row.categorie] : null;
                const live = row.live;
                const designationBg = DESIGNATION_COULEUR_BG[String(row.donnees?.["designation_couleur"] || "")];
                const stockDepasse1An = live ? live.stock > live.conso12Mois : false;
                const rowColors = colorsByRow[row.id] || {};
                const isTargetSelected = (target: RowColorTarget) =>
                  selected?.rowId === row.id && selected.target === target;
                return (
                  <tr key={row.id}>
                    <td
                      className={`border border-slate-200 px-4 py-3 text-center font-semibold ${canEdit ? "cursor-pointer" : ""} ${isTargetSelected("__row__") ? "ring-2 ring-inset ring-violet-500" : ""}`}
                      style={combineStyle(style ? { backgroundColor: style.bg, color: style.text } : undefined, rowColors["__row__"], undefined)}
                      onClick={() => selectTarget(row.id, "__row__")}
                      title={canEdit ? "Cliquer pour colorer toute la ligne" : undefined}
                    >
                      {row.ordre}
                    </td>
                    <td
                      className={`whitespace-nowrap border border-slate-200 px-4 py-3 font-medium ${canEdit ? "cursor-pointer" : ""} ${isTargetSelected("DESIGNATION") ? "ring-2 ring-inset ring-violet-500" : ""}`}
                      style={combineStyle(
                        { backgroundColor: designationBg, color: stockDepasse1An ? RED_TEXT : "#0f172a" },
                        rowColors["__row__"],
                        rowColors["DESIGNATION"]
                      )}
                      onClick={() => selectTarget(row.id, "DESIGNATION")}
                      title={canEdit ? "Cliquer pour colorer cette case" : undefined}
                    >
                      {row.designation}
                    </td>
                    {rapportColumns.map((col) => {
                      if (col === "__SPACER__") {
                        return <td key={col} className="w-28 border-0 bg-white p-0" />;
                      }

                      if (col === "avis") {
                        return (
                          <td key={col} className="border border-slate-200 p-1">
                            <input
                              type="text"
                              name={`avis_${row.id}`}
                              defaultValue={(row.donnees?.["avis"] as string) || ""}
                              disabled={!canEdit}
                              className="w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none disabled:border-transparent disabled:bg-transparent"
                            />
                          </td>
                        );
                      }

                      if (col === "statistique 4D 6 mois") {
                        return (
                          <td key={col} className="border border-slate-200 p-1">
                            <input
                              type="number"
                              step="0.01"
                              name={`stat4d_${row.id}`}
                              defaultValue={row.donnees?.["statistique 4D 6 mois"] ?? ""}
                              disabled={!canEdit}
                              className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none disabled:border-transparent disabled:bg-transparent"
                            />
                          </td>
                        );
                      }

                      if (col === "tonnage 1 tc") {
                        return (
                          <td key={col} className="border border-slate-200 p-1">
                            <input
                              type="number"
                              step="0.01"
                              name={`tonnage1tc_${row.id}`}
                              defaultValue={row.donnees?.["tonnage 1 tc"] ?? ""}
                              disabled={!canEdit}
                              className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none disabled:border-transparent disabled:bg-transparent"
                            />
                          </td>
                        );
                      }

                      if (!LIVE_COLUMNS.has(col)) {
                        return (
                          <td
                            key={col}
                            className={`whitespace-nowrap border border-slate-200 px-4 py-3 text-slate-600 ${canEdit ? "cursor-pointer" : ""} ${isTargetSelected(col) ? "ring-2 ring-inset ring-violet-500" : ""}`}
                            style={combineStyle(undefined, rowColors["__row__"], rowColors[col])}
                            onClick={() => selectTarget(row.id, col)}
                            title={canEdit ? "Cliquer pour colorer cette case" : undefined}
                          >
                            {formatCellValue(row.donnees?.[col])}
                          </td>
                        );
                      }

                      if (!live) {
                        return (
                          <td key={col} className="whitespace-nowrap border border-slate-200 px-4 py-3 text-amber-700">
                            article introuvable
                          </td>
                        );
                      }

                      let value: string | number = "-";
                      if (col === "Gamme") value = live.gamme ?? "-";
                      if (col === "stock") value = live.stock;
                      if (col === "en cours d'achat BC") value = live.enCoursBc || "-";
                      if (col === "Qte BC et Date") value = live.qteBcEtDate || "-";
                      if (col === "en cour d'achat 4D") value = live.enCours4d || "-";
                      if (col === "date le livraison prevu ds 4d") value = live.date4d || "-";
                      if (col === "A COMMANDER") value = live.aCommander;
                      if (col === "conso 1mois") value = live.conso1Mois;
                      if (col === "Conso reelle 12mois") value = live.conso12Mois;
                      if (col === "conso 9Mois") value = live.conso9Mois;
                      if (col === "conso 4mois") value = live.conso4Mois;

                      let cellStyle: React.CSSProperties | undefined;
                      if (col === "stock" && live.stock < live.conso1Mois * 3) {
                        cellStyle = { backgroundColor: STOCK_BAS_BG, color: STOCK_BAS_TEXT };
                      }
                      if (col === "A COMMANDER" && live.aCommander < 0) {
                        cellStyle = { color: RED_TEXT };
                      }

                      return (
                        <td
                          key={col}
                          className={`whitespace-nowrap border border-slate-200 px-4 py-3 text-slate-600 ${canEdit ? "cursor-pointer" : ""} ${isTargetSelected(col) ? "ring-2 ring-inset ring-violet-500" : ""}`}
                          style={combineStyle(cellStyle, rowColors["__row__"], rowColors[col])}
                          onClick={() => selectTarget(row.id, col)}
                          title={canEdit ? "Cliquer pour colorer cette case" : undefined}
                        >
                          {formatCellValue(value)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {canEdit ? (
          <div className="flex justify-end border-t border-slate-100 px-6 py-4">
            <button
              type="submit"
              className="rounded-full bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500"
            >
              Enregistrer
            </button>
          </div>
        ) : null}
      </section>

      <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Notes</p>
        <div className="overflow-hidden rounded-2xl ring-1 ring-black/5">
          {NOTES_LEGEND.map((note, index) => (
            <div
              key={index}
              className={`px-4 py-2 text-center text-sm ${note.bold ? "font-bold" : "font-medium"}`}
              style={{
                backgroundColor: note.bg,
                color: note.textColor || "#0f172a",
              }}
            >
              {note.text}
            </div>
          ))}
        </div>
      </section>

      {canEdit && selected ? (
        <div className="fixed bottom-6 right-6 z-50 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xl">
          <span className="text-xs font-semibold text-slate-600">
            Couleur : {selected.target === "__row__" ? "toute la ligne" : selected.target}
          </span>
          <label className="flex items-center gap-1 text-xs text-slate-500">
            Fond
            <input
              type="color"
              value={selectedColor?.bg || "#ffffff"}
              onChange={(event) => updateSelectedColor("bg", event.target.value)}
              className="h-7 w-7 cursor-pointer rounded border border-slate-200 p-0"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-500">
            Texte
            <input
              type="color"
              value={selectedColor?.text || "#0f172a"}
              onChange={(event) => updateSelectedColor("text", event.target.value)}
              className="h-7 w-7 cursor-pointer rounded border border-slate-200 p-0"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              updateSelectedColor("bg", null);
              updateSelectedColor("text", null);
            }}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Effacer
          </button>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Fermer
          </button>
        </div>
      ) : null}
    </form>
  );
}
