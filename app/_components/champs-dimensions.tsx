"use client";

import { useEffect, useRef, useState } from "react";
import {
  formaterLitres,
  formaterM3,
  formaterNombreColis,
  nombreColis,
  volumeColisLitres,
  volumeQuantiteM3,
} from "@/lib/volume-colis";

type Lecture = {
  longueur: number | null;
  largeur: number | null;
  hauteur: number | null;
  contenance: number | null;
  quantite: number | null;
};

function lireNombre(valeur: FormDataEntryValue | null): number | null {
  const texte = String(valeur ?? "").trim().replace(",", ".");
  if (!texte) return null;
  const nombre = Number(texte);
  return Number.isFinite(nombre) ? nombre : null;
}

// Longueur / largeur / hauteur d'UN colis (en cm) avec, en direct, son volume et celui de la quantite recue. Les champs sont
// envoyes avec le formulaire sous les noms "longueur", "largeur", "hauteur" (voir lireDimensionsColis, lib/volume-colis.ts) ;
// le volume de la quantite se calcule avec les champs "contenance" et "quantite_importee" du MEME formulaire (ecoutes ici),
// donc rien n'est enregistre par ce composant : il n'affiche que ce qui est calcule. Les 3 dimensions sont facultatives mais
// vont ensemble.
export function ChampsDimensions({
  longueur,
  largeur,
  hauteur,
  contenanceInitiale,
  quantiteInitiale,
  classeChamp,
}: {
  longueur?: number | null;
  largeur?: number | null;
  hauteur?: number | null;
  // valeurs deja presentes dans le formulaire au chargement (le composant ne peut les lire qu'apres une saisie)
  contenanceInitiale?: number | null;
  quantiteInitiale?: number | null;
  classeChamp: string;
}) {
  const racine = useRef<HTMLDivElement>(null);
  const [lecture, setLecture] = useState<Lecture>({
    longueur: longueur ?? null,
    largeur: largeur ?? null,
    hauteur: hauteur ?? null,
    contenance: contenanceInitiale ?? null,
    quantite: quantiteInitiale ?? null,
  });

  useEffect(() => {
    const formulaire = racine.current?.closest("form");
    if (!formulaire) return;

    function relire() {
      if (!formulaire) return;
      const donnees = new FormData(formulaire);
      setLecture({
        longueur: lireNombre(donnees.get("longueur")),
        largeur: lireNombre(donnees.get("largeur")),
        hauteur: lireNombre(donnees.get("hauteur")),
        contenance: lireNombre(donnees.get("contenance")),
        quantite: lireNombre(donnees.get("quantite_importee")),
      });
    }

    formulaire.addEventListener("input", relire);
    formulaire.addEventListener("change", relire);
    return () => {
      formulaire.removeEventListener("input", relire);
      formulaire.removeEventListener("change", relire);
    };
  }, []);

  const volumeLitres = volumeColisLitres(lecture.longueur, lecture.largeur, lecture.hauteur);
  const colis = nombreColis(lecture.quantite, lecture.contenance);
  const volumeReception = volumeQuantiteM3(lecture.quantite, lecture.contenance, volumeLitres);

  return (
    <div ref={racine} className="grid gap-1 text-xs text-slate-500">
      Dimensions d&apos;un colis (cm) - facultatif
      <div className="grid grid-cols-3 gap-2">
        <input
          type="number"
          step="0.01"
          min="0.01"
          name="longueur"
          defaultValue={longueur ?? undefined}
          placeholder="Long."
          aria-label="Longueur du colis en cm"
          className={classeChamp}
        />
        <input
          type="number"
          step="0.01"
          min="0.01"
          name="largeur"
          defaultValue={largeur ?? undefined}
          placeholder="Larg."
          aria-label="Largeur du colis en cm"
          className={classeChamp}
        />
        <input
          type="number"
          step="0.01"
          min="0.01"
          name="hauteur"
          defaultValue={hauteur ?? undefined}
          placeholder="Haut."
          aria-label="Hauteur du colis en cm"
          className={classeChamp}
        />
      </div>
      {volumeLitres !== null ? (
        <p className="font-semibold text-slate-800">
          Volume d&apos;un colis : {formaterLitres(volumeLitres)} ({formaterM3(volumeLitres / 1000)})
        </p>
      ) : (
        <p>Le volume sort tout seul quand les 3 dimensions sont remplies.</p>
      )}
      {volumeReception !== null ? (
        <p className="font-semibold text-slate-800">
          Volume de cette reception : {formaterM3(volumeReception)} ({formaterNombreColis(colis)} colis)
        </p>
      ) : volumeLitres !== null ? (
        <p>Renseigne la contenance et la quantite pour voir le volume de la reception.</p>
      ) : null}
    </div>
  );
}
