// Statut d'une cellule mois (formation-month-cell.tsx) : la date fait
// office d'indicateur "realise" - vert des qu'une date est ecrite, rouge si
// le mois cible (annee/mois de la colonne, pas forcement le texte de la
// date lui-meme) est deja passe sans aucune date, jaune si planifie mais le
// mois n'est pas encore passe, "-" si le mois n'est pas du tout planifie.
// Fichier a part (pas de "use client") pour rester appelable aussi bien
// depuis le composant client (cellule) que depuis page.tsx cote serveur
// (comptage automatique des lignes Bilan).
export function monthStatus(annee: number, mois: number, planifie: boolean, hasDate: boolean) {
  if (!planifie) return "none";
  if (hasDate) return "done";
  const now = new Date();
  const overdue = annee < now.getFullYear() || (annee === now.getFullYear() && mois < now.getMonth() + 1);
  return overdue ? "late" : "pending";
}
