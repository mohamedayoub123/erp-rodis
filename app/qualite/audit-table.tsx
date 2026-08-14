"use client";

import { useRef, useState, useTransition } from "react";

export type AuditColumn = { key: string; label: string; long?: boolean; select?: string[] };

export type AuditRow = { id: number | null; [columnKey: string]: string | number | null };

export type AttachmentFile = { name: string; path: string };

// Couleur des statuts (colonnes select) : vert = realise/cloture, orange =
// en cours, rouge = non realise/pas d'action. Les autres valeurs (vide,
// "NOUVELLE NC OUVERTE ANNEE N+1"...) restent neutres.
const STATUS_DONE = new Set(["REALISEE", "CLOTUREE"]);
const STATUS_EN_COURS = new Set(["EN COURS"]);
const STATUS_BLOQUE = new Set(["NON REALISEE", "PAS D'ACTION"]);

function statusColorClasses(value: string | number | null | undefined): string {
  const key = String(value ?? "").trim().toUpperCase();
  if (STATUS_DONE.has(key)) return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (STATUS_EN_COURS.has(key)) return "border-amber-300 bg-amber-50 text-amber-800";
  if (STATUS_BLOQUE.has(key)) return "border-red-300 bg-red-50 text-red-800";
  return "border-slate-200 bg-white text-slate-700";
}

