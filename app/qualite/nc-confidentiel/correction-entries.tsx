"use client";

import { useState, useTransition } from "react";
import type { CorrectionEntry, EntryField } from "./actions";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "avif"]);
function isImageFile(name: string): boolean {
  return IMAGE_EXTENSIONS.has(name.split(".").pop()?.toLowerCase() || "");
}

type AttachmentFile = { name: string; path: string };

// Correction/Action Corrective : liste d'entrees datees plutot qu'un seul
// champ texte - demande explicite ("possibilite d'ajouter une 2eme"). Le
// bouton "joindre un fichier" vit directement sur la ligne de chaque
// entree (pas cache dans un panneau depli), le texte de l'entree accepte
// plusieurs lignes (textarea, pas un simple champ d'une ligne).
export function CorrectionEntries({
  ncId,
  field,
  label,
  initialEntries,
  canWrite,
  addEntryAction,
  createUploadSlotAction,
  confirmUploadAction,
  getFileUrlAction,
  deleteFileAction,
}: {
  ncId: number;
  field: EntryField;
  label: string;
  initialEntries: CorrectionEntry[];
  canWrite: boolean;
  addEntryAction: (ncId: number, field: EntryField, texte: string) => Promise<{ ok: boolean; message?: string; entry?: CorrectionEntry }>;
  createUploadSlotAction: (
    ncId: number,
    field: EntryField,
    entryId: string,
    fileName: string
  ) => Promise<{ ok: boolean; message?: string; path?: string; signedUrl?: string }>;
  confirmUploadAction: (
    ncId: number,
    field: EntryField,
    entryId: string,
    files: AttachmentFile[]
  ) => Promise<{ ok: boolean; message?: string; files?: AttachmentFile[] }>;
  getFileUrlAction: (path: string) => Promise<{ ok: boolean; url?: string; message?: string }>;
  deleteFileAction: (ncId: number, field: EntryField, entryId: string, path: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [nouveauTexte, setNouveauTexte] = useState("");
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleAdd() {
    setError("");
    const texte = nouveauTexte.trim();
    if (!texte) return;
    startTransition(async () => {
      const result = await addEntryAction(ncId, field, texte);
      if (!result.ok || !result.entry) {
        setError(result.message || "Erreur pendant l'ajout.");
        return;
      }
      setEntries((prev) => [...prev, result.entry as CorrectionEntry]);
      setNouveauTexte("");
    });
  }

  return (
    <div className="grid gap-2 text-xs font-semibold text-slate-500 sm:col-span-2">
      {label}
      <div className="grid gap-2">
        {entries.length === 0 ? (
          <p className="text-sm font-normal text-slate-400">Aucune entree pour le moment.</p>
        ) : (
          entries.map((entry) => (
            <EntryRow
              key={entry.id}
              ncId={ncId}
              field={field}
              entry={entry}
              canWrite={canWrite}
              isOpen={openEntryId === entry.id}
              onToggle={() => setOpenEntryId((current) => (current === entry.id ? null : entry.id))}
              onFilesChanged={(nextFiles) =>
                setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, fichiers: nextFiles } : e)))
              }
              createUploadSlotAction={createUploadSlotAction}
              confirmUploadAction={confirmUploadAction}
              getFileUrlAction={getFileUrlAction}
              deleteFileAction={deleteFileAction}
            />
          ))
        )}
      </div>

      {canWrite ? (
        <div className="grid gap-2 rounded-2xl border border-dashed border-slate-200 p-3">
          <textarea
            value={nouveauTexte}
            onChange={(e) => setNouveauTexte(e.target.value)}
            rows={3}
            placeholder="Ecrire une nouvelle entree..."
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-700 outline-none"
          />
          <div className="flex items-center justify-between">
            {error ? <p className="text-xs font-semibold text-red-700">{error}</p> : <span />}
            <button
              type="button"
              onClick={handleAdd}
              disabled={isPending || !nouveauTexte.trim()}
              className="rounded-full bg-violet-700 px-5 py-2 text-xs font-semibold text-white transition hover:bg-violet-600 disabled:opacity-60"
            >
              {isPending ? "Ajout..." : "+ Ajouter une entree"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EntryRow({
  ncId,
  field,
  entry,
  canWrite,
  isOpen,
  onToggle,
  onFilesChanged,
  createUploadSlotAction,
  confirmUploadAction,
  getFileUrlAction,
  deleteFileAction,
}: {
  ncId: number;
  field: EntryField;
  entry: CorrectionEntry;
  canWrite: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onFilesChanged: (files: AttachmentFile[]) => void;
  createUploadSlotAction: (
    ncId: number,
    field: EntryField,
    entryId: string,
    fileName: string
  ) => Promise<{ ok: boolean; message?: string; path?: string; signedUrl?: string }>;
  confirmUploadAction: (
    ncId: number,
    field: EntryField,
    entryId: string,
    files: AttachmentFile[]
  ) => Promise<{ ok: boolean; message?: string; files?: AttachmentFile[] }>;
  getFileUrlAction: (path: string) => Promise<{ ok: boolean; url?: string; message?: string }>;
  deleteFileAction: (ncId: number, field: EntryField, entryId: string, path: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [isAttachOpen, setIsAttachOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-200">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 text-left text-sm font-normal text-slate-700"
        >
          <span className="mr-2 text-xs font-semibold text-slate-400">{entry.date}</span>
          {isOpen ? (
            <span className="mt-1 block whitespace-pre-wrap">{entry.texte}</span>
          ) : (
            <span className="line-clamp-1">{entry.texte}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setIsAttachOpen(true)}
          className="shrink-0 rounded-full border border-violet-200 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50"
        >
          {entry.fichiers.length > 0 ? `📎 ${entry.fichiers.length}` : "📎 Joindre"}
        </button>
      </div>

      {isAttachOpen ? (
        <EntryAttachModal
          ncId={ncId}
          field={field}
          entry={entry}
          canWrite={canWrite}
          onClose={() => setIsAttachOpen(false)}
          onFilesChanged={onFilesChanged}
          createUploadSlotAction={createUploadSlotAction}
          confirmUploadAction={confirmUploadAction}
          getFileUrlAction={getFileUrlAction}
          deleteFileAction={deleteFileAction}
        />
      ) : null}
    </div>
  );
}

function EntryAttachModal({
  ncId,
  field,
  entry,
  canWrite,
  onClose,
  onFilesChanged,
  createUploadSlotAction,
  confirmUploadAction,
  getFileUrlAction,
  deleteFileAction,
}: {
  ncId: number;
  field: EntryField;
  entry: CorrectionEntry;
  canWrite: boolean;
  onClose: () => void;
  onFilesChanged: (files: AttachmentFile[]) => void;
  createUploadSlotAction: (
    ncId: number,
    field: EntryField,
    entryId: string,
    fileName: string
  ) => Promise<{ ok: boolean; message?: string; path?: string; signedUrl?: string }>;
  confirmUploadAction: (
    ncId: number,
    field: EntryField,
    entryId: string,
    files: AttachmentFile[]
  ) => Promise<{ ok: boolean; message?: string; files?: AttachmentFile[] }>;
  getFileUrlAction: (path: string) => Promise<{ ok: boolean; url?: string; message?: string }>;
  deleteFileAction: (ncId: number, field: EntryField, entryId: string, path: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [files, setFiles] = useState(entry.fichiers);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [pendingViewUrl, setPendingViewUrl] = useState<{ url: string; name: string } | null>(null);

  function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError("");
    const allFiles = Array.from(fileList);

    startTransition(async () => {
      for (const file of allFiles) {
        const slot = await createUploadSlotAction(ncId, field, entry.id, file.name);
        if (!slot.ok || !slot.path || !slot.signedUrl) {
          setError(slot.message || `Erreur pendant l'envoi de "${file.name}".`);
          continue;
        }
        try {
          const response = await fetch(slot.signedUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: file,
          });
          if (!response.ok) {
            setError(`Erreur pendant l'envoi de "${file.name}".`);
            continue;
          }
          const uploadedFile: AttachmentFile = { name: file.name, path: slot.path };
          const result = await confirmUploadAction(ncId, field, entry.id, [uploadedFile]);
          if (!result.ok) {
            setError(result.message || `Erreur pendant l'enregistrement de "${file.name}".`);
          } else {
            setFiles((prev) => {
              const next = [...prev, uploadedFile];
              onFilesChanged(next);
              return next;
            });
          }
        } catch {
          setError(`Erreur pendant l'envoi de "${file.name}".`);
        }
      }
    });
  }

  function handleView(path: string, name: string) {
    setError("");
    setPendingViewUrl(null);
    const win = window.open("", "_blank", "noopener,noreferrer");
    startTransition(async () => {
      const result = await getFileUrlAction(path);
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
    });
  }

  function handleDelete(path: string) {
    if (!window.confirm("Supprimer ce fichier ? Cette action est definitive.")) return;
    setError("");
    startTransition(async () => {
      const result = await deleteFileAction(ncId, field, entry.id, path);
      if (!result.ok) {
        setError(result.message || "Erreur pendant la suppression.");
        return;
      }
      setFiles((prev) => {
        const next = prev.filter((f) => f.path !== path);
        onFilesChanged(next);
        return next;
      });
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">Pieces jointes de cette entree</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-2xl leading-none text-slate-400 hover:text-slate-700"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {files.length === 0 ? (
          <p className="text-sm text-slate-400">Aucun fichier attache.</p>
        ) : (
          <div className="grid gap-2">
            {files.map((file) => (
              <div key={file.path} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg">
                  {isImageFile(file.name) ? "🖼️" : "📄"}
                </div>
                <button
                  type="button"
                  onClick={() => handleView(file.path, file.name)}
                  disabled={isPending}
                  className="flex-1 truncate text-left text-sm text-sky-700 hover:underline disabled:opacity-60"
                  title={file.name}
                >
                  {file.name}
                </button>
                {canWrite ? (
                  <button
                    type="button"
                    onClick={() => handleDelete(file.path)}
                    disabled={isPending}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg font-bold text-red-600 hover:bg-red-50 disabled:opacity-60"
                    title="Supprimer ce fichier"
                  >
                    x
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {canWrite ? (
          <label className="mt-4 block text-sm text-slate-600">
            <span className="block font-semibold text-slate-500">Ajouter un ou plusieurs fichiers</span>
            <input
              type="file"
              multiple
              onChange={(e) => handleUpload(e.target.files)}
              disabled={isPending}
              className="mt-1"
            />
          </label>
        ) : null}

        {pendingViewUrl ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Le navigateur a bloque l&apos;ouverture automatique du nouvel onglet -{" "}
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

        {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
      </div>
    </div>
  );
}
