// Les 6 parties du rapport (sommaire a gauche) : identifiant dans la page + libelle.
export const PARTIES = [
  { id: "ouverture", libelle: "Ouverture" },
  { id: "organisation", libelle: "Organisation" },
  { id: "processus", libelle: "Processus" },
  { id: "performance", libelle: "Performance" },
  { id: "swot", libelle: "Analyse SWOT" },
  { id: "cloture", libelle: "Clôture" },
] as const;

export type IdPartie = (typeof PARTIES)[number]["id"];
