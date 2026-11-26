import { computeQtCarton } from "@/lib/dispatcher-shared";

// Dashboard > Fabrication : DIVISER un code (lot) en 2 - ex : le PD a 2 codes de 3000 kg, mais la fabrication se fait finalement sur une machine
// de plus petite capacite : le code AA1 (3000 kg) devient AA1 (1500 kg) + un NOUVEAU code (1500 kg) choisi par la personne. Si le code choisi
// est DEJA sur la ligne, la quantite s'AJOUTE sur lui (AA1 3000 + AA2 1500, deplacer 500 : AA1 2500 + AA2 2000).
// Fonctions pures (aucun acces base) : partagees entre le serveur (lib/diviser-code-vrac.ts) et le bouton du Dashboard.

export type EntreeDetailLot = { code: string; qt_vrac: number | null; qt_carton: number | null };

export const LONGUEUR_MAX_CODE = 40;

export const arrondi2 = (valeur: number) => Math.round(valeur * 100) / 100;

const somme = (valeurs: (number | null | undefined)[]) => valeurs.reduce<number>((total, valeur) => total + Number(valeur ?? 0), 0);

// Le nouveau code ecrit par la personne. La virgule separe les codes d'une meme ligne de programme (numero_lot = "AA1, AA2") : interdite dans un code.
export function lireNouveauCode(texte: unknown): { ok: true; code: string } | { ok: false; message: string } {
  if (typeof texte !== "string" || !texte.trim()) return { ok: false, message: "Ecris le nouveau code." };
  const code = texte.trim();
  if (code === "-") return { ok: false, message: "Ce n'est pas un code valide." };
  if (code.includes(",")) {
    return { ok: false, message: "Le code ne peut pas contenir de virgule (la virgule separe les codes d'une meme ligne)." };
  }
  if (code.length > LONGUEUR_MAX_CODE) return { ok: false, message: `Le code est trop long (${LONGUEUR_MAX_CODE} caracteres au plus).` };
  return { ok: true, code };
}

// La quantite de vrac (kg) que prend le NOUVEAU code ; le reste (vrac prevu - cette quantite) reste sur le code d'origine.
export function lireQuantiteNouveau(
  valeur: unknown,
  vracPrevu: number
): { ok: true; quantiteNouveau: number; quantiteGardee: number } | { ok: false; message: string } {
  const nombre = typeof valeur === "number" ? valeur : Number(String(valeur ?? "").trim().replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(nombre) || arrondi2(nombre) <= 0) {
    return { ok: false, message: "Ecris la quantite de vrac (en kg) du nouveau code." };
  }
  const quantiteNouveau = arrondi2(nombre);
  const quantiteGardee = arrondi2(vracPrevu - quantiteNouveau);
  if (quantiteGardee <= 0) {
    return {
      ok: false,
      message: `La quantite du nouveau code doit etre plus petite que le vrac prevu de ce code (${arrondi2(vracPrevu)} kg) : il doit rester du vrac sur le code d'origine.`,
    };
  }
  return { ok: true, quantiteNouveau, quantiteGardee };
}

export type PlanDivision = {
  // numero_lot de la ligne apres division : le nouveau code est place juste apres le code d'origine
  numeroLot: string;
  detail: EntreeDetailLot[];
  // cartons prevus de la ligne apres division (somme des cartons de chaque lot)
  qtCartonLigne: number | null;
  vracAvant: number;
  cartonsAvant: number | null;
  gardee: EntreeDetailLot;
  // le code qui recoit la quantite, avec ses quantites APRES la division
  nouvelle: EntreeDetailLot;
  quantiteAjoutee: number;
  // le code qui recoit existait deja sur la ligne : ses quantites AVANT la division (null = c'est un nouveau code)
  ajoutSur: EntreeDetailLot | null;
};

