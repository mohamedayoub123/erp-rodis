"use client";

import { useRef, useState, useTransition } from "react";
import type { CorrectionEntry, EntryField } from "./actions";

type AttachmentFile = { name: string; path: string };

// Correction/Action Corrective : liste d'entrees datees plutot qu'un seul
// champ texte - demande explicite ("possibilite d'ajouter une 2eme"). Les
// fichiers joints restent visibles directement sur la ligne de l'entree (a
// cote du texte), jamais caches dans une fenetre a ouvrir - demande
// explicite ("il faut sortir a cote, a l'exterieur"). Ouvrir une ligne
// (clic sur la date/l'apercu) la rend modifiable - demande explicite ("il
// faut que je peux modifier si je rentre sur le ligne"), pour CHAQUE
// entree independamment (la 1ere, la 2eme...). Le texte accepte plusieurs
// lignes (textarea, pas un simple champ d'une ligne).
export function CorrectionEntries({
  ncId,
  field,
  label = "",
  initialEntries,
  canWrite,
  addEntryAction,
  updateEntryTextAction,
  createUploadSlotAction,
  confirmUploadAction,
  getFileUrlAction,
  deleteFileAction,
}: {
  ncId: number;
  field: EntryField;
  // Vide quand utilise dans une cellule de tableau (l'entete de colonne
  // fait deja office de titre) - non-vide sur la page detail.
  label?: string;
  initialEntries: CorrectionEntry[];
  canWrite: boolean;
  addEntryAction: (ncId: number, field: EntryField, texte: string) => Promise<{ ok: boolean; message?: string; entry?: CorrectionEntry }>;
  updateEntryTextAction: (ncId: number, field: EntryField, entryId: string, texte: string) => Promise<{ ok: boolean; message?: string }>;
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
      {label ? label : null}
      <div className="grid min-w-[22rem] gap-2">
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
              onTexteChanged={(nextTexte) =>
                setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, texte: nextTexte } : e)))
              }
              updateEntryTextAction={updateEntryTextAction}
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
  onTexteChanged,
  updateEntryTextAction,
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
  onTexteChanged: (texte: string) => void;
  updateEntryTextAction: (ncId: number, field: EntryField, entryId: string, texte: string) => Promise<{ ok: boolean; message?: string }>;
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Texte editable - demande explicite ("il faut que je peux modifier si je
  // rentre sur la ligne"). Reinitialise depuis entry.texte a chaque
  // ouverture/fermeture (jamais pendant l'edition elle-meme) via
  // handleToggle plutot qu'un effet, pour repartir propre si une autre
  // session a modifie entre-temps.
  const [editTexte, setEditTexte] = useState(entry.texte);

  function handleToggle() {
    setEditTexte(entry.texte);
    onToggle();
  }

  function handleSaveTexte() {
    setError("");
    const trimmed = editTexte.trim();
    if (!trimmed) {
      setError("Texte vide.");
      return;
    }
    startTransition(async () => {
      const result = await updateEntryTextAction(ncId, field, entry.id, trimmed);
      if (!result.ok) {
        setError(result.message || "Erreur pendant l'enregistrement.");
        return;
      }
      onTexteChanged(trimmed);
      onToggle();
    });
  }

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
      if (fileInputRef.current) fileInputRef.current.value = "";
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
    <div className="rounded-2xl border border-slate-200 px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        {isOpen ? (
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={handleToggle}
              className="text-xs font-semibold text-slate-400 hover:underline"
            >
              {entry.date} - reduire
            </button>
            {canWrite ? (
              <>
                <textarea
                  value={editTexte}
                  onChange={(e) => setEditTexte(e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-700 outline-none"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveTexte}
                    disabled={isPending || !editTexte.trim()}
                    className="rounded-full bg-violet-700 px-5 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-600 disabled:opacity-60"
                  >
                    {isPending ? "Enregistrement..." : "Enregistrer"}
                  </button>
                </div>
              </>
            ) : (
              <span className="mt-1 block whitespace-pre-wrap text-sm font-normal text-slate-700">{entry.texte}</span>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={handleToggle}
            className="min-w-0 flex-1 text-left text-sm font-normal text-slate-700"
          >
            <span className="mr-2 text-xs font-semibold text-slate-400">{entry.date}</span>
            <span className="line-clamp-1">{entry.texte}</span>
          </button>
        )}

        {/* Fichiers directement visibles a cote, jamais caches dans une
            fenetre a ouvrir - demande explicite. */}
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {files.map((file) => (
            <span
              key={file.path}
              className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-1 text-xs font-normal text-slate-600"
            >
              <button
                type="button"
                onClick={() => handleView(file.path, file.name)}
                disabled={isPending}
                className="max-w-[10rem] truncate text-sky-700 hover:underline disabled:opacity-60"
                title={file.name}
              >
                📄 {file.name}
              </button>
              {canWrite ? (
                <button
                  type="button"
                  onClick={() => handleDelete(file.path)}
                  disabled={isPending}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-red-600 hover:bg-red-50 disabled:opacity-60"
                  title="Supprimer ce fichier"
                >
                  ✕
                </button>
              ) : null}
            </span>
          ))}
          {canWrite ? (
            <label className="flex cursor-pointer items-center gap-1 rounded-full border border-violet-200 px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-50">
              📎 Joindre
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(e) => handleUpload(e.target.files)}
                disabled={isPending}
                className="hidden"
              />
            </label>
          ) : null}
        </div>
      </div>

      {pendingViewUrl ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
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

      {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
