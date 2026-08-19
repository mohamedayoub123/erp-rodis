// Constante partagee entre composants client (selecteurs) et server actions
// (validation) - reste dans un module SANS "use client" : un export simple
// depuis un fichier "use client" devient une reference client (pas la
// valeur reelle) quand une server action l'importe, et ".includes" plante.
export const DEVISE_OPTIONS = ["FCFA", "USD", "EUR"] as const;
