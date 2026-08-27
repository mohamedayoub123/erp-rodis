// Valeur par defaut "intelligente" pour un champ DateJmaFormField qui
// represente LA date d'une saisie Fabrication/Conditionnement/Emballage
// (pas une date independante comme la peremption) : si une date a deja ete
// enregistree (on rouvre une saisie existante), elle est gardee telle
// quelle - sinon (nouvelle saisie), le jour vient du programme (date_jour
// de programme_lignes, le jour prevu de cette production) et le mois/annee
// sont ceux d'aujourd'hui (cas courant : la saisie se fait le jour meme ou
// tres peu apres) - demande explicite, les 3 champs restent modifiables a
// la main ensuite.
//
// Fichier a part (PAS dans date-jma-input.tsx, qui a "use client") - une
// page serveur (Conditionnement/Emballage) appelle cette fonction
// directement dans son rendu ; un export de fichier client ne peut etre
// que rendu comme composant ou passe en prop, jamais appele depuis du code
// serveur (bug reel confirme : "Attempted to call smartEntryDateDefault()
// from the server but smartEntryDateDefault is on the client", page
// Conditionnement/Emballage completement cassee, page d'erreur generique en
// production).
export function smartEntryDateDefault(
  existingValue: string | null | undefined,
  ligneDateJour: string | null | undefined
): string {
  if (existingValue) return existingValue;
  const day = (ligneDateJour || "").slice(8, 10);
  if (!day) return "";
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const year = String(today.getFullYear());
  return `${year}-${month}-${day}`;
}
