"use client";

import { useEffect, useRef, useState } from "react";
import {
  confirmFormationUploadAction,
  createFormationUploadSlotAction,
  deleteFormationFileAction,
  getFormationFileUrlAction,
} from "./actions";
import type { AttachmentFile } from "./fields";

// Statut de la cellule : vert si cochee "realise", rouge si le mois cible
// (annee/mois de la colonne, pas le texte libre de date qui contient parfois
// des listes comme "24&30/06/2025") est deja passe sans etre cochee, jaune
// si planifie mais le mois n'est pas encore passe, "-" si pas planifie.
function monthStatus(annee: number, mois: number, planifie: boolean, realise: boolean) {
  if (!planifie) return "none";
  if (realise) return "done";
  const now = new Date();
  const overdue = annee < now.getFullYear() || (annee === now.getFullYear() && mois < now.getMonth() + 1);
  return overdue ? "late" : "pending";
}

const STATUS_STYLES: Record<string, string> = {
  none: "text-slate-300",
  done: "bg-emerald-50/60",
  late: "bg-red-50/70",
  pending: "bg-amber-50/70",
};

export function FormationMonthCell({
  rowId,
  mois,
  annee,
  planifie,
  date,
  realise,
  initialFiles,
  canEdit,
}: {
  rowId: number;
  mois: number;
  annee: number;
  planifie: boolean;
  date: string | null;
  realise: boolean;
  initialFiles: AttachmentFile[];
  canEdit: boolean;
}) {
  const status = monthStatus(annee, mois, planifie, realise);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<AttachmentFile[]>(initialFiles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingViewUrl, setPendingViewUrl] = useState<{ url: string; name: string } | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute("webkitdirectory", "");
      folderInputRef.current.setAttribute("directory", "");
    }
  }, [open]);

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    setError("");
    for (const file of Array.from(fileList)) {
      const displayName = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const slot = await createFormationUploadSlotAction(rowId, mois, file.name);
      if (!slot.ok || !slot.path || !slot.signedUrl) {
        setError(slot.message || `Erreur pendant l'envoi de "${displayName}".`);
        continue;
      }
      try {
        const response = await fetch(slot.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!response.ok) {
          setError(`Erreur pendant l'envoi de "${displayName}".`);
          continue;
        }
      } catch {
        setError(`Erreur reseau pendant l'envoi de "${displayName}".`);
        continue;
      }
      const uploaded: AttachmentFile = { name: displayName, path: slot.path };
      const result = await confirmFormationUploadAction(rowId, mois, [uploaded]);
      if (!result.ok) {
        setError(result.message || `Erreur pendant l'enregistrement de "${displayName}".`);
      } else {
        setFiles((prev) => [...prev, uploaded]);
      }
    }
    setBusy(false);
  }

  function handleOpenFile(path: string, name: string) {
    setError("");
    setPendingViewUrl(null);
    // Ouvre l'onglet tout de suite (dans le clic, pendant que le navigateur
    // considere encore que c'est un geste de l'utilisateur) puis le
    // redirige une fois l'URL signee recuperee - meme motif que AuditTable
    // (un window.open() appele APRES un await est bloque silencieusement).
    const win = window.open("", "_blank", "noopener,noreferrer");
    void (async () => {
      const result = await getFormationFileUrlAction(path);
      if (!result.ok || !result.url) {
        setError(result.message || "Fichier introuvable.");
        win?.close();
        return;
      }
      if (win) {
        win.location.href = result.url;
      } else {
        setPendingViewUrl({ url: result.url, name });
      }
    })();
  }

  async function handleDeleteFile(path: string) {
    if (!window.confirm("Supprimer ce fichier ? Cette action est definitive.")) return;
    setBusy(true);
    const result = await deleteFormationFileAction(rowId, mois, path);
    if (result.ok) setFiles((prev) => prev.filter((f) => f.path !== path));
    else setError(result.message || "Erreur pendant la suppression.");
    setBusy(false);
  }

  return (
    <td className={`relative border border-slate-200 px-3 py-2 text-center align-top ${STATUS_STYLES[status]}`}>
      {status === "none" ? (
        "-"
      ) : (
        <div>
          <span
            className={`font-semibold ${
              status === "done" ? "text-emerald-700" : status === "late" ? "text-red-700" : "text-amber-700"
            }`}
          >
            {status === "done" ? "✓" : status === "late" ? "✗" : "•"}
          </span>
          {date ? <div className="mt-0.5 text-[10px] text-slate-500">{date}</div> : null}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-semibold text-slate-400 hover:text-slate-700"
        title="Fichiers / dossier joint"
      >
        📎 {files.length > 0 ? files.length : ""}
      </button>

      {open ? (
        <div className="absolute left-1/2 top-full z-40 mt-1 w-64 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            Pieces jointes
          </p>
          {files.length === 0 ? (
            <p className="mb-2 text-xs text-slate-400">Aucun fichier.</p>
          ) : (
            <ul className="mb-2 space-y-1">
              {files.map((f) => (
                <li key={f.path} className="flex items-center justify-between gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleOpenFile(f.path, f.name)}
                    className="truncate text-left text-violet-700 underline"
                    title={f.name}
                  >
                    {f.name}
                  </button>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteFile(f.path)}
                      disabled={busy}
                      className="shrink-0 text-red-600"
                      title="Supprimer"
                    >
                      ✕
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canEdit ? (
            <div className="grid gap-2">
              <label className="text-[10px] font-semibold text-slate-500">
                Fichier(s)
                <input
                  type="file"
                  multiple
                  disabled={busy}
                  onChange={(e) => handleUpload(e.target.files)}
                  className="mt-1 block w-full text-[10px]"
                />
              </label>
              <label className="text-[10px] font-semibold text-slate-500">
                Ou un dossier entier
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  disabled={busy}
                  onChange={(e) => handleUpload(e.target.files)}
                  className="mt-1 block w-full text-[10px]"
                />
              </label>
            </div>
          ) : null}
          {pendingViewUrl ? (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-800">
              Onglet bloque -{" "}
              <a
                href={pendingViewUrl.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline"
                onClick={() => setPendingViewUrl(null)}
              >
                clique ici pour ouvrir &quot;{pendingViewUrl.name}&quot;
              </a>
              .
            </p>
          ) : null}
          {error ? <p className="mt-2 text-[10px] font-semibold text-red-700">{error}</p> : null}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 w-full rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold text-slate-600"
          >
            Fermer
          </button>
        </div>
      ) : null}
    </td>
  );
}
