"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

// BROUILLON D'UN FORMULAIRE : ce qui est deja rempli reste apres une actualisation de la page (F5, tirer pour actualiser sur iPad,
// onglet recharge par le navigateur). La saisie est gardee sur l'appareil (localStorage) tant que le formulaire n'est pas enregistre ;
// un Enregistrer efface le brouillon. A placer comme PREMIER element dans le <form> :  <BrouillonFormulaire cle="..." />
//
//  * Tout champ nomme du formulaire est repris automatiquement (texte, nombre, case a cocher). Un champ SANS nom peut etre repris en
//    lui mettant data-brouillon-nom="..." (sans rien changer a ce qui est envoye au serveur) ; un champ cache n'est repris que s'il
//    porte data-brouillon ou data-brouillon-nom.
//  * Un composant qui garde sa valeur dans son propre etat (heure, liste de noms, casiers...) reprend sa valeur avec
//    useRestaurationBrouillon : le brouillon lui envoie un evenement "brouillon-restaurer".
//  * Un enregistrement refuse par le serveur (la page revient avec ?erreur=...) : la saisie envoyee est remise, rien n'est a retaper.

const PREFIXE = "brouillon-formulaire:";
const EVENEMENT_RESTAURER = "brouillon-restaurer";
const DUREE_DE_VIE_MS = 12 * 60 * 60 * 1000;
const DUREE_ENVOI_MS = 5 * 60 * 1000;
const DELAI_SOUMISSION_MS = 20 * 1000;
const NOMS_IGNORES = new Set(["ligne_id", "code"]);
const TYPES_IGNORES = new Set(["submit", "button", "file", "password", "reset", "image"]);

type Champs = Record<string, string[]>;
type Brouillon = { t: number; champs: Champs };
type ChampDuFormulaire = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type DetailRestauration = { nom: string; valeurs: string[] };

function lire(cle: string): Brouillon | null {
  try {
    const brut = window.localStorage.getItem(cle);
    if (!brut) return null;
    const lu = JSON.parse(brut) as Partial<Brouillon> | null;
    if (!lu || typeof lu.t !== "number" || !lu.champs || typeof lu.champs !== "object") return null;
    return { t: lu.t, champs: lu.champs };
  } catch {
    return null;
  }
}

function ecrire(cle: string, brouillon: Brouillon) {
  try {
    window.localStorage.setItem(cle, JSON.stringify(brouillon));
  } catch {
    // Stockage plein ou interdit (navigation privee) : pas de brouillon, le formulaire marche comme avant
  }
}

function effacer(cle: string) {
  try {
    window.localStorage.removeItem(cle);
  } catch {
    // rien
  }
}

function nomDuChamp(champ: ChampDuFormulaire): string | null {
  const nom = champ.dataset.brouillonNom || champ.name;
  return nom && !NOMS_IGNORES.has(nom) ? nom : null;
}

// Etat actuel du formulaire : nom du champ -> valeur(s). Cases a cocher : seulement celles qui sont cochees.
function photographier(formulaire: HTMLFormElement): Champs {
  const champs: Champs = {};
  for (const champ of formulaire.querySelectorAll<ChampDuFormulaire>("input, select, textarea")) {
    const nom = nomDuChamp(champ);
    if (!nom) continue;
    if (champ instanceof HTMLInputElement) {
      if (TYPES_IGNORES.has(champ.type) || champ.readOnly) continue;
      if (champ.type === "hidden" && !champ.hasAttribute("data-brouillon") && !champ.dataset.brouillonNom) continue;
      if (champ.type === "checkbox" || champ.type === "radio") {
        if (champ.checked) champs[nom] = [...(champs[nom] ?? []), champ.value];
        continue;
      }
    }
    champs[nom] = [...(champs[nom] ?? []), champ.value];
  }
  return champs;
}

// Ecrit une valeur dans un champ que React pilote : on passe par le setter natif puis on declenche "input", sinon React ne voit pas le changement.
function ecrireValeur(champ: ChampDuFormulaire, valeur: string) {
  const prototype =
    champ instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : champ instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  const ecrireNatif = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (ecrireNatif) ecrireNatif.call(champ, valeur);
  else champ.value = valeur;
  champ.dispatchEvent(new Event("input", { bubbles: true }));
  champ.dispatchEvent(new Event("change", { bubbles: true }));
}

function restaurer(formulaire: HTMLFormElement, champs: Champs) {
  for (const [nom, valeurs] of Object.entries(champs)) {
    if (!Array.isArray(valeurs)) continue;
    const cibles = [
      ...formulaire.querySelectorAll<ChampDuFormulaire>(
        `[name="${CSS.escape(nom)}"], [data-brouillon-nom="${CSS.escape(nom)}"]`
      ),
    ];
    if (cibles.length === 0) continue;

    // 1) Un composant qui gere son propre etat repond a l'evenement (preventDefault = c'est fait)
    const detail: DetailRestauration = { nom, valeurs };
    const evenement = new CustomEvent<DetailRestauration>(EVENEMENT_RESTAURER, { detail, bubbles: true, cancelable: true });
    cibles[0].dispatchEvent(evenement);
    if (evenement.defaultPrevented) continue;

    // 2) Sinon : cases a cocher, ou champ texte / nombre / liste
    const premier = cibles[0];
    if (premier instanceof HTMLInputElement && (premier.type === "checkbox" || premier.type === "radio")) {
      for (const cible of cibles) {
        if (cible instanceof HTMLInputElement && cible.checked !== valeurs.includes(cible.value)) cible.click();
      }
      continue;
    }
    cibles.forEach((cible, index) => {
      if (cible instanceof HTMLInputElement && cible.readOnly) return;
      const valeur = valeurs[index];
      if (typeof valeur === "string" && cible.value !== valeur) ecrireValeur(cible, valeur);
    });
  }
}

