export type LigneRow = {
  zone: string;
  chaine: string;
};

// Structure fixe (zone + chaine) copiee telle quelle depuis la feuille
// Excel "Programe par ligne" du fichier GFPC-ENR-032 - partagee entre
// /programe-par-ligne et /ravitailleur-par-ligne. Une seule ligne par
// chaine (les doublons de l'Excel original sont geres dynamiquement dans
// le tableau via le bouton "+" pour ajouter un 2eme article sur la meme
// chaine).
export const ZONE_GROUPS: LigneRow[][] = [
  [
    { zone: "B1Z1", chaine: "CHAINE 1" },
    { zone: "B1Z1", chaine: "CHAINE 2" },
    { zone: "B1Z1", chaine: "CHAINE 3" },
    { zone: "B1Z1", chaine: "CHAINE 4" },
    { zone: "B1Z1", chaine: "CHAINE 5" },
    { zone: "B1Z1", chaine: "CHAINE 6" },
    { zone: "B1Z1", chaine: "CHAINE 7" },
    { zone: "B1Z1", chaine: "CHAINE 8" },
  ],
  [
    { zone: "B1Z2", chaine: "CHAINE 9C" },
    { zone: "B1Z2", chaine: "CHAIINE 9B" },
    { zone: "B1Z2", chaine: "CHAINE 10A" },
    { zone: "B1Z2", chaine: "CHAINE 10B" },
    { zone: "B1Z2", chaine: "CHAINE 11A" },
    { zone: "B1Z2", chaine: "CHAINE 11B" },
    { zone: "B1Z2", chaine: "CHAINE 12A" },
    { zone: "B1Z2", chaine: "CHAINE 12B" },
  ],
  [
    { zone: "B4Z1", chaine: "TUBE 1" },
    { zone: "B4Z1", chaine: "TUBE 2" },
    { zone: "B4Z1", chaine: "TUBE 3" },
  ],
  [
    { zone: "B4Z2", chaine: "CHAINE 4" },
    { zone: "B4Z2", chaine: "CHAINE 5" },
    { zone: "B4Z2", chaine: "CHAINE 6" },
    { zone: "B4Z2", chaine: "CHAINE 7" },
    { zone: "B4Z2", chaine: "CHAINE 8" },
    { zone: "B4Z2", chaine: "CHAINE 9" },
  ],
  [
    { zone: "B4Z3", chaine: "CHAINE 1" },
    { zone: "B4Z3", chaine: "CHAINE 2" },
    { zone: "B4Z3", chaine: "CHAINE 3" },
    { zone: "B4Z3", chaine: "CHAINE 4" },
  ],
  [
    { zone: "D", chaine: "CHAINE 1 2 TETE" },
    { zone: "D", chaine: "CHAINE 2" },
    { zone: "D", chaine: "CHAINE 3" },
    { zone: "D", chaine: "CHAINE 4" },
    { zone: "D", chaine: "SAVON" },
    { zone: "D", chaine: "u2 Robotique" },
    { zone: "D", chaine: "TALC" },
    { zone: "D", chaine: "savon gelle moroco noir" },
    { zone: "D", chaine: "PARFUME ROLL ON" },
  ],
];
