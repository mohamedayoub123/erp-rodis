// Poubelle d'un code dans la colonne Emballage du Dashboard : les cartons PAS ENCORE emballes repartent au Conditionnement (leur saisie de
// Conditionnement est retiree) ; les cartons deja emballes restent, ils ne sont jamais touches (ils peuvent deja etre entres en stock produit
// fini). Calcul pur, sans acces a la base.

export type SaisieCartons = { id: number; quantite: number | string | null; date_jour?: string | null; created_at?: string | null };

export type PlanRetour = {
  // Cartons qui repartent au Conditionnement (0 = rien a renvoyer, aucune saisie n'est touchee)
  retournes: number;
  // Saisies de Conditionnement a retirer en entier
  aSupprimer: number[];
  // Saisie a cheval sur "deja emballe" / "pas encore emballe" : sa quantite est ramenee a la part deja emballee
  aReduire: { id: number; quantite: number } | null;
};

const TOLERANCE = 0.005;
const arrondi2 = (valeur: number) => Math.round(valeur * 100) / 100;

// emballe : cartons deja emballes de ce code. Les saisies les plus ANCIENNES sont gardees pour les couvrir (elles ont ete emballees les premieres).
export function planifierRetourConditionnement(saisies: SaisieCartons[], emballe: number): PlanRetour {
  const total = saisies.reduce((somme, saisie) => somme + Number(saisie.quantite ?? 0), 0);
  const retournes = arrondi2(total - Math.max(0, emballe));
  if (retournes < TOLERANCE) return { retournes: 0, aSupprimer: [], aReduire: null };

  const ordre = [...saisies].sort(
    (a, b) =>
      String(a.date_jour ?? "").localeCompare(String(b.date_jour ?? "")) ||
      String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) ||
      a.id - b.id
  );
  const aSupprimer: number[] = [];
  let aReduire: PlanRetour["aReduire"] = null;
  let resteAGarder = Math.max(0, emballe);
  for (const saisie of ordre) {
    const quantite = Number(saisie.quantite ?? 0);
    if (resteAGarder < TOLERANCE) {
      aSupprimer.push(saisie.id);
    } else if (quantite <= resteAGarder + TOLERANCE) {
      resteAGarder -= quantite;
    } else {
      aReduire = { id: saisie.id, quantite: arrondi2(resteAGarder) };
      resteAGarder = 0;
    }
  }
  return { retournes, aSupprimer, aReduire };
}
