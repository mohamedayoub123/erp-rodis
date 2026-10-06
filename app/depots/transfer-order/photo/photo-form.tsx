"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProduitPickerField } from "@/app/production/suivi-production/produit-picker-field";
import type { ArticleTypePhoto, LigneLuePhoto } from "@/lib/transfer-order-photo";
import { lireQuantite } from "@/lib/vrac-a-recuperer";
import { creerTransferOrderDepuisPhotoAction, lirePhotoTransferOrderAction } from "./actions";

type ArticleOption = { id: number; label: string };
type DepotOption = { id: number; nom: string };

type LigneEdit = {
  cle: number;
  nomLu: string;
  quantite: string;
  articleType: ArticleTypePhoto;
  articleId: number | null;
  articleNom: string;
  statut: LigneLuePhoto["statut"];
};

type Image = { base64: string; apercu: string };

const COTE_MAX = 1800;

// La photo est reduite avant l'envoi (un telephone en fait 3 a 8 Mo) : 1800 px suffisent
// pour lire un tableau, et l'envoi reste rapide meme en 4G.
async function reduireImage(fichier: File): Promise<Image> {
  const bitmap = await createImageBitmap(fichier);
  const echelle = Math.min(1, COTE_MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * echelle);
  canvas.height = Math.round(bitmap.height * echelle);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const apercu = canvas.toDataURL("image/jpeg", 0.85);
  return { base64: apercu.split(",")[1] ?? "", apercu };
}

const CHAMP =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-600";

const BOUTON_CHOIX =
  "inline-flex cursor-pointer items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition";

const STATUT_STYLE: Record<LigneLuePhoto["statut"], { label: string; classe: string }> = {
  trouve: { label: "Trouve", classe: "bg-emerald-100 text-emerald-800" },
  proche: { label: "A verifier", classe: "bg-amber-100 text-amber-800" },
  introuvable: { label: "Introuvable", classe: "bg-red-100 text-red-700" },
};