// Calcule la division d'UN code d'une ligne de programme : le vrac prevu total de la ligne ne change pas, seule sa repartition par code change.
// Les cartons prevus de chaque morceau se calculent comme au Dispatch (vrac / contenance / pieces par carton, arrondi au carton superieur).
export function construireDivision(args: {
  codes: string[];
  detail: EntreeDetailLot[] | null;
  vracLigne: number | null;
  cartonsLigne: number | null;
  code: string;
  nouveauCode: string;
  quantiteNouveau: unknown;
  contenance: number | null;
  piecesParCarton: number | null;
}): { ok: true; plan: PlanDivision } | { ok: false; message: string } {
  const { codes, detail, code } = args;
  if (!codes.includes(code)) return { ok: false, message: "Ce code n'existe plus sur cette ligne. Recharge la page." };
  const nouveau = lireNouveauCode(args.nouveauCode);
  if (!nouveau.ok) return nouveau;
  const nouveauCode = nouveau.code;
  // Code deja sur la ligne (ecrit en majuscules ou non) : la quantite s'ajoute sur lui, avec son ecriture exacte
  const existant = codes.find((lot) => lot.toLowerCase() === nouveauCode.toLowerCase()) ?? null;
  if (existant === code) {
    return { ok: false, message: `${code} est le code que tu divises : ecris un autre code.` };
  }

  // Repartition de depart par code. Une ligne a UN SEUL code : le Dashboard affiche le vrac et les cartons de la ligne (le detail ne compte pas).
  // Une ligne a plusieurs codes : le detail doit donner une quantite a chacun (sinon on ne sait pas lequel diviser).
  let base: EntreeDetailLot[];
  if (codes.length === 1) {
    base = [{ code, qt_vrac: args.vracLigne, qt_carton: args.cartonsLigne }];
  } else {
    const detailComplet =
      Array.isArray(detail) && detail.length === codes.length && codes.every((lot) => detail.some((entree) => entree.code === lot));
    if (!detailComplet) {
      return { ok: false, message: "La repartition des lots de cette ligne est incomplete : impossible de diviser un de ses codes." };
    }
    base = codes.map((lot) => ({ ...(detail as EntreeDetailLot[]).find((entree) => entree.code === lot)! }));
  }

  const entree = base.find((e) => e.code === code)!;
  const vracAvant = Number(entree.qt_vrac ?? 0);
  if (!(vracAvant > 0)) return { ok: false, message: "Ce code n'a pas de quantite de vrac prevue : il ne peut pas etre divise." };
  const quantites = lireQuantiteNouveau(args.quantiteNouveau, vracAvant);
  if (!quantites.ok) return quantites;
  const { quantiteNouveau, quantiteGardee } = quantites;

  // Cartons de chaque morceau ; sans contenance / pieces par carton dans la fiche article : repartition au prorata des cartons d'origine
  let cartonsGardes = computeQtCarton(quantiteGardee, args.contenance, args.piecesParCarton);
  let cartonsNouveau = computeQtCarton(quantiteNouveau, args.contenance, args.piecesParCarton);
  if (cartonsGardes === null || cartonsNouveau === null) {
    const cartonsAvantCode = entree.qt_carton;
    if (cartonsAvantCode === null || cartonsAvantCode === undefined) {
      cartonsGardes = null;
      cartonsNouveau = null;
    } else {
      cartonsGardes = Math.round((Number(cartonsAvantCode) * quantiteGardee) / vracAvant);
      cartonsNouveau = Number(cartonsAvantCode) - cartonsGardes;
    }
  }

  const gardee: EntreeDetailLot = { code, qt_vrac: quantiteGardee, qt_carton: cartonsGardes };
  const ajoutSur = existant ? base.find((e) => e.code === existant)! : null;
  let nouvelle: EntreeDetailLot = { code: nouveauCode, qt_vrac: quantiteNouveau, qt_carton: cartonsNouveau };
  if (ajoutSur) {
    const total = arrondi2(Number(ajoutSur.qt_vrac ?? 0) + quantiteNouveau);
    // cartons recalcules sur le total ; sans contenance / pieces par carton : ses cartons + les cartons retires au code d'origine
    const cartonsTotal =
      computeQtCarton(total, args.contenance, args.piecesParCarton) ??
      (cartonsNouveau === null || ajoutSur.qt_carton === null || ajoutSur.qt_carton === undefined ? null : Number(ajoutSur.qt_carton) + cartonsNouveau);
    nouvelle = { code: ajoutSur.code, qt_vrac: total, qt_carton: cartonsTotal };
  }
  const detailApres = ajoutSur
    ? base.map((lot) => (lot.code === code ? gardee : lot.code === ajoutSur.code ? nouvelle : lot))
    : base.flatMap((lot) => (lot.code === code ? [gardee, nouvelle] : [lot]));
  const toutesCartonsConnus = detailApres.every((lot) => lot.qt_carton !== null && lot.qt_carton !== undefined);

  return {
    ok: true,
    plan: {
      numeroLot: detailApres.map((lot) => lot.code).join(", "),
      detail: detailApres,
      qtCartonLigne: toutesCartonsConnus ? somme(detailApres.map((lot) => lot.qt_carton)) : args.cartonsLigne,
      vracAvant,
      cartonsAvant: entree.qt_carton ?? null,
      gardee,
      nouvelle,
      quantiteAjoutee: quantiteNouveau,
      ajoutSur,
    },
  };
}
