// Fichier separe (pas "use server") : un fichier "use server" ne peut
// exporter que des fonctions async, pas cette constante.
export const STATUT_OPTIONS = [
  "Commande",
  "Commande approuvee",
  "En cours de livraison",
  "Arrive port",
  "Arrive usine",
] as const;