// Widget "pieces jointes" pour UNE colonne (ex: "N"). Gere sa propre liste de
// fichiers independamment de rowsRef/handleSave - chaque ajout/suppression
// est une vraie ecriture immediate (Storage + base), pas une modification en
// attente du bouton "Enregistrer" general.
function AttachmentsCell({
  rowId,
  canWrite,
  initialFiles,
  createUploadSlotAction,
  confirmUploadAction,
  getFileUrlAction,
  deleteFileAction,
}: {
  rowId: number | null;
  canWrite: boolean;
  initialFiles: AttachmentFile[];
  createUploadSlotAction: (
    rowId: number,
    fileName: string
  ) => Promise<{ ok: boolean; message?: string; path?: string; signedUrl?: string }>;
  confirmUploadAction: (
    rowId: number,
    files: AttachmentFile[]
  ) => Promise<{ ok: boolean; message?: string; files?: AttachmentFile[] }>;
  getFileUrlAction: (path: string) => Promise<{ ok: boolean; url?: string; message?: string }>;
  deleteFileAction: (rowId: number, path: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [files, setFiles] = useState(initialFiles);
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  if (!rowId) {
    return <p className="mt-1 text-[11px] text-slate-400">Enregistre la ligne pour joindre un fichier.</p>;
  }

  function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError("");

    startTransition(async () => {
      // Chaque fichier est envoye DIRECTEMENT au stockage Supabase depuis le
      // navigateur (lien signe obtenu via createUploadSlotAction) plutot que
      // de passer par une Server Action - les fonctions serveur Vercel
      // refusent toute requete de plus de 4.5 Mo quel que soit le reglage
      // Next.js, ce qui bloquait deja les videos et aurait fini par bloquer
      // aussi les photos les plus lourdes.
      const uploaded: AttachmentFile[] = [];
      for (const file of Array.from(fileList)) {
        const slot = await createUploadSlotAction(rowId as number, file.name);
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
          uploaded.push({ name: file.name, path: slot.path });
        } catch {
          setError(`Erreur pendant l'envoi de "${file.name}".`);
        }
      }

      if (uploaded.length > 0) {
        const result = await confirmUploadAction(rowId as number, uploaded);
        if (!result.ok) {
          setError(result.message || "Erreur pendant l'enregistrement.");
        } else {
          setFiles((prev) => [...prev, ...uploaded]);
          setExpanded(true);
        }
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function handleView(path: string) {
    setError("");
    // Ouvre l'onglet tout de suite (dans le clic, pendant que le navigateur
    // considere encore que c'est un geste de l'utilisateur) puis le
    // redirige une fois l'URL signee recuperee - sinon un "window.open"
    // appele APRES un await est bloque silencieusement par le navigateur
    // (bloqueur de popup), meme si l'action vient bien d'un vrai clic.
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
        // Le navigateur a bloque meme l'ouverture de l'onglet vide (arrive
        // dans certains navigateurs integres/mobiles tres restrictifs) -
        // plutot que de retenter un window.open (bloque pour la meme
        // raison), on navigue dans l'onglet actuel : ca marche partout.
        window.location.href = result.url;
      }
    });
  }

  function handleDelete(path: string) {
    setError("");
    startTransition(async () => {
      const result = await deleteFileAction(rowId as number, path);
      if (!result.ok) {
        setError(result.message || "Erreur pendant la suppression.");
        return;
      }
      setFiles((prev) => prev.filter((f) => f.path !== path));
    });
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="text-[11px] font-semibold text-violet-700 hover:underline"
      >
        📎 {files.length > 0 ? `${files.length} fichier${files.length > 1 ? "s" : ""}` : "Joindre"}
      </button>
      {expanded ? (
        <div className="mt-1 grid gap-1">
          {files.map((file) => (
            <div key={file.path} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleView(file.path)}
                disabled={isPending}
                className="truncate text-left text-[11px] text-sky-700 hover:underline disabled:opacity-60"
                title={file.name}
              >
                {file.name}
              </button>
              {canWrite ? (
                <button
                  type="button"
                  onClick={() => handleDelete(file.path)}
                  disabled={isPending}
                  className="text-[11px] font-bold text-red-600 disabled:opacity-60"
                  title="Supprimer ce fichier"
                >
                  x
                </button>
              ) : null}
            </div>
          ))}
          {canWrite ? (
            <input
              ref={inputRef}
              type="file"
              multiple
              onChange={(e) => handleUpload(e.target.files)}
              disabled={isPending}
              className="mt-1 text-[11px]"
            />
          ) : null}
          {error ? <p className="text-[11px] font-semibold text-red-700">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

// Meme principe que ProgrammeLigneTable (Programme par ligne) : les valeurs
// des cellules vivent dans une ref (rowsRef), pas dans du useState, pour que
// taper dans un champ ne redeclenche jamais le rendu de tout le tableau -
// seul l'AJOUT/la SUPPRESSION d'une ligne (rowKeys) redessine la table.
// Un seul bouton "Enregistrer" pour toutes les lignes a la fois - jamais un
// bouton par ligne.
export function AuditTable({
  columns,
  initialRows,
  canWrite,
  saveBatchAction,
  deleteRowAction,
  attachmentsColumnKey,
  initialAttachments,
  createUploadSlotAction,
  confirmUploadAction,
  getFileUrlAction,
  deleteFileAction,
  progressColumnKeys,
  progressStatusColumnKey,
  progressDoneStatus,
  closureSourceKeys,
  closureTargetKey,
  closureDoneValue,
  closureClosedStatus,
  closureOpenStatus,
  restrictedColumnKeys,
  canEditRestrictedColumns,
}: {
  columns: AuditColumn[];
  initialRows: AuditRow[];
  canWrite: boolean;
  saveBatchAction: (
    rows: AuditRow[]
  ) => Promise<{ ok: boolean; message?: string; insertedIds?: number[] }>;
  deleteRowAction: (id: number) => Promise<void>;
  // Pieces jointes (optionnel) : uniquement sur la colonne attachmentsColumnKey.
  attachmentsColumnKey?: string;
  initialAttachments?: Record<number, AttachmentFile[]>;
  createUploadSlotAction?: (
    rowId: number,
    fileName: string
  ) => Promise<{ ok: boolean; message?: string; path?: string; signedUrl?: string }>;
  confirmUploadAction?: (
    rowId: number,
    files: AttachmentFile[]
  ) => Promise<{ ok: boolean; message?: string; files?: AttachmentFile[] }>;
  getFileUrlAction?: (path: string) => Promise<{ ok: boolean; url?: string; message?: string }>;
  deleteFileAction?: (rowId: number, path: string) => Promise<{ ok: boolean; message?: string }>;
  // Cloture automatique (optionnel, ex: TAF) : quand la somme des colonnes
  // progressColumnKeys atteint 100% (1), progressStatusColumnKey passe
  // automatiquement a progressDoneStatus.
  progressColumnKeys?: string[];
  progressStatusColumnKey?: string;
  progressDoneStatus?: string;
  // Statut de cloture derive de 2 statuts source (optionnel, ex: NC :
  // Statut correction + Statut AC -> Statut cloture). closureTargetKey vaut
  // closureClosedStatus si les 2 closureSourceKeys valent closureDoneValue,
  // sinon closureOpenStatus.
  closureSourceKeys?: [string, string];
  closureTargetKey?: string;
  closureDoneValue?: string;
  closureClosedStatus?: string;
  closureOpenStatus?: string;
  // Colonnes verrouillees (optionnel) : ces colonnes restent en lecture
  // seule pour tout le monde, meme un utilisateur avec canWrite=true (y
  // compris l'admin), sauf si canEditRestrictedColumns est vrai.
  restrictedColumnKeys?: string[];
  canEditRestrictedColumns?: boolean;
}) {
  const [rowKeys, setRowKeys] = useState<string[]>(() => initialRows.map((r) => `row-${r.id}`));
  const rowsRef = useRef<Record<string, AuditRow>>(
    Object.fromEntries(initialRows.map((r) => [`row-${r.id}`, r]))
  );
  const nextTempId = useRef(-1);
  // Redessine la ligne apres un Save reussi : les nouvelles lignes recoivent
  // alors un id reel (voir handleSave), necessaire pour que la cellule
  // pieces-jointes de cette ligne cesse d'etre desactivee.
  const [, forceRerender] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  // Ref DOM des <select> de statut, indexee par "rowKey::colKey" - permet
  // de mettre a jour visuellement un statut calcule automatiquement (couleur
  // + valeur) sans redessiner tout le tableau (voir rowsRef plus haut).
  const statusSelectRefs = useRef<Record<string, HTMLSelectElement | null>>({});
  function updateCell(key: string, field: string, value: string) {
    rowsRef.current[key] = { ...rowsRef.current[key], [field]: value };
  }

  function setStatusValue(key: string, columnKey: string, value: string) {
    updateCell(key, columnKey, value);
    const select = statusSelectRefs.current[`${key}::${columnKey}`];
    if (select) {
      select.value = value;
      select.className = `${statusSelectBaseClass} ${statusColorClasses(value)}`;
    }
  }

  function maybeAutoCloseProgress(key: string) {
    if (!progressColumnKeys || !progressStatusColumnKey) return;
    const row = rowsRef.current[key];
    const total = progressColumnKeys.reduce((sum, colKey) => {
      const n = parseFloat(String(row[colKey] ?? "").replace(",", "."));
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
    if (total >= 0.999) {
      setStatusValue(key, progressStatusColumnKey, progressDoneStatus || "CLOTUREE");
    }
  }

  function maybeRecomputeClosure(key: string) {
    if (!closureSourceKeys || !closureTargetKey) return;
    const row = rowsRef.current[key];
    const done = (closureDoneValue || "REALISEE").trim().toUpperCase();
    const allDone = closureSourceKeys.every((colKey) => String(row[colKey] ?? "").trim().toUpperCase() === done);
    const next = allDone ? closureClosedStatus || "CLOTUREE" : closureOpenStatus || "EN COURS";
    setStatusValue(key, closureTargetKey, next);
  }

  function addRow() {
    const key = `row-${nextTempId.current--}`;
    const blank: AuditRow = { id: null };
    for (const col of columns) blank[col.key] = "";
    rowsRef.current[key] = blank;
    // Ajoutee tout en haut, juste sous "+ Ajouter une ligne" - immediatement
    // visible sans avoir a chercher dans un tableau de 78/147 lignes.
    setRowKeys((prev) => [key, ...prev]);
  }

  function removeRow(key: string) {
    const row = rowsRef.current[key];
    if (row?.id) {
      setIsDeleting(key);
      startTransition(async () => {
        try {
          await deleteRowAction(row.id!);
          delete rowsRef.current[key];
          setRowKeys((prev) => prev.filter((k) => k !== key));
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : "Erreur pendant la suppression.");
        } finally {
          setIsDeleting(null);
        }
      });
    } else {
      delete rowsRef.current[key];
      setRowKeys((prev) => prev.filter((k) => k !== key));
    }
  }

  function handleSave() {
    setMessage("");
    setErrorMessage("");

    startTransition(async () => {
      try {
        const payload = rowKeys.map((key) => rowsRef.current[key]);
        const result = await saveBatchAction(payload);
        if (!result.ok) {
          setErrorMessage(result.message || "Erreur pendant l'enregistrement.");
          return;
        }
        // Reconcilie les ids des lignes nouvellement inserees (id encore
        // null cote client) avec ceux attribues par la base - sinon un
        // Supprimer juste apres cet Enregistrer prendrait a tort la ligne
        // pour "jamais sauvegardee" et la retirerait seulement de l'ecran,
        // orpheline en base.
        if (result.insertedIds && result.insertedIds.length > 0) {
          let idx = 0;
          const savedKeys: string[] = [];
          for (const key of rowKeys) {
            if (rowsRef.current[key].id === null) {
              rowsRef.current[key] = { ...rowsRef.current[key], id: result.insertedIds[idx] };
              idx++;
              savedKeys.push(key);
            }
          }
          // Une fois enregistree, la ligne n'a plus besoin de rester tout en
          // haut (ou elle a ete saisie) - elle rejoint le reste, en bas.
          setRowKeys((prev) => [...prev.filter((k) => !savedKeys.includes(k)), ...savedKeys]);
          forceRerender((n) => n + 1);
        }
        setMessage("Enregistre.");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Erreur pendant l'enregistrement.");
      }
    });
  }

  const cellClass =
    "w-48 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";
  const longCellClass =
    "w-full min-w-[26rem] rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";
  const statusSelectBaseClass =
    "w-48 rounded-xl border px-3 py-2 text-sm font-semibold outline-none disabled:cursor-not-allowed disabled:opacity-60";

  function isColumnEditable(col: AuditColumn): boolean {
    if (!canWrite) return false;
    if (restrictedColumnKeys?.includes(col.key)) return Boolean(canEditRestrictedColumns);
    return true;
  }

  return (
    <div className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      {/* Barre Ajouter/Enregistrer HORS du cadre defilant - toujours visible
          des qu'on voit le tableau, sans avoir besoin d'etre "collante"
          elle-meme. La garder DANS le cadre (sticky top-0) obligeait a
          mesurer sa hauteur en JS pour decaler l'entete en dessous - un
          decalage rate (mesure a 0) faisait recouvrir l'entete par cette
          barre (z-index superieur), la rendant invisible des le moindre
          defilement. */}
      {canWrite ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-4">
          <button
            type="button"
            onClick={addRow}
            className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
          >
            + Ajouter une ligne
          </button>
          <div className="flex items-center gap-3">
            {message ? <p className="text-sm font-semibold text-emerald-700">{message}</p> : null}
            {errorMessage ? <p className="text-sm font-semibold text-red-700">{errorMessage}</p> : null}
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="rounded-full bg-violet-700 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:opacity-60"
            >
              {isPending ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </div>
      ) : null}

    <div className="max-h-[75vh] overflow-auto">
      <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
              {canWrite ? (
                <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">
                  Actions
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rowKeys.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-6 text-center text-sm text-slate-500">
                  Aucune ligne pour le moment.
                </td>
              </tr>
            ) : (
              rowKeys.map((key) => {
                const row = rowsRef.current[key];
                return (
                  <tr key={key} className="border-t border-slate-100 align-top">
                    {columns.map((col) =>
                      isColumnEditable(col) ? (
                        <td key={col.key} className="px-4 py-3">
                          {col.select ? (
                            <select
                              ref={(el) => {
                                statusSelectRefs.current[`${key}::${col.key}`] = el;
                              }}
                              defaultValue={row[col.key] ?? ""}
                              onChange={(e) => {
                                updateCell(key, col.key, e.target.value);
                                e.target.className = `${statusSelectBaseClass} ${statusColorClasses(e.target.value)}`;
                                if (closureSourceKeys?.includes(col.key)) maybeRecomputeClosure(key);
                              }}
                              className={`${statusSelectBaseClass} ${statusColorClasses(row[col.key])}`}
                            >
                              <option value="">-</option>
                              {/* La valeur existante est toujours proposee meme si elle ne
                                  correspond plus exactement a la liste (ancienne saisie libre) -
                                  jamais silencieusement remplacee par un select vide. */}
                              {row[col.key] && !col.select.includes(String(row[col.key])) ? (
                                <option value={String(row[col.key])}>{String(row[col.key])}</option>
                              ) : null}
                              {col.select.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          ) : col.long ? (
                            <textarea
                              defaultValue={row[col.key] ?? ""}
                              onChange={(e) => updateCell(key, col.key, e.target.value)}
                              rows={6}
                              className={longCellClass}
                            />
                          ) : (
                            <input
                              type="text"
                              defaultValue={row[col.key] ?? ""}
                              onChange={(e) => {
                                updateCell(key, col.key, e.target.value);
                                if (progressColumnKeys?.includes(col.key)) maybeAutoCloseProgress(key);
                              }}
                              className={cellClass}
                            />
                          )}
                          {col.key === attachmentsColumnKey &&
                          createUploadSlotAction &&
                          confirmUploadAction &&
                          getFileUrlAction &&
                          deleteFileAction ? (
                            <AttachmentsCell
                              rowId={row.id}
                              canWrite={canWrite}
                              initialFiles={(row.id && initialAttachments?.[row.id]) || []}
                              createUploadSlotAction={createUploadSlotAction}
                              confirmUploadAction={confirmUploadAction}
                              getFileUrlAction={getFileUrlAction}
                              deleteFileAction={deleteFileAction}
                            />
                          ) : null}
                        </td>
                      ) : (
                        <td
                          key={col.key}
                          className={`px-4 py-3 text-slate-600 ${
                            col.long ? "min-w-[26rem] whitespace-pre-wrap" : ""
                          }`}
                        >
                          {col.select ? (
                            <span
                              className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${statusColorClasses(
                                row[col.key]
                              )}`}
                            >
                              {row[col.key] || "-"}
                            </span>
                          ) : (
                            row[col.key] || "-"
                          )}
                          {col.key === attachmentsColumnKey &&
                          createUploadSlotAction &&
                          confirmUploadAction &&
                          getFileUrlAction &&
                          deleteFileAction ? (
                            <AttachmentsCell
                              rowId={row.id}
                              canWrite={canWrite}
                              initialFiles={(row.id && initialAttachments?.[row.id]) || []}
                              createUploadSlotAction={createUploadSlotAction}
                              confirmUploadAction={confirmUploadAction}
                              getFileUrlAction={getFileUrlAction}
                              deleteFileAction={deleteFileAction}
                            />
                          ) : null}
                        </td>
                      )
                    )}
                    {canWrite ? (
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => removeRow(key)}
                          disabled={isDeleting === key}
                          title="Supprimer cette ligne"
                          className="h-9 w-9 rounded-xl border border-red-200 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                        >
                          x
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
    </div>

      {canWrite ? (
        <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {message ? <p className="text-sm font-semibold text-emerald-700">{message}</p> : null}
            {errorMessage ? <p className="text-sm font-semibold text-red-700">{errorMessage}</p> : null}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="rounded-full bg-violet-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:opacity-60"
          >
            {isPending ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
