import { existsSync, readFileSync } from "node:fs";
import { getImportStatusPath } from "@/lib/import-jobs";

export type ImportStatus = {
  state: "idle" | "running" | "success" | "error";
  message: string;
  details?: string;
  updatedAt?: string;
};

export function readImportStatus(): ImportStatus {
  const statusPath = getImportStatusPath();

  if (!existsSync(statusPath)) {
    return {
      state: "idle",
      message: "Aucun import en cours.",
    };
  }

  try {
    const raw = readFileSync(statusPath, "utf-8");
    const parsed = JSON.parse(raw) as ImportStatus;
    return parsed;
  } catch {
    return {
      state: "error",
      message: "Impossible de lire le statut d'import.",
    };
  }
}
