// Date de peremption automatique du Conditionnement (Entree simple ET Entree par ligne) :
// date de fabrication + 3 ans, sauf gel douche / savon / huile / serum / pommade : + 5 ans.
// Le type vient du champ "type_article" de la fiche Article Produit Fini.
// Aucun import serveur ici : ce fichier est aussi charge cote navigateur (apercu en direct), mais l'action
// serveur recalcule toujours la date elle-meme - la valeur affichee ne peut jamais etre modifiee.

const TYPES_CINQ_ANS = new Set(["gel douche", "savon", "huile", "serum", "pommade"]);

function normaliserType(type: string | null | undefined) {
  return (type || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function dureeConservationAns(typeArticle: string | null | undefined): 3 | 5 {
  return TYPES_CINQ_ANS.has(normaliserType(typeArticle)) ? 5 : 3;
}

// "AAAA-MM-JJ" + n ans, meme jour et meme mois ; un 29 fevrier retombe sur le 28 fevrier
// si l'annee d'arrivee n'est pas bissextile.
export function ajouterAnnees(dateIso: string, annees: number): string {
  const [anneeTexte, moisTexte, jourTexte] = (dateIso || "").slice(0, 10).split("-");
  const annee = Number(anneeTexte);
  const mois = Number(moisTexte);
  const jour = Number(jourTexte);
  if (!Number.isInteger(annee) || !Number.isInteger(mois) || !Number.isInteger(jour) || mois < 1 || mois > 12) {
    return "";
  }

  const nouvelleAnnee = annee + annees;
  const joursDuMois = new Date(Date.UTC(nouvelleAnnee, mois, 0)).getUTCDate();
  const nouveauJour = Math.min(jour, joursDuMois);
  return `${String(nouvelleAnnee).padStart(4, "0")}-${String(mois).padStart(2, "0")}-${String(nouveauJour).padStart(2, "0")}`;
}