// Pour un composant qui garde sa valeur dans son propre etat : `racine` est un element qui CONTIENT ses champs ;
// surRestauration(nom, valeurs) remet la valeur et renvoie true si ce composant gere ce champ.
export function useRestaurationBrouillon(
  racine: RefObject<HTMLElement | null>,
  surRestauration: (nom: string, valeurs: string[]) => boolean
) {
  const rappel = useRef(surRestauration);
  useEffect(() => {
    rappel.current = surRestauration;
  });
  useEffect(() => {
    const element = racine.current;
    if (!element) return;
    const ecouteur = (evenement: Event) => {
      const detail = (evenement as CustomEvent<DetailRestauration>).detail;
      if (detail && rappel.current(detail.nom, detail.valeurs)) evenement.preventDefault();
    };
    element.addEventListener(EVENEMENT_RESTAURER, ecouteur);
    return () => element.removeEventListener(EVENEMENT_RESTAURER, ecouteur);
  }, [racine]);
}

export function BrouillonFormulaire({ cle, erreur }: { cle: string; erreur?: string }) {
  const marqueur = useRef<HTMLSpanElement>(null);
  const repartirDeZero = useRef<() => void>(() => {});
  const [repris, setRepris] = useState(false);

  useEffect(() => {
    const formulaire = marqueur.current?.closest("form");
    if (!formulaire) return;
    const cleBrouillon = `${PREFIXE}${cle}`;
    const cleEnvoi = `${PREFIXE}envoi:${cle}`;
    let pret = false;
    let soumis = false;
    let initial = "";
    let dernier = "";
    const minuteurs: number[] = [];

    function sauvegarder() {
      if (!pret || soumis || !formulaire) return;
      const champs = photographier(formulaire);
      const json = JSON.stringify(champs);
      if (json === dernier) return;
      dernier = json;
      if (json === initial) effacer(cleBrouillon);
      else ecrire(cleBrouillon, { t: Date.now(), champs });
    }

    function enregistrementEnvoye() {
      if (!formulaire) return;
      // Le serveur peut refuser l'enregistrement : on garde la saisie envoyee pour la remettre si la page revient avec ?erreur=
      ecrire(cleEnvoi, { t: Date.now(), champs: photographier(formulaire) });
      effacer(cleBrouillon);
      soumis = true;
      // La page est encore la apres 20 s (reseau coupe...) : la saisie est a nouveau gardee
      minuteurs.push(
        window.setTimeout(() => {
          soumis = false;
        }, DELAI_SOUMISSION_MS)
      );
    }

    repartirDeZero.current = () => {
      soumis = true;
      effacer(cleBrouillon);
      effacer(cleEnvoi);
      window.location.reload();
    };

    // Apres le premier affichage : tous les composants du formulaire ont deja branche leur ecoute de restauration
    minuteurs.push(
      window.setTimeout(() => {
        initial = JSON.stringify(photographier(formulaire));
        const envoye = lire(cleEnvoi);
        effacer(cleEnvoi);
        const garde = lire(cleBrouillon);
        const source =
          erreur && envoye && Date.now() - envoye.t < DUREE_ENVOI_MS
            ? envoye
            : garde && Date.now() - garde.t < DUREE_DE_VIE_MS
              ? garde
              : null;
        if (!garde || garde.t + DUREE_DE_VIE_MS <= Date.now()) effacer(cleBrouillon);
        if (source && JSON.stringify(source.champs) !== initial) {
          restaurer(formulaire, source.champs);
          setRepris(true);
        }
        // Laisse React afficher les valeurs remises avant de recommencer a sauvegarder (sinon le brouillon serait ecrase par le formulaire vide)
        minuteurs.push(
          window.setTimeout(() => {
            dernier = JSON.stringify(photographier(formulaire));
            pret = true;
            sauvegarder();
          }, 500)
        );
      }, 0)
    );

    let attente: number | null = null;
    const surChangement = () => {
      if (attente !== null) window.clearTimeout(attente);
      attente = window.setTimeout(sauvegarder, 150);
    };
    const evenements = ["input", "change", "keyup", "pointerup", "click"] as const;
    for (const nom of evenements) formulaire.addEventListener(nom, surChangement);
    formulaire.addEventListener("submit", enregistrementEnvoye);
    const surDepart = () => sauvegarder();
    const surVisibilite = () => {
      if (document.visibilityState === "hidden") sauvegarder();
    };
    window.addEventListener("pagehide", surDepart);
    document.addEventListener("visibilitychange", surVisibilite);
    // Filet de securite : les heures (masque clavier) et les points des casiers ne declenchent pas toujours un evenement du formulaire
    const intervalle = window.setInterval(sauvegarder, 2000);

    return () => {
      for (const minuteur of minuteurs) window.clearTimeout(minuteur);
      if (attente !== null) window.clearTimeout(attente);
      window.clearInterval(intervalle);
      for (const nom of evenements) formulaire.removeEventListener(nom, surChangement);
      formulaire.removeEventListener("submit", enregistrementEnvoye);
      window.removeEventListener("pagehide", surDepart);
      document.removeEventListener("visibilitychange", surVisibilite);
    };
  }, [cle, erreur]);

  return (
    <>
      <span ref={marqueur} hidden />
      {repris ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          <span>Ta saisie a ete retrouvee : ce que tu avais deja rempli est remis. Rien n&apos;est enregistre tant que tu n&apos;as pas fait Save.</span>
          <button
            type="button"
            onClick={() => repartirDeZero.current()}
            className="rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100"
          >
            Repartir de zero
          </button>
        </div>
      ) : null}
    </>
  );
}
