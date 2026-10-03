"use client";

import { useState } from "react";
import ExcelJS from "exceljs";
import { exportAllFamiliesAction } from "./actions";
import { addTableauSheet, downloadWorkbook } from "./tableau-export-button";

function formatDateFichier(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${date.getFullYear()}`;
}

// Un seul fichier Excel avec une feuille par famille (meme mise en forme que
// l'export d'une famille). Les donnees sont calculees cote serveur au clic,
// puis le fichier est construit dans le navigateur - comme l'export d'une
// seule famille.
export function ToutesFamillesExportButton() {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function handleClick() {
    setEnCours(true);
    setErreur(null);

    try {
      const result = await exportAllFamiliesAction();
      if (!result.ok) {
        setErreur(result.message);
        return;
      }
      if (result.sheets.length === 0) {
        setErreur("Aucune famille a exporter.");
        return;
      }

      const workbook = new ExcelJS.Workbook();
      const nomsUtilises = new Set<string>();

      for (const sheet of result.sheets) {
        // Nom d'onglet Excel : 31 caracteres max, sans \ / ? * [ ] :, unique.
        let nom = sheet.title.replace(/[\\/?*[\]:]/g, "-").slice(0, 31) || "Famille";
        let compteur = 2;
        while (nomsUtilises.has(nom.toLowerCase())) {
          const suffixe = ` ${compteur++}`;
          nom = nom.slice(0, 31 - suffixe.length) + suffixe;
        }
        nomsUtilises.add(nom.toLowerCase());

        addTableauSheet(workbook, sheet.title, sheet.commandColumns, sheet.rows, nom);
      }

      await downloadWorkbook(
        workbook,
        `tableau-commande-toutes-familles-${formatDateFichier(new Date())}.xlsx`
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Export impossible, reessaie.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={enCours}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[16px] font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-wait disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <rect x="2" y="2" width="20" height="20" rx="3" fill="#1D6F42" />
          <path
            d="M7 7.5 10.6 12 7 16.5h2.1L11.6 13l2.5 3.5h2.1L12.6 12l3.6-4.5h-2.1l-2.5 3.4-2.5-3.4H7Z"
            fill="#ffffff"
          />
        </svg>
        {enCours ? "Export en cours..." : "Exporter toutes les familles"}
      </button>
      {erreur ? <span className="text-xs font-medium text-red-700">{erreur}</span> : null}
    </span>
  );
}
