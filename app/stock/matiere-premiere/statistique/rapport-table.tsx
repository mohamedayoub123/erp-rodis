"use client";

import { useState } from "react";
import { GAMME_CONFIGS } from "./gamme-config";
import { editableFieldName } from "./field-name";
import { SubmitButton } from "@/app/_components/submit-button";

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

// Le detail BC/4D (dossier + date) reste du texte normal, mais la quantite
// elle-meme est extraite a part pour pouvoir la colorer seule (bleu fonce
// pour le BC, vert gras pour le 4D) sans colorer tout le texte du detail.
// datePrevueReception : uniquement rempli pour les entrees de date4d (en
// cours 4D), utilise pour decider la couleur DESIGNATION (voir plus bas) -
// absent/inutilise pour qteBcEtDate.
export type DateDetailEntry = { quantite: number; detail: string; datePrevueReception?: string | null };

export type LiveData = {
  gamme: string | null;
  stock: number;
  enCoursBc: number;
  qteBcEtDate: DateDetailEntry[];
  enCours4d: number;
  date4d: DateDetailEntry[];
  aCommander: number;
  conso12Mois: number;
  conso1Mois: number;
  conso4Mois: number;
  conso9Mois: number;
  // Colonne informative uniquement (conso12Mois / 2) - ne remplace pas la
  // "Statistique 4D 6 mois" saisie a la main depuis Excel, qui reste seule
  // utilisee dans le calcul de "A commander". Sur demande explicite : juste
  // un chiffre de reference calcule en direct, l'analyse reste manuelle.
  conso6MoisSysteme: number;
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
  rows,
  canEdit,
  saveAction,
}: {
  gammeStatistique: string;
  rows: RapportRowWithLive[];
  canEdit: boolean;
  saveAction: (formData: FormData) => void | Promise<void>;
}) {
  const config = GAMME_CONFIGS[gammeStatistique];

  const [colorsByRow, setColorsByRow] = useState<Record<number, RowColors>>(() =>
    Object.fromEntries(rows.map((row) => [row.id, parseStoredColors(row.donnees?.["custom_colors"])]))
  );
  const [selected, setSelected] = useState<{ rowId: number; target: RowColorTarget } | null>(null);

  if (!config) return null;

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
  const columns = config.columns;
  // Comparaison lexicographique valide car date_prevue_reception est
  // toujours au format ISO "AAAA-MM-JJ" (voir DateJmaFormField).
  const todayIso = new Date().toISOString().slice(0, 10);

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
            {config.categorieStyles ? (
              <>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Legende (rotation)
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(config.categorieStyles).map(([label, style]) => (
                    <span
                      key={label}
                      className="rounded-full px-4 py-1.5 text-xs font-semibold ring-1 ring-black/10"
                      style={{ backgroundColor: style.bg, color: style.text }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </>
            ) : null}
          </div>

          {canEdit ? (
            <SubmitButton
              pendingLabel="Enregistrement..."
              className="rounded-full bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500"
            >
              Enregistrer
            </SubmitButton>
          ) : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <div className="max-h-[75vh] overflow-auto">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead className="bg-slate-50 text-slate-950">
              <tr>
                <th className="sticky top-0 z-10 border border-slate-200 bg-slate-50 px-4 py-4 font-semibold">ORDRE</th>
                <th className="sticky top-0 z-10 border border-slate-200 bg-slate-50 px-4 py-4 font-semibold">DESIGNATION</th>
                {columns.map((col, index) =>
                  col.kind === "spacer" ? (
                    <th key={col.key + index} className="sticky top-0 z-10 w-28 border-0 bg-white p-0" />
                  ) : (
                    // Titre en retour a la ligne (au lieu de nowrap) et
                    // largeur plafonnee, pour que la colonne se resserre a
                    // la taille de son contenu (chiffres/article) plutot
                    // que d'etre etiree par un titre long.
                    <th
                      key={col.key + index}
                      className="sticky top-0 z-10 max-w-[110px] whitespace-normal break-words border border-slate-200 bg-slate-50 px-2 py-2 font-semibold"
                    >
                      {col.label}
                    </th>
                  )
                )}
                <th className="sticky top-0 z-10 max-w-[110px] whitespace-normal break-words border border-slate-200 bg-slate-50 px-2 py-2 font-semibold">
                  Statistique 6 mois (systeme)
                </th>
                <th className="sticky top-0 z-10 whitespace-nowrap border border-slate-200 bg-slate-50 px-4 py-4 font-semibold">Remarque</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const style = row.categorie ? config.categorieStyles?.[row.categorie] : null;
                const live = row.live;
                // Trait noir large entre 2 feuilles Excel differentes (gammes
                // multi-sheet, ex: sous-familles) - le changement de
                // categorie d'une ligne a l'autre marque cette frontiere.
                const isSheetBoundary = rowIndex > 0 && row.categorie !== rows[rowIndex - 1].categorie;
                const sheetBoundaryClass = isSheetBoundary ? "border-t-[24px] border-t-black" : "";
                // DESIGNATION :
                // - vert si un dossier import (4D) est en cours SANS date
                //   prevue de reception saisie, OU si sa date prevue est
                //   deja depassee (aujourd'hui > date prevue) - dans les 2
                //   cas ca reste urgent a suivre.
                // - si un import est en cours ET a une date prevue pas
                //   encore depassee, la case redevient SANS couleur, meme
                //   si un BC est aussi en cours (la date prevue rassure,
                //   pas besoin d'alerter).
                // - jaune si un BC est en cours d'achat (et qu'aucune des 2
                //   regles import ci-dessus ne s'applique).
                const hasOpenBc = Boolean(live && live.enCoursBc > 0);
                const hasOpenImport = Boolean(live && live.enCours4d > 0);
                const importIsUrgent = Boolean(
                  live &&
                    live.date4d.some(
                      (entry) => !entry.datePrevueReception || entry.datePrevueReception < todayIso
                    )
                );
                const importSuppressesColor = hasOpenImport && !importIsUrgent;
                const designationBg = importIsUrgent
                  ? "#00B050"
                  : importSuppressesColor
                    ? undefined
                    : hasOpenBc
                      ? "#FFFF00"
                      : undefined;
                const stockDepasse1An = config.highlightStockOverConso12Mois && live ? live.stock > live.conso12Mois : false;
                const rowColors = colorsByRow[row.id] || {};
                const isTargetSelected = (target: RowColorTarget) =>
                  selected?.rowId === row.id && selected.target === target;
                return (
                  <tr key={row.id}>
                    <td
                      className={`border border-slate-200 px-4 py-3 text-center font-semibold ${canEdit ? "cursor-pointer" : ""} ${isTargetSelected("__row__") ? "ring-2 ring-inset ring-violet-500" : ""} ${sheetBoundaryClass}`}
                      style={combineStyle(style ? { backgroundColor: style.bg, color: style.text } : undefined, rowColors["__row__"], undefined)}
                      onClick={() => selectTarget(row.id, "__row__")}
                      title={canEdit ? "Cliquer pour colorer toute la ligne" : undefined}
                    >
                      {row.ordre}
                    </td>
                    <td
                      className={`whitespace-nowrap border border-slate-200 px-4 py-3 font-medium ${canEdit ? "cursor-pointer" : ""} ${isTargetSelected("DESIGNATION") ? "ring-2 ring-inset ring-violet-500" : ""} ${sheetBoundaryClass}`}
                      style={combineStyle(
                        { backgroundColor: designationBg, color: stockDepasse1An ? config.redText : "#0f172a" },
                        rowColors["__row__"],
                        rowColors["DESIGNATION"]
                      )}
                      onClick={() => selectTarget(row.id, "DESIGNATION")}
                      title={canEdit ? "Cliquer pour colorer cette case" : undefined}
                    >
                      {row.designation}
                      {row.categorie && !config.categorieStyles ? (
                        <span className="ml-2 whitespace-nowrap text-xs font-normal text-slate-400">
                          ({row.categorie})
                        </span>
                      ) : null}
                    </td>
                    {columns.map((col, index) => {
                      const colKey = col.key + index;

                      if (col.kind === "spacer") {
                        return <td key={colKey} className={`w-28 border-0 bg-white p-0 ${sheetBoundaryClass}`} />;
                      }

                      if (col.kind === "editable-text" || col.kind === "editable-number") {
                        const isAvis = col.key === "avis";
                        return (
                          <td key={colKey} className={`border border-slate-200 p-1 ${sheetBoundaryClass}`}>
                            <input
                              type={col.kind === "editable-number" ? "number" : "text"}
                              step={col.kind === "editable-number" ? "0.01" : undefined}
                              name={editableFieldName(row.id, col.key)}
                              defaultValue={(row.donnees?.[col.key] as string | number) ?? ""}
                              disabled={!canEdit}
                              className={`w-32 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none disabled:border-transparent disabled:bg-transparent ${
                                isAvis ? "font-bold text-red-600" : ""
                              }`}
                            />
                          </td>
                        );
                      }

                      if (col.kind === "static") {
                        return (
                          <td
                            key={colKey}
                            className={`whitespace-nowrap border border-slate-200 px-4 py-3 text-slate-600 ${canEdit ? "cursor-pointer" : ""} ${isTargetSelected(col.key) ? "ring-2 ring-inset ring-violet-500" : ""} ${sheetBoundaryClass}`}
                            style={combineStyle(undefined, rowColors["__row__"], rowColors[col.key])}
                            onClick={() => selectTarget(row.id, col.key)}
                            title={canEdit ? "Cliquer pour colorer cette case" : undefined}
                          >
                            {formatCellValue(row.donnees?.[col.key])}
                          </td>
                        );
                      }

                      // kind === "live"
                      if (!live) {
                        return (
                          <td
                            key={colKey}
                            className={`whitespace-nowrap border border-slate-200 px-4 py-3 text-amber-700 ${sheetBoundaryClass}`}
                          >
                            article introuvable
                          </td>
                        );
                      }

                      // qteBcEtDate/date4d : seule la quantite est coloree
                      // (bleu fonce pour le BC, vert gras pour le 4D), le
                      // reste du detail (dossier/date) reste en texte normal.
                      if (col.liveField === "qteBcEtDate" || col.liveField === "date4d") {
                        const entries = live[col.liveField];
                        const qtyColor =
                          col.liveField === "qteBcEtDate"
                            ? { color: "#1E3A8A", fontWeight: 700 }
                            : { color: "#00B050", fontWeight: 700 };
                        return (
                          <td
                            key={colKey}
                            className={`border border-slate-200 px-4 py-3 text-slate-600 ${canEdit ? "cursor-pointer" : ""} ${isTargetSelected(col.key) ? "ring-2 ring-inset ring-violet-500" : ""} ${sheetBoundaryClass}`}
                            style={combineStyle(undefined, rowColors["__row__"], rowColors[col.key])}
                            onClick={() => selectTarget(row.id, col.key)}
                            title={canEdit ? "Cliquer pour colorer cette case" : undefined}
                          >
                            {entries.length === 0
                              ? "-"
                              : entries.map((entry, entryIndex) => (
                                  // Plusieurs dossiers sur la meme case : chacun sur sa
                                  // propre ligne (empile), pas colle en ligne avec " / "
                                  // qui rendait la case illisible des qu'elle depassait
                                  // la largeur de colonne.
                                  <div key={entryIndex} className="whitespace-nowrap">
                                    <span style={qtyColor}>{formatCellValue(entry.quantite)}</span> {entry.detail}
                                  </div>
                                ))}
                          </td>
                        );
                      }

                      const value = col.liveField ? live[col.liveField] : "-";

                      let cellStyle: React.CSSProperties | undefined;
                      if (col.liveField === "stock" && live.stock < live.conso1Mois * (config.stockBasMultiplier ?? 3)) {
                        cellStyle = { backgroundColor: config.stockBasBg, color: config.stockBasText };
                      }
                      if (col.liveField === "aCommander" && live.aCommander < 0) {
                        cellStyle = { color: config.redText, ...(config.redTextBold ? { fontWeight: 700 } : null) };
                      }
                      if (col.liveField === "enCoursBc") {
                        cellStyle = { color: "#1E3A8A", fontWeight: 700 };
                      }
                      if (col.liveField === "enCours4d") {
                        cellStyle = { color: "#00B050", fontWeight: 700 };
                      }

                      return (
                        <td
                          key={colKey}
                          className={`whitespace-nowrap border border-slate-200 px-4 py-3 text-slate-600 ${canEdit ? "cursor-pointer" : ""} ${isTargetSelected(col.key) ? "ring-2 ring-inset ring-violet-500" : ""} ${sheetBoundaryClass}`}
                          style={combineStyle(cellStyle, rowColors["__row__"], rowColors[col.key])}
                          onClick={() => selectTarget(row.id, col.key)}
                          title={canEdit ? "Cliquer pour colorer cette case" : undefined}
                        >
                          {formatCellValue(value)}
                        </td>
                      );
                    })}
                    <td
                      className={`whitespace-nowrap border border-slate-200 px-4 py-3 text-slate-600 ${sheetBoundaryClass}`}
                    >
                      {live ? formatCellValue(live.conso6MoisSysteme) : "-"}
                    </td>
                    <td className={`border border-slate-200 p-1 ${sheetBoundaryClass}`}>
                      <input
                        type="text"
                        name={editableFieldName(row.id, "remarque_libre")}
                        defaultValue={(row.donnees?.["remarque_libre"] as string) ?? ""}
                        disabled={!canEdit}
                        className="w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none disabled:border-transparent disabled:bg-transparent"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {canEdit ? (
          <div className="flex justify-end border-t border-slate-100 px-6 py-4">
            <SubmitButton
              pendingLabel="Enregistrement..."
              className="rounded-full bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500"
            >
              Enregistrer
            </SubmitButton>
          </div>
        ) : null}
      </section>

      <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Notes</p>
        <div className="overflow-hidden rounded-2xl ring-1 ring-black/5">
          {config.notesLegend.map((note, index) => (
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
