// PERTE DU VRAC RESTANT. Quand le Conditionnement d'un code est TERMINE ("Fin programme"), le reste de son vrac garde sa place au Depot B pendant
// DELAI_PERTE_JOURS jours (on peut encore le conditionner : autre contenance en urgence, une nouvelle ligne qui choisit ce code). Passe ce delai,
// ce qui reste n'est plus utilisable : il est PERDU (sortie "perte" au Depot B, le code n'est plus propose au Dashboard) et il est signale dans le
// rapport des pertes de vrac des qu'il depasse SEUIL_PERTE_SIGNALEE_KG. Fonctions pures (aucun acces base), partagees par le calcul du stock
// de vrac (lib/vrac-stock-depot-b.ts), la liste des codes du Dashboard (lib/conditionnement-codes-vrac.ts) et le rapport.

export const DELAI_PERTE_JOURS = 5;
export const SEUIL_PERTE_SIGNALEE_KG = 100;

export function aujourdhuiIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ajouterJours(jour: string, nombre: number): string {
  return new Date(new Date(`${jour}T00:00:00Z`).getTime() + nombre * 86400000).toISOString().slice(0, 10);
}

// Jour ou le reste du code devient une perte : DELAI_PERTE_JOURS jours apres la fin du Conditionnement
export function datePerteDe(dateCloture: string): string {
  return ajouterJours(dateCloture, DELAI_PERTE_JOURS);
}

// Le reste est deja perdu a cette date ? (la perte compte le jour meme de l'echeance)
export function resteEstPerdu(dateCloture: string, aujourdhui: string): boolean {
  return aujourdhui >= datePerteDe(dateCloture);
}

export type LigneNumeroLot = { id: number; numero_lot: string | null };
export type MarqueTermine = { programme_ligne_id: number; code: string | null; stage: string | null; termine_date: string | null };

// Pour chaque code dont le Conditionnement est termine sur TOUTES les lignes qui le portent : le jour de la fin (la plus recente des "Fin
// programme" Conditionnement de ses lignes). Un code encore en cours sur une ligne n'est pas dans la liste ; si le Fin programme est annule,
// le code en sort (le vrac n'est plus compte comme perdu au calcul suivant).
export function calculerClotures(lignes: LigneNumeroLot[], termines: MarqueTermine[]): Map<string, string> {
  const marques = new Map<string, string>();
  for (const marque of termines) {
    if (marque.stage !== "carton" || !marque.termine_date) continue;
    const code = (marque.code ?? "").trim();
    if (!code) continue;
    const cle = `${marque.programme_ligne_id}::${code}`;
    const jour = String(marque.termine_date).slice(0, 10);
    if (jour > (marques.get(cle) ?? "")) marques.set(cle, jour);
  }

  const lignesParCode = new Map<string, number[]>();
  for (const ligne of lignes) {
    for (const code of (ligne.numero_lot ?? "").split(",").map((c) => c.trim()).filter(Boolean)) {
      lignesParCode.set(code, [...(lignesParCode.get(code) ?? []), ligne.id]);
    }
  }

  const clotures = new Map<string, string>();
  for (const [code, ids] of lignesParCode) {
    let derniere = "";
    let toutesTerminees = ids.length > 0;
    for (const id of ids) {
      const jour = marques.get(`${id}::${code}`);
      if (!jour) {
        toutesTerminees = false;
        break;
      }
      if (jour > derniere) derniere = jour;
    }
    if (toutesTerminees && derniere) clotures.set(code, derniere);
  }
  return clotures;
}
