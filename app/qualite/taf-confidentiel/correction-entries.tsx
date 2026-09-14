"use client";

import { useRef, useState, useTransition } from "react";
import type { CorrectionEntry } from "./actions";

type AttachmentFile = { name: string; path: string };

// Colonne Correction du TAF - meme principe que Correction/Action
// Corrective sur NC Confidentiel (voir nc-confidentiel/correction-entries.tsx),
// mais un seul champ ici (pas d'Action Corrective distincte sur TAF), donc
// pas de prop "field". Demande explicite : "ajoute une colonne correction et
// le statut ca va agir avec lui" - Statut se recalcule desormais depuis
// T1-T4 ET l'etat de ces entrees (voir computeStatutTaf, actions.ts).
export function TafCorrectionEntries({
  tafId,
  label = "",
  initialEntries,
  canWrite,
  allowEdit = true,
  addEntryAction,
  updateEntryTextAction,
  createUploadSlotAction,
  confirmUploadAction,
  getFileUrlAction,
  deleteFileAction,
}: {
  tafId: number;
  // Vide quand utilise dans une cellule de tableau (l'entete de colonne
  // fait deja office de titre) - non-vide sur la page detail.
  label?: string;
  initialEntries: CorrectionEntry[];
  canWrite: boolean;
  // false dans le tableau (voir page.tsx) : masque "+ Ajouter une entree"
  // et la textarea d'edition d'une entree existante, garde uniquement la
  // consultation et les pieces jointes.
  allowEdit?: boolean;
  addEntryAction: (tafId: number, texte: string) => Promise<{ ok: boolean; message?: string; entry?: CorrectionEntry }>;
  updateEntryTextAction: (tafId: number, entryId: string, texte: string) => Promise<{ ok: boolean; message?: string }>;
  createUploadSlotAction: (
    tafId: number,
    entryId: string,
    fileName: string
  ) => Promise<{ ok: boolean; message?: string; path?: string; signedUrl?: string }>;
  confirmUploadAction: (
    tafId: number,
    entryId: string,
    files: AttachmentFile[]
  ) => Promise<{ ok: boolean; message?: string; files?: AttachmentFile[] }>;
  getFileUrlAction: (path: string) => Promise<{ ok: boolean; url?: string; message?: string }>;
  deleteFileAction: (tafId: number, entryId: string, path: string) => Promise<{ ok: boolean; message?: string }>;
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
      const result = await addEntryAction(tafId, texte);
      if (!result.ok || !result.entry) {
        setError(result.message || "Erreur pendant l'ajout.");
        return;
      }
      // Statut (colonne separee de AuditTable, deduite de T1-T4 + de l'etat
      // des entrees - voir saveTafCorrectionEntriesAndRecomputeStatut) vit
      // dans un ref jamais resynchronise par un simple revalidatePath -
      // rechargement complet pour que la colonne Statut se mette a jour
      // sans attendre un futur changement de page (meme principe que NC).
      window.location.reload();
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
              tafId={tafId}
              entry={entry}
              canWrite={canWrite}
              allowEdit={allowEdit}
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

      {canWrite && allowEdit ? (
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
  tafId,
  entry,
  canWrite,
  allowEdit,
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
  tafId: number;
  entry: CorrectionEntry;
  canWrite: boolean;
  allowEdit: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onFilesChanged: (files: AttachmentFile[]) => void;
  onTexteChanged: (texte: string) => void;
  updateEntryTextAction: (tafId: number, entryId: string, texte: string) => Promise<{ ok: boolean; message?: string }>;
  createUploadSlotAction: (
    tafId: number,
    entryId: string,
    fileName: string
  ) => Promise<{ ok: boolean; message?: string; path?: string; signedUrl?: string }>;
  confirmUploadAction: (
    tafId: number,
    entryId: string,
    files: AttachmentFile[]
  ) => Promise<{ ok: boolean; message?: string; files?: AttachmentFile[] }>;
  getFileUrlAction: (path: string) => Promise<{ ok: boolean; url?: string; message?: string }>;
  deleteFileAction: (tafId: number, entryId: string, path: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [files, setFiles] = useState(entry.fichiers);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [pendingViewUrl, setPendingViewUrl] = useState<{ url: string; name: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const result = await updateEntryTextAction(tafId, entry.id, trimmed);
      if (!result.ok) {
        setError(result.message || "Erreur pendant l'enregistrement.");
        return;
      }
      onTexteChanged(trimmed);
      onToggle();
    });
  }

  function reloadForStatutUpdate() {
    window.location.reload();
  }

  function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError("");
    const allFiles = Array.from(fileList);
    setUploadProgress({ current: 0, total: allFiles.length });

    startTransition(async () => {
      let auMoinsUnEnvoye = false;
      let index = 0;
      for (const file of allFiles) {
        const slot = await createUploadSlotAction(tafId, entry.id, file.name);
        if (!slot.ok || !slot.path || !slot.signedUrl) {
          setError(slot.message || `Erreur pendant l'envoi de "${file.name}".`);
          index++;
          setUploadProgress({ current: index, total: allFiles.length });
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
            index++;
            setUploadProgress({ current: index, total: allFiles.length });
            continue;
          }
          const uploadedFile: AttachmentFile = { name: file.name, path: slot.path };
          const result = await confirmUploadAction(tafId, entry.id, [uploadedFile]);
          if (!result.ok) {
            setError(result.message || `Erreur pendant l'enregistrement de "${file.name}".`);
          } else {
            auMoinsUnEnvoye = true;
          }
        } catch {
          setError(`Erreur pendant l'envoi de "${file.name}".`);
        }
        index++;
        setUploadProgress({ current: index, total: allFiles.length });
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (auMoinsUnEnvoye) {
        reloadForStatutUpdate();
      } else {
        setUploadProgress(null);
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
      const result = await deleteFileAction(tafId, entry.id, path);
      if (!result.ok) {
        setError(result.message || "Erreur pendant la suppression.");
        return;
      }
      setFiles((prev) => {
        const next = prev.filter((f) => f.path !== path);
        onFilesChanged(next);
        return next;
      });
      reloadForStatutUpdate();
    });
  }

  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-4 py-3">
          {isOpen ? (
            <div className="min-w-0">
              <button
                type="button"
                onClick={handleToggle}
                className="text-xs font-semibold text-slate-400 hover:underline"
              >
                {entry.date} - reduire
              </button>
              {canWrite && allowEdit ? (
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
              className="block w-full min-w-0 text-left text-sm font-normal text-slate-700"
            >
              <span className="mr-2 text-xs font-semibold text-slate-400">{entry.date}</span>
              <span className="line-clamp-1">{entry.texte}</span>
            </button>
          )}
        </div>

        <div className="flex w-40 shrink-0 flex-col items-stretch gap-1.5">
          {files.map((file) => (
            <span
              key={file.path}
              className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-1 text-xs font-normal text-slate-600"
            >
              <button
                type="button"
                onClick={() => handleView(file.path, file.name)}
                disabled={isPending}
                className="min-w-0 flex-1 truncate text-sky-700 hover:underline disabled:opacity-60"
                title={file.name}
              >
                📄 {file.name}
              </button>
              {canWrite ? (
                <button
                  type="button"
                  onClick={() => handleDelete(file.path)}
                  disabled={isPending}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-red-600 hover:bg-red-50 disabled:opacity-60"
                  title="Supprimer ce fichier"
                >
                  ✕
                </button>
              ) : null}
            </span>
          ))}
          {canWrite ? (
            <label
              className={`flex items-center justify-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                uploadProgress
                  ? "cursor-not-allowed border-slate-200 text-slate-400"
                  : "cursor-pointer border-violet-200 text-violet-700 hover:bg-violet-50"
              }`}
            >
              {uploadProgress ? `⏳ Envoi ${uploadProgress.current}/${uploadProgress.total}...` : "📎 Joindre"}
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
