"use client";

import { useEffect, useRef, useState, useTransition } from "react";

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

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "avif"]);

function isImageFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return IMAGE_EXTENSIONS.has(ext);
}

// Widget "pieces jointes" pour UNE colonne (ex: "N"). Gere sa propre liste de
// fichiers independamment de rowsRef/handleSave - chaque ajout/suppression
// est une vraie ecriture immediate (Storage + base), pas une modification en
// attente du bouton "Enregistrer" general. S'ouvre en cadre (modale) plutot
// qu'en liste depliee sur place - avec vignette directement visible pour les
// photos (recuperee a l'ouverture, pas au chargement de la page, pour ne pas
// generer des URLs signees pour des lignes jamais consultees).
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
  const [isOpen, setIsOpen] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // "webkitdirectory" (selection d'un dossier entier plutot que fichier par
  // fichier) n'existe pas dans les types JSX standard - on le pose a la
  // main sur l'element une fois monte. Supporte par tous les navigateurs de
  // bureau modernes (Chrome/Edge/Firefox). Le champ n'existe dans le DOM
  // que quand le cadre est ouvert (isOpen) - sans isOpen en dependance, cet
  // effet ne tournait qu'au tout premier montage du composant (isOpen
  // encore false, ref encore null) et ne se relancait jamais, donc
  // l'attribut n'etait en fait JAMAIS pose : le navigateur ouvrait un
  // selecteur de fichiers classique au lieu du selecteur de dossier.
  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute("webkitdirectory", "");
      folderInputRef.current.setAttribute("directory", "");
    }
  }, [isOpen]);

  if (!rowId) {
    return <p className="mt-1 text-[11px] text-slate-400">Enregistre la ligne pour joindre un fichier.</p>;
  }

  function handleOpen() {
    setError("");
    setIsOpen(true);
    // Vignettes des photos deja attachees, recuperees a l'ouverture du
    // cadre seulement (pas pour les fichiers deja charges - evite de
    // redemander une URL signee a chaque reouverture).
    const imageFiles = files.filter((f) => isImageFile(f.name) && !thumbnails[f.path]);
    if (imageFiles.length === 0) return;
    startTransition(async () => {
      const entries = await Promise.all(
        imageFiles.map(async (f) => {
          const result = await getFileUrlAction(f.path);
          return result.ok && result.url ? ([f.path, result.url] as const) : null;
        })
      );
      const next: Record<string, string> = {};
      for (const entry of entries) {
        if (entry) next[entry[0]] = entry[1];
      }
      if (Object.keys(next).length > 0) {
        setThumbnails((prev) => ({ ...prev, ...next }));
      }
    });
  }

  function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError("");
    const allFiles = Array.from(fileList);
    setUploadProgress({ done: 0, total: allFiles.length });
    setIsOpen(true);

    startTransition(async () => {
      // Chaque fichier est envoye DIRECTEMENT au stockage Supabase depuis le
      // navigateur (lien signe obtenu via createUploadSlotAction) plutot que
      // de passer par une Server Action - les fonctions serveur Vercel
      // refusent toute requete de plus de 4.5 Mo quel que soit le reglage
      // Next.js, ce qui bloquait deja les videos et aurait fini par bloquer
      // aussi les photos les plus lourdes.
      for (const file of allFiles) {
        // Quand le fichier vient d'un dossier attache entier (input
        // webkitdirectory), webkitRelativePath garde le sous-chemin
        // ("MonDossier/sous-dossier/photo.jpg") - affiche tel quel pour
        // qu'on sache d'ou vient chaque fichier une fois tout aplati dans
        // la liste des pieces jointes. slot.path (le chemin de stockage
        // reel) reste base uniquement sur file.name, pas ce chemin.
        const displayName = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const slot = await createUploadSlotAction(rowId as number, file.name);
        if (!slot.ok || !slot.path || !slot.signedUrl) {
          setError(slot.message || `Erreur pendant l'envoi de "${displayName}".`);
          setUploadProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
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
            setUploadProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
            continue;
          }

          // Enregistre CE fichier tout de suite, un par un, au lieu
          // d'attendre que TOUS les fichiers soient envoyes avant de tout
          // enregistrer d'un coup - avec un gros dossier (beaucoup de
          // fichiers, envoi long), une interruption en cours de route
          // (fermeture d'onglet, coupure reseau) perdait alors TOUT ce qui
          // avait deja ete envoye faute d'avoir ete confirme cote base.
          const uploadedFile: AttachmentFile = { name: displayName, path: slot.path };
          const result = await confirmUploadAction(rowId as number, [uploadedFile]);
          if (!result.ok) {
            setError(result.message || `Erreur pendant l'enregistrement de "${displayName}".`);
          } else {
            setFiles((prev) => [...prev, uploadedFile]);
            if (isImageFile(uploadedFile.name)) {
              const urlResult = await getFileUrlAction(uploadedFile.path);
              if (urlResult.ok && urlResult.url) {
                const thumbnailUrl = urlResult.url;
                setThumbnails((prev) => ({ ...prev, [uploadedFile.path]: thumbnailUrl }));
              }
            }
          }
        } catch {
          setError(`Erreur pendant l'envoi de "${displayName}".`);
        }
        setUploadProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
      }

      setUploadProgress(null);
      if (inputRef.current) inputRef.current.value = "";
      if (folderInputRef.current) folderInputRef.current.value = "";
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
    if (!window.confirm("Supprimer ce fichier ? Cette action est definitive.")) return;
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
        onClick={handleOpen}
        className="text-[11px] font-semibold text-violet-700 hover:underline"
      >
        {uploadProgress
          ? `⏳ Envoi ${uploadProgress.done}/${uploadProgress.total}...`
          : `📎 ${files.length > 0 ? `${files.length} fichier${files.length > 1 ? "s" : ""}` : "Joindre"}`}
      </button>
      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-800">Pieces jointes</h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-2xl leading-none text-slate-400 hover:text-slate-700"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
            {uploadProgress ? (
              <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
                <p className="text-sm font-semibold text-violet-800">
                  Envoi en cours : {uploadProgress.done} / {uploadProgress.total} fichier
                  {uploadProgress.total > 1 ? "s" : ""}
                </p>
                <p className="mt-1 text-xs text-violet-700">
                  Ne ferme pas cette page tant que l&apos;envoi n&apos;est pas termine.
                </p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-violet-100">
                  <div
                    className="h-full rounded-full bg-violet-600 transition-all"
                    style={{
                      width: `${uploadProgress.total > 0 ? Math.round((uploadProgress.done / uploadProgress.total) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}
            {files.length === 0 ? (
              <p className="text-base text-slate-400">Aucun fichier attache.</p>
            ) : (
              <div className="grid gap-3">
                {files.map((file) => (
                  <div key={file.path} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                    {isImageFile(file.name) ? (
                      thumbnails[file.path] ? (
                        <button
                          type="button"
                          onClick={() => handleView(file.path)}
                          disabled={isPending}
                          className="shrink-0 disabled:opacity-60"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={thumbnails[file.path]}
                            alt={file.name}
                            className="h-20 w-20 rounded-lg object-cover"
                          />
                        </button>
                      ) : (
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-400">
                          ...
                        </div>
                      )
                    ) : (
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-3xl">
                        📄
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleView(file.path)}
                      disabled={isPending}
                      className="flex-1 truncate text-left text-base text-sky-700 hover:underline disabled:opacity-60"
                      title={file.name}
                    >
                      {file.name}
                    </button>
                    {canWrite ? (
                      <button
                        type="button"
                        onClick={() => handleDelete(file.path)}
                        disabled={isPending}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl font-bold text-red-600 hover:bg-red-50 disabled:opacity-60"
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
              <div className="mt-4 flex flex-col gap-3">
                <label className="text-sm text-slate-600">
                  <span className="block font-semibold text-slate-500">Fichiers</span>
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    onChange={(e) => handleUpload(e.target.files)}
                    disabled={isPending}
                    className="mt-1"
                  />
                </label>
                <label className="text-sm text-slate-600">
                  <span className="block font-semibold text-slate-500">Ou un dossier entier</span>
                  <input
                    ref={folderInputRef}
                    type="file"
                    multiple
                    onChange={(e) => handleUpload(e.target.files)}
                    disabled={isPending}
                    className="mt-1"
                  />
                </label>
              </div>
            ) : null}
            {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
          </div>
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
      if (!window.confirm("Supprimer cette ligne ? Cette action est definitive.")) return;
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
          <thead className="bg-slate-50 text-slate-950">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-base font-bold whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
              {canWrite ? (
                <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-base font-bold">
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
                        <td key={col.key} className="px-4 py-3 text-slate-600">
                          {col.select ? (
                            <span
                              className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${statusColorClasses(
                                row[col.key]
                              )}`}
                            >
                              {row[col.key] || "-"}
                            </span>
                          ) : col.long ? (
                            // Meme taille (rows=6) que le champ modifiable
                            // equivalent (ex: "Commentaire") - avec defilement
                            // interne au lieu de laisser le texte etirer toute
                            // la ligne quand il est long.
                            <textarea
                              readOnly
                              value={String(row[col.key] ?? "") || "-"}
                              rows={6}
                              className={longCellClass}
                            />
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
