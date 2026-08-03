import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveWorkbookPath } from "@/lib/workbook-path";

const projectRoot = process.cwd();
const storageDir = path.join(projectRoot, "storage");
const importStatusPath = path.join(storageDir, "import-status.json");

function writeImportStatus(state: "idle" | "running" | "success" | "error", message: string) {
  mkdirSync(storageDir, { recursive: true });
  writeFileSync(
    importStatusPath,
    JSON.stringify(
      {
        state,
        message,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf-8"
  );
}

function runPythonScript(scriptName: string, workbookPath?: string) {
  const scriptPath = path.join(projectRoot, "scripts", scriptName);
  const args = [scriptPath];

  if (workbookPath !== undefined) {
    args.push(workbookPath || resolveWorkbookPath());
  }

  try {
    const stdout = execFileSync("py", ["-3", ...args], {
      cwd: projectRoot,
      encoding: "utf-8",
      windowsHide: true,
    });

    return stdout.trim();
  } catch (error) {
    const execError = error as {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      message?: string;
    };
    const stdout =
      typeof execError.stdout === "string"
        ? execError.stdout
        : execError.stdout?.toString?.() || "";
    const stderr =
      typeof execError.stderr === "string"
        ? execError.stderr
        : execError.stderr?.toString?.() || "";
    const message = [stdout.trim(), stderr.trim(), execError.message || ""]
      .filter(Boolean)
      .join("\n");

    throw new Error(message || `Echec import script ${scriptName}`);
  }
}

export function refreshArticlesImport(workbookPath?: string) {
  return runPythonScript("import_articles.py", workbookPath);
}

export function refreshLotsImport(workbookPath?: string) {
  return runPythonScript("import_lots_stock.py", workbookPath);
}

export function refreshCommandesListImport(workbookPath?: string) {
  return runPythonScript("import_commandes_list.py", workbookPath);
}

export function refreshClientsImport(workbookPath: string) {
  return runPythonScript("import_clients_list.py", workbookPath);
}

export function getImportStatusPath() {
  return importStatusPath;
}

export function startBackgroundFullImport(workbookPath?: string) {
  const scriptPath = path.join(projectRoot, "scripts", "run_full_import.py");
  const finalWorkbookPath = workbookPath || resolveWorkbookPath();

  writeImportStatus("running", "Import Excel lance en arriere-plan...");

  const child = spawn("py", ["-3", scriptPath, finalWorkbookPath, importStatusPath], {
    cwd: projectRoot,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });

  child.unref();

  return "Import lance en arriere-plan.";
}
