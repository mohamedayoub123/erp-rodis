import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const storageDir = path.join(projectRoot, "storage");
const uploadedWorkbookPath = path.join(storageDir, "current-workbook.xlsm");

export const DEFAULT_WORKBOOK_PATH =
  "C:\\Users\\ayoub\\Desktop\\MACRO EXCEL\\GFPC-ENR-026 suivi stock  depot pf .xlsm";

export function resolveWorkbookPath() {
  const customPath = (process.env.ERP_WORKBOOK_PATH || "").trim();

  if (existsSync(uploadedWorkbookPath)) {
    return uploadedWorkbookPath;
  }

  if (customPath) {
    return customPath;
  }

  return DEFAULT_WORKBOOK_PATH;
}

export function getWorkbookSourceLabel() {
  const customPath = (process.env.ERP_WORKBOOK_PATH || "").trim();

  if (existsSync(uploadedWorkbookPath)) {
    return "Fichier envoye depuis la web";
  }

  if (customPath) {
    return "Chemin personnalise";
  }

  return "Chemin Excel par defaut";
}

export async function saveUploadedWorkbook(file: File, targetFileName = "current-workbook.xlsm") {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const targetPath = path.join(storageDir, targetFileName);

  await mkdir(storageDir, { recursive: true });
  await writeFile(targetPath, buffer);

  return targetPath;
}
