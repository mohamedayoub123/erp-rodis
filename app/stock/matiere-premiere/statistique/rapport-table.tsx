"use client";

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
};

export type RapportRowWithLive = {
  id: number;
  ordre: number;
  designation: string;
  categorie: string | null;
  donnees: Record<string, string | number | null>;
  live: LiveData | null;
};

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
  return (
    <form action={saveAction} onKeyDown={preventEnterSubmit} className="space-y-6">
      <input type="hidden" name="gamme_statistique" value={gammeStatistique} />
      {rows.map((row) => (
        <input key={row.id} type="hidden" name="row_id" value={row.id} />
      ))}
      {rows.map((row) => (
        <input
          key={row.id}
          type="hidden"
          name={`donnees_${row.id}`}
          value={JSON.stringify(row.donnees)}
        />
      ))}

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
                const conso12Mois = Number(row.donnees?.["Conso reelle 12mois"] ?? 0);
                const stockDepasse1An = live ? live.stock > conso12Mois : false;
                return (
                  <tr key={row.id}>
                    <td
                      className="border border-slate-200 px-4 py-3 text-center font-semibold"
                      style={style ? { backgroundColor: style.bg, color: style.text } : undefined}
                    >
                      {row.ordre}
                    </td>
                    <td
                      className="whitespace-nowrap border border-slate-200 px-4 py-3 font-medium"
                      style={{
                        backgroundColor: designationBg,
                        color: stockDepasse1An ? RED_TEXT : "#0f172a",
                      }}
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

                      if (!LIVE_COLUMNS.has(col)) {
                        return (
                          <td key={col} className="whitespace-nowrap border border-slate-200 px-4 py-3 text-slate-600">
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

                      let cellStyle: React.CSSProperties | undefined;
                      if (col === "stock") {
                        const conso1Mois = Number(row.donnees?.["conso 1mois"] ?? 0);
                        if (live.stock < conso1Mois * 3) {
                          cellStyle = { backgroundColor: STOCK_BAS_BG, color: STOCK_BAS_TEXT };
                        }
                      }
                      if (col === "A COMMANDER" && live.aCommander < 0) {
                        cellStyle = { color: RED_TEXT };
                      }

                      return (
                        <td
                          key={col}
                          className="whitespace-nowrap border border-slate-200 px-4 py-3 text-slate-600"
                          style={cellStyle}
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
    </form>
  );
}
