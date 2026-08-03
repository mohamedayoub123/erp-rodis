import { execFileSync } from "node:child_process";
import path from "node:path";
import { resolveWorkbookPath } from "@/lib/workbook-path";

const projectRoot = process.cwd();
const scriptPath = path.join(projectRoot, "scripts", "read_excel_views.py");

function runExcelScript(mode: string) {
  const stdout = execFileSync("py", ["-3", scriptPath, mode, resolveWorkbookPath()], {
    cwd: projectRoot,
    encoding: "utf-8",
    windowsHide: true,
  });

  return JSON.parse(stdout);
}

function runExcelScriptWithArgs(mode: string, ...args: string[]) {
  const stdout = execFileSync("py", ["-3", scriptPath, mode, ...args, resolveWorkbookPath()], {
    cwd: projectRoot,
    encoding: "utf-8",
    windowsHide: true,
  });

  return JSON.parse(stdout);
}

export type CommandeWorkbook = {
  numero_proforma: string;
  client: string;
  lignes: {
    article: string;
    quantite: number;
    non_dispo_total: number;
    non_dispo_2_mois: number;
    non_dispo_4_mois: number;
    non_dispo_6_mois: number;
  }[];
};

export type FifoWorkbookRow = {
  article: string;
  code: string;
  quantite_chargee: number;
  date: string | null;
  chambre: string | null;
};

export type PlanningWorkbookRow = {
  famille: string;
  client: string | null;
  nombre_camion: number | null;
  mode_chargement: string | null;
  numero_proforma: string | null;
  article: string;
  quantite_prevue: number;
};

export type StockDormantSansCommandeRow = {
  article: string;
  type: string | null;
  gamme: string | null;
  marque: string | null;
  code: string | null;
  stock: number;
  date: string | null;
};

export type FamilyStockWorkbookRow = {
  article: string;
  total: number;
  stock: number;
  reste: number;
};

export function readCommandesAndFifo(): {
  commande: CommandeWorkbook;
  fifo: FifoWorkbookRow[];
} {
  return runExcelScript("commandes_fifo");
}

export function readPlanning(): PlanningWorkbookRow[] {
  return runExcelScript("planning");
}

export function readStockDormantSansCommande(): StockDormantSansCommandeRow[] {
  return runExcelScript("stock_dormant_sans_commande");
}

export function readFamilyStock(sheetName: string): FamilyStockWorkbookRow[] {
  return runExcelScriptWithArgs("family_stock", sheetName);
}
