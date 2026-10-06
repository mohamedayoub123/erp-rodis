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
type ImageDecodee = { source: CanvasImageSource; largeur: number; hauteur: number; fermer: () => void };

// Une photo de telephone porte son sens (portrait / paysage) dans ses metadonnees : on demande
// explicitement de le respecter. Si ce decodage echoue, on retombe sur une balise image.
async function decoder(fichier: File): Promise<ImageDecodee> {
  try {
    const bitmap = await createImageBitmap(fichier, { imageOrientation: "from-image" });
    return { source: bitmap, largeur: bitmap.width, hauteur: bitmap.height, fermer: () => bitmap.close() };
  } catch {
    const url = URL.createObjectURL(fichier);
    try {
      const img = new window.Image();
      await new Promise<void>((ok, ko) => {
        img.onload = () => ok();
        img.onerror = () => ko(new Error("decodage"));
        img.src = url;
      });
      return {
        source: img,
        largeur: img.naturalWidth,
        hauteur: img.naturalHeight,
        fermer: () => URL.revokeObjectURL(url),
      };
    } catch (erreur) {
      URL.revokeObjectURL(url);
      throw erreur;
    }
  }
}

async function reduireImage(fichier: File): Promise<Image> {
  const decodee = await decoder(fichier);
  try {
    const echelle = Math.min(1, COTE_MAX / Math.max(decodee.largeur, decodee.hauteur));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(decodee.largeur * echelle));
    canvas.height = Math.max(1, Math.round(decodee.hauteur * echelle));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(decodee.source, 0, 0, canvas.width, canvas.height);
    const apercu = canvas.toDataURL("image/jpeg", 0.85);
    return { base64: apercu.split(",")[1] ?? "", apercu };
  } finally {
    decodee.fermer();
  }
}

// Tourne la photo d'un quart de tour (si le telephone l'a enregistree couchee)
async function pivoterImage(image: Image): Promise<Image> {
  const img = new window.Image();
  await new Promise<void>((ok, ko) => {
    img.onload = () => ok();
    img.onerror = () => ko(new Error("decodage"));
    img.src = image.apercu;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalHeight;
  canvas.height = img.naturalWidth;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.translate(canvas.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, 0, 0);
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

export function PhotoTransferOrderForm({ depots }: { depots: DepotOption[] }) {
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
  // Listes d'articles recues avec la lecture de la photo (pour choisir un article a la main)
  const [articlesMp, setArticlesMp] = useState<ArticleOption[]>([]);
  const [articlesPf, setArticlesPf] = useState<ArticleOption[]>([]);
  // Change a chaque lecture : remet a zero les champs article (sinon l'ancien texte tape resterait)
  const [versionLecture, setVersionLecture] = useState(0);
  const zoneMessage = useRef<HTMLDivElement>(null);
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

  async function pivoter() {
    if (!image) return;
    setMessage(null);
    try {
      setImage(await pivoterImage(image));
    } catch {
      setMessage({ type: "erreur", texte: "Impossible de tourner cette image." });
    }
  }

  // Un message d'erreur apparait a cote du bouton "Creer" : on y amene l'ecran pour qu'il soit vu
  useEffect(() => {
    if (message?.type === "erreur") zoneMessage.current?.scrollIntoView({ block: "center" });
  }, [message]);

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
        setArticlesMp(reponse.articlesMp);
        setArticlesPf(reponse.articlesPf);
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
            nom: l.articleNom || l.nomLu,
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
        <p className="mt-1 text-xs text-slate-500">
          Pour une bonne lecture : tiens le telephone bien a plat au-dessus du document, avec tout le tableau dans la photo,
          bien eclaire et sans reflet. Si la photo est couchee, clique sur &laquo; Tourner la photo &raquo;.
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
          <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row">
            {/* items-start + object-contain : sur telephone l'apercu etait etire dans une bande large */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.apercu}
              alt="Photo du Transfer Order"
              className="h-auto max-h-72 w-auto max-w-full self-start rounded-xl border border-slate-200 object-contain"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={lirePhoto}
                disabled={enLecture}
                className="rounded-2xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-60"
              >
                {enLecture ? "Lecture en cours..." : lu ? "Lire de nouveau la photo" : "Lire la photo"}
              </button>
              <button
                type="button"
                onClick={() => void pivoter()}
                disabled={enLecture}
                className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-slate-500 disabled:opacity-60"
              >
                Tourner la photo
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {lu ? (
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <h2 className="text-lg font-bold text-slate-900">2. Verifie ce qui a ete lu</h2>
          <p className="mt-1 text-sm text-slate-600">
            Compare avec la photo : corrige un article ou une quantite si besoin, puis cree le Transfer Order. Rien n&apos;est
            cree avant ton clic. Le TO est cree meme si le stock du depot source est insuffisant : sa fiche montre le stock disponible de chaque ligne.
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

          <div ref={zoneMessage}>
            {message ? (
              <p
                className={`mt-4 rounded-2xl px-4 py-3 text-sm font-semibold ${
                  message.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                }`}
              >
                {message.texte}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Messages de l'etape 1 (lecture de la photo) : avant que l'ecran de verification n'existe */}
      {message && !lu ? (
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
