// Capacite machine x article (voir app/production/machines/[id] - "Ajouter
// un produit" sur une machine) - Conditionnement/Emballage : capacite =
// piece/minute ; Fabrication : capacite_min/capacite_max = kg/heure.
// HEURES_PAR_JOUR convertit ce taux horaire Fabrication en volume max/min
// producible sur une journee normale (8h, meme base que
// lib/heures-supplementaires.ts) - choix confirme explicitement par
// l'utilisateur. Fonctions pures (aucun acces DB), partagees entre
// "Programme par ligne" (programme-table.tsx, colonne "Max possible") et son
// Dispatch (app/programe-par-ligne/actions.ts, limite de decoupage en lots)
// pour que les 2 utilisent exactement le meme calcul.
export const HEURES_PAR_JOUR = 8;

export type MachineCapacite = {
  machineId: number;
  articleId: number;
  capacite: number | null;
  capaciteMin: number | null;
  capaciteMax: number | null;
};

// La capacite Fabrication est normalement saisie sur le vrac_article_id de
// l'article fini, mais le formulaire d'ajout de capacite ne distingue pas
// vrac/fini dans son champ de recherche - certaines fiches machine sont donc
// saisies directement sur l'article fini (ex: machine "Melangeur I" /
// article "POMMADE MY FAMILY CARE ALMOND 200ML", au lieu de son vrac reel).
// Le lookup essaie le vrac d'abord puis retombe sur l'article fini, pour
// rester correct dans les 2 cas reels rencontres en base.
export function findCapaciteFabrication(
  capacites: Map<string, MachineCapacite>,
  machineFabricationId: number | null | undefined,
  vracArticleId: number | null | undefined,
  articleId: number | null | undefined
): MachineCapacite | undefined {
  if (machineFabricationId == null || articleId == null) return undefined;
  return (
    (vracArticleId != null ? capacites.get(`${machineFabricationId}::${vracArticleId}`) : undefined) ??
    capacites.get(`${machineFabricationId}::${articleId}`)
  );
}
