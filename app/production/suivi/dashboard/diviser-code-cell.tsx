"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { arrondi2, lireNouveauCode, lireQuantiteNouveau } from "@/lib/diviser-code-vrac-shared";
import { diviserCodeVracAction } from "./diviser-code-actions";

// Colonne "N Lot" de la Fabrication (Dashboard) : le code + un petit bouton "Diviser" pour couper ce code en 2 (ex : AA1 = 3000 kg devient
// AA1 = 1500 kg + un nouveau code = 1500 kg, quand la fabrication se fait finalement sur une machine de plus petite capacite). La personne choisit
// la quantite du nouveau code et son nom ; le reste du vrac reste sur le code d'origine. Si le code ecrit est deja sur la ligne, la quantite
// s'ajoute sur lui. Refuse par le serveur des que le code divise est deja commence.
export function DiviserCodeCell({
  ligneId,
  code,
  vracPrevu,
  autresCodes,
}: {
  ligneId: number;
  code: string;
  vracPrevu: number;
  // les autres codes de la meme ligne, avec leur vrac prevu
  autresCodes: { code: string; vrac: number }[];
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [quantite, setQuantite] = useState("");
  const [nouveauCode, setNouveauCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const lectureQuantite = lireQuantiteNouveau(quantite, vracPrevu);
  const reste = quantite.trim() && lectureQuantite.ok ? lectureQuantite.quantiteGardee : null;
  const codeExistant = (saisi: string) => autresCodes.find((autre) => autre.code.toLowerCase() === saisi.trim().toLowerCase()) ?? null;
  const existant = codeExistant(nouveauCode);

  function ouvrir() {
    // la moitie par defaut : le cas courant (un code coupe en 2 morceaux egaux)
    setQuantite(String(arrondi2(vracPrevu / 2)));
    setNouveauCode("");
    setMessage(null);
    setOuvert(true);
  }

  function valider() {
    const q = lireQuantiteNouveau(quantite, vracPrevu);
    if (!q.ok) {
      setMessage(q.message);
      return;
    }
    const c = lireNouveauCode(nouveauCode);
    if (!c.ok) {
      setMessage(c.message);
      return;
    }
    const dejaLa = codeExistant(c.code);
    const recoit = dejaLa
      ? `${dejaLa.code} (deja sur la ligne) recoit ${q.quantiteNouveau} kg de plus : ${arrondi2(dejaLa.vrac)} + ${q.quantiteNouveau} = ${arrondi2(dejaLa.vrac + q.quantiteNouveau)} kg`
      : `${c.code} (nouveau code) prend ${q.quantiteNouveau} kg`;
    if (
      !window.confirm(
        `Diviser le code ${code} (${arrondi2(vracPrevu)} kg) ?\n\n${code} garde ${q.quantiteGardee} kg\n${recoit}\n\nLes cartons prevus de chaque code sont recalcules.`
      )
    ) {
      return;
    }
    setMessage(null);
    demarrer(async () => {
      try {
        const reponse = await diviserCodeVracAction(ligneId, code, q.quantiteNouveau, c.code);
        if (!reponse.ok) {
          setMessage(reponse.message);
          return;
        }
        setOuvert(false);
        // un avertissement du serveur (PD non mis a jour, Besoin deja valide) reste affiche sous le bouton
        if (reponse.message.includes("(attention :")) setMessage(reponse.message);
        router.refresh();
      } catch {
        setMessage("Division impossible (session fermee ?). Recharge la page.");
      }
    });
  }

  if (!ouvert) {
    return (
      <div className="mt-1 flex flex-col gap-1">
        <button
          type="button"
          onClick={ouvrir}
          title={`Diviser le code ${code} : une partie du vrac passe sur un autre code (nouveau, ou deja sur la ligne)`}
          className="w-fit rounded-full border border-dashed border-sky-300 px-2 py-0.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-50"
        >
          Diviser
        </button>
        {message ? <span className="max-w-[16rem] text-xs font-semibold text-red-600">{message}</span> : null}
      </div>
    );
  }

  return (
    <div className="mt-1 flex w-56 flex-col gap-1.5 rounded-xl border border-sky-200 bg-white p-2 shadow-sm">
      <p className="text-xs font-semibold text-slate-700">
        Diviser {code} ({arrondi2(vracPrevu)} kg)
      </p>
      <label className="grid gap-0.5 text-[11px] font-semibold text-slate-500">
        Vrac a deplacer (kg)
        <input
          type="text"
          inputMode="decimal"
          value={quantite}
          onChange={(evenement) => setQuantite(evenement.target.value)}
          className="rounded border border-slate-200 px-1.5 py-0.5 text-xs font-normal text-slate-800 focus:border-sky-400 focus:outline-none"
        />
      </label>
      <p className="text-[11px] text-slate-500">
        {reste !== null ? (
          <>
            Reste sur {code} : <span className="font-semibold text-slate-800">{reste} kg</span>
          </>
        ) : (
          "Le reste du vrac reste sur le code d'origine."
        )}
      </p>
      <label className="grid gap-0.5 text-[11px] font-semibold text-slate-500">
        Vers le code (nouveau ou existant)
        <input
          type="text"
          value={nouveauCode}
          onChange={(evenement) => setNouveauCode(evenement.target.value)}
          placeholder="ex : le code suivant"
          className="rounded border border-slate-200 px-1.5 py-0.5 text-xs font-normal text-slate-800 focus:border-sky-400 focus:outline-none"
        />
      </label>
      {existant && reste !== null && lectureQuantite.ok ? (
        <p className="text-[11px] text-slate-500">
          {existant.code} existe deja :{" "}
          <span className="font-semibold text-slate-800">
            {arrondi2(existant.vrac)} + {lectureQuantite.quantiteNouveau} = {arrondi2(existant.vrac + lectureQuantite.quantiteNouveau)} kg
          </span>
        </p>
      ) : null}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={valider}
          disabled={enCours}
          className="rounded bg-sky-700 px-2 py-0.5 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
        >
          {enCours ? "..." : "Diviser"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOuvert(false);
            setMessage(null);
          }}
          className="rounded px-1.5 py-0.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
        >
          Annuler
        </button>
      </div>
      {message ? <span className="text-xs font-semibold text-red-600">{message}</span> : null}
    </div>
  );
}