export function PhotoTransferOrderForm({
  depots,
  articlesMp,
  articlesPf,
}: {
  depots: DepotOption[];
  articlesMp: ArticleOption[];
  articlesPf: ArticleOption[];
}) {
  const router = useRouter();
  const [image, setImage] = useState<Image | null>(null);
  const [enLecture, lancerLecture] = useTransition();
  const [enCreation, lancerCreation] = useTransition();
  const [message, setMessage] = useState<{ type: "ok" | "erreur"; texte: string } | null>(null);

  // Resultat de la lecture (null = pas encore lu)
  const [lu, setLu] = useState<{ depotSourceLu: string | null; depotDestinationLu: string | null } | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [depotSourceId, setDepotSourceId] = useState("");
  const [depotDestinationId, setDepotDestinationId] = useState("");
  const [remarque, setRemarque] = useState("");
  const [lignes, setLignes] = useState<LigneEdit[]>([]);
  // Change a chaque lecture : remet a zero les champs article (sinon l'ancien texte tape resterait)
  const [versionLecture, setVersionLecture] = useState(0);
  const entreeCamera = useRef<HTMLInputElement>(null);
  const entreeFichier = useRef<HTMLInputElement>(null);

  const choisirFichier = useCallback(async (fichier: File | undefined | null) => {
    if (!fichier) return;
    setMessage(null);
    try {
      setImage(await reduireImage(fichier));
      setLu(null);
      setLignes([]);
    } catch {
      setMessage({
        type: "erreur",
        texte: "Cette image ne peut pas etre lue. Prends la photo avec l'appareil photo ou utilise une image JPG ou PNG.",
      });
    }
  }, []);

  // Ctrl+V d'une capture d'ecran (ordinateur)
  useEffect(() => {
    function auCollage(evenement: ClipboardEvent) {
      const item = [...(evenement.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      const fichier = item?.getAsFile();
      if (fichier) {
        evenement.preventDefault();
        void choisirFichier(fichier);
      }
    }
    window.addEventListener("paste", auCollage);
    return () => window.removeEventListener("paste", auCollage);
  }, [choisirFichier]);

  function lirePhoto() {
    if (!image) return;
    setMessage(null);
    lancerLecture(async () => {
      try {
        const reponse = await lirePhotoTransferOrderAction(image.base64);
        if (!reponse.ok) {
          setMessage({ type: "erreur", texte: reponse.message });
          return;
        }
        setLu({ depotSourceLu: reponse.depotSourceLu, depotDestinationLu: reponse.depotDestinationLu });
        setVersionLecture((v) => v + 1);
        if (reponse.date) setDate(reponse.date);
        setDepotSourceId(reponse.depotSourceId ? String(reponse.depotSourceId) : "");
        setDepotDestinationId(reponse.depotDestinationId ? String(reponse.depotDestinationId) : "");
        setRemarque(
          reponse.numeroDocument ? `Cree depuis une photo - document ${reponse.numeroDocument}` : "Cree depuis une photo"
        );
        setLignes(
          reponse.lignes.map((l) => ({
            cle: l.cle,
            nomLu: l.nomLu,
            quantite: l.quantite === null ? "" : String(l.quantite).replace(".", ","),
            articleType: l.articleType,
            articleId: l.articleId,
            articleNom: l.articleNom,
            statut: l.statut,
          }))
        );
      } catch {
        setMessage({ type: "erreur", texte: "Lecture impossible (session fermee ?). Recharge la page." });
      }
    });
  }

  function majLigne(cle: number, changement: Partial<LigneEdit>) {
    setMessage(null);
    setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, ...changement } : l)));
  }

  function creer() {
    setMessage(null);
    if (!depotSourceId || !depotDestinationId) {
      setMessage({ type: "erreur", texte: "Choisis le depot source et le depot destination." });
      return;
    }
    if (depotSourceId === depotDestinationId) {
      setMessage({ type: "erreur", texte: "Le depot destination doit etre different du depot source." });
      return;
    }
    if (lignes.length === 0) {
      setMessage({ type: "erreur", texte: "Il n'y a plus aucun article dans la liste." });
      return;
    }
    for (const [i, l] of lignes.entries()) {
      if (!l.articleId) {
        setMessage({ type: "erreur", texte: `Ligne ${i + 1} (${l.nomLu}) : choisis l'article de l'ERP.` });
        return;
      }
      const quantite = lireQuantite(l.quantite);
      if (quantite === null || quantite <= 0) {
        setMessage({ type: "erreur", texte: `Ligne ${i + 1} (${l.nomLu}) : la quantite doit etre superieure a 0.` });
        return;
      }
    }

    lancerCreation(async () => {
      try {
        const reponse = await creerTransferOrderDepuisPhotoAction({
          date,
          depotSourceId: Number(depotSourceId),
          depotDestinationId: Number(depotDestinationId),
          remarque,
          lignes: lignes.map((l) => ({
            articleType: l.articleType,
            articleId: l.articleId as number,
            quantite: lireQuantite(l.quantite) as number,
          })),
          imageBase64: image?.base64 ?? "",
        });
        if (!reponse.ok) {
          setMessage({ type: "erreur", texte: reponse.message });
          return;
        }
        router.push(`/depots/transfer-order/${reponse.transferOrderId}`);
      } catch {
        setMessage({ type: "erreur", texte: "Creation impossible (session fermee ?). Recharge la page." });
      }
    });
  }

  const aVerifier = lignes.filter((l) => !l.articleId).length;

  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <h2 className="text-lg font-bold text-slate-900">1. La photo du TO</h2>
        <p className="mt-1 text-sm text-slate-600">
          Sur telephone, &laquo; Prendre une photo &raquo; ouvre directement l&apos;appareil photo. Sur ordinateur, choisis une
          image de ton disque, ou colle une capture d&apos;ecran avec Ctrl+V.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className={`${BOUTON_CHOIX} bg-slate-950 text-white hover:bg-slate-800`}>
            Prendre une photo
            <input
              ref={entreeCamera}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                void choisirFichier(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <label className={`${BOUTON_CHOIX} border border-slate-300 text-slate-800 hover:border-slate-500`}>
            Choisir une image
            <input
              ref={entreeFichier}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                void choisirFichier(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        {image ? (
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.apercu} alt="Photo du Transfer Order" className="max-h-72 rounded-xl border border-slate-200" />
            <button
              type="button"
              onClick={lirePhoto}
              disabled={enLecture}
              className="rounded-2xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-60"
            >
              {enLecture ? "Lecture en cours..." : lu ? "Lire de nouveau la photo" : "Lire la photo"}
            </button>
          </div>
        ) : null}
      </section>

      {lu ? (
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <h2 className="text-lg font-bold text-slate-900">2. Verifie ce qui a ete lu</h2>
          <p className="mt-1 text-sm text-slate-600">
            Compare avec la photo : corrige un article ou une quantite si besoin, puis cree le Transfer Order. Rien n&apos;est
            cree avant ton clic.
            {aVerifier > 0 ? (
              <span className="font-semibold text-red-600">
                {" "}
                {aVerifier} article{aVerifier > 1 ? "s" : ""} a choisir.
              </span>
            ) : null}
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={CHAMP} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Depot source{lu.depotSourceLu ? ` (photo : ${lu.depotSourceLu})` : ""}
              <select value={depotSourceId} onChange={(e) => setDepotSourceId(e.target.value)} className={CHAMP}>
                <option value="">Choisir...</option>
                {depots.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nom}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Depot destination{lu.depotDestinationLu ? ` (photo : ${lu.depotDestinationLu})` : ""}
              <select value={depotDestinationId} onChange={(e) => setDepotDestinationId(e.target.value)} className={CHAMP}>
                <option value="">Choisir...</option>
                {depots.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nom}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-1 font-semibold">Lu sur la photo</th>
                  <th className="px-2 py-1 font-semibold">Type</th>
                  <th className="px-2 py-1 font-semibold">Article de l&apos;ERP</th>
                  <th className="px-2 py-1 font-semibold">Quantite</th>
                  <th className="px-2 py-1 font-semibold">Etat</th>
                  <th className="px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => {
                  const statut = l.articleId ? l.statut : "introuvable";
                  const style = STATUT_STYLE[statut];
                  return (
                    <tr key={l.cle} className="align-middle">
                      <td className="min-w-48 px-2 font-medium text-slate-900">{l.nomLu}</td>
                      <td className="w-24 px-2">
                        <select
                          value={l.articleType}
                          onChange={(e) =>
                            majLigne(l.cle, {
                              articleType: e.target.value === "PF" ? "PF" : "MP",
                              articleId: null,
                              articleNom: "",
                              statut: "introuvable",
                            })
                          }
                          className={CHAMP}
                        >
                          <option value="MP">MP</option>
                          <option value="PF">PF</option>
                        </select>
                      </td>
                      <td className="min-w-72 px-2">
                        <ProduitPickerField
                          key={`${versionLecture}-${l.cle}-${l.articleType}`}
                          articles={l.articleType === "MP" ? articlesMp : articlesPf}
                          defaultValue={l.articleNom}
                          defaultArticleId={l.articleId}
                          hiddenName={`article_${l.cle}`}
                          textName={`produit_${l.cle}`}
                          onSelect={(id, label) =>
                            majLigne(l.cle, { articleId: id, articleNom: label ?? "", statut: id ? "trouve" : "introuvable" })
                          }
                        />
                      </td>
                      <td className="w-32 px-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={l.quantite}
                          onChange={(e) => majLigne(l.cle, { quantite: e.target.value })}
                          className={CHAMP}
                        />
                      </td>
                      <td className="px-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.classe}`}>{style.label}</span>
                      </td>
                      <td className="px-2 text-right">
                        <button
                          type="button"
                          onClick={() => setLignes((ls) => ls.filter((x) => x.cle !== l.cle))}
                          className="text-xs font-semibold text-red-600 hover:underline"
                        >
                          Retirer
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <label className="mt-4 grid gap-1 text-xs font-semibold text-slate-600">
            Remarque
            <input type="text" value={remarque} onChange={(e) => setRemarque(e.target.value)} maxLength={300} className={CHAMP} />
          </label>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={creer}
              disabled={enCreation}
              className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {enCreation ? "Creation..." : "Creer le Transfer Order"}
            </button>
          </div>
        </section>
      ) : null}

      {message ? (
        <p
          className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
            message.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {message.texte}
        </p>
      ) : null}
    </div>
  );
}
