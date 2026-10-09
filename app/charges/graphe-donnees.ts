import { supabaseServer } from "@/lib/supabase-server";
import { lireCartonEntreeProductionParMois } from "@/lib/carton-entree-production";
import { MOIS_NOMS } from "./fields";
import { choisirNbCarton } from "./carton";

// Cout par carton fabrique, mois par mois, pour une annee (Charges Usine + Prix Carburant + cartons entres au
// Depot A). Calcul partage par la page "Graphe Cout par Carton" et par la diapositive KPI "Analyse comparative du
// cout du carton" des trimestres.
type ChargeMonthRow = {
  annee: number;
  mois: number;
  electricite_plastique: number | null;
  electricite_cosmetique: number | null;
  gaz: number | null;
  gasoil_plastique: number | null;
  gasoil_cosmetique: number | null;
  essence: number | null;
  salaire_embauche: number | null;
  salaire_journalier_cosmetique: number | null;
  salaire_journalier_global: number | null;
  salaire_cadre: number | null;
  depense_usine: number | null;
  carton_fabrique_manuel: number | null;
};

type PrixMonthRow = {
  annee: number;
  mois: number;
  prix_gaz: number | null;
  prix_essence: number | null;
  prix_gasoil: number | null;
};

const CHARGE_COLUMNS = [
  "annee",
  "mois",
  "electricite_plastique",
  "electricite_cosmetique",
  "gaz",
  "gasoil_plastique",
  "gasoil_cosmetique",
  "essence",
  "salaire_embauche",
  "salaire_journalier_cosmetique",
  "salaire_journalier_global",
  "salaire_cadre",
  "depense_usine",
  "carton_fabrique_manuel",
].join(", ");

async function fetchChargesByYear(annee: number): Promise<ChargeMonthRow[]> {
  const { data, error } = await supabaseServer
    .from("charges_usine")
    .select(CHARGE_COLUMNS)
    .eq("annee", annee);

  if (error) return [];
  return (data ?? []) as unknown as ChargeMonthRow[];
}

async function fetchPrixByYear(annee: number): Promise<PrixMonthRow[]> {
  const { data, error } = await supabaseServer
    .from("prix_carburant")
    .select("annee, mois, prix_gaz, prix_essence, prix_gasoil")
    .eq("annee", annee);

  if (error) return [];
  return (data ?? []) as unknown as PrixMonthRow[];
}

function n(value: number | null | undefined) {
  return value ?? 0;
}

// null (affiche "-") si le mois n'a pas de nb carton OU pas de ligne
// Charges Usine saisie - sans "hasData", un mois avec du carton mais sans
// Charges Usine renvoyait 0 (cout nul) au lieu de "aucune donnee", ce qui
// se lisait comme un vrai cout de 0 FCFA/carton.
function ratio(numerator: number, nbCarton: number, hasData: boolean) {
  return hasData && nbCarton > 0 ? numerator / nbCarton : null;
}

export async function calculerGrapheCharges(annee: number) {
  const [chargesRows, prixRows, cartonByMonth] = await Promise.all([
    fetchChargesByYear(annee),
    fetchPrixByYear(annee),
    lireCartonEntreeProductionParMois(),
  ]);

  const chargesByMois = new Map(chargesRows.map((row) => [row.mois, row]));
  const prixByMois = new Map(prixRows.map((row) => [row.mois, row]));

  const monthRows = Array.from({ length: 12 }, (_, i) => {
    const mois = i + 1;
    const charge = chargesByMois.get(mois) ?? null;
    const prix = prixByMois.get(mois) ?? null;
    const moisKey = `${annee}-${String(mois).padStart(2, "0")}`;
    // Avant septembre 2026 : le chiffre saisi a la main fait foi ; a partir de septembre 2026 :
    // uniquement le chiffre automatique = cartons entres au Depot A par Entree Production ce mois-la
    // (voir ../carton.ts).
    const { valeur: nbCarton, estManuel: nbCartonEstManuel } = choisirNbCarton({
      annee,
      mois,
      auto: cartonByMonth.get(moisKey) ?? 0,
      manuel: charge?.carton_fabrique_manuel ?? null,
    });

    const gazCout = charge && prix?.prix_gaz != null ? n(charge.gaz) * prix.prix_gaz : 0;
    const essenceCout = charge && prix?.prix_essence != null ? n(charge.essence) * prix.prix_essence : 0;
    const gasoilPlastiqueCout =
      charge && prix?.prix_gasoil != null ? n(charge.gasoil_plastique) * prix.prix_gasoil : 0;
    const gasoilCosmetiqueCout =
      charge && prix?.prix_gasoil != null ? n(charge.gasoil_cosmetique) * prix.prix_gasoil : 0;

    const energieTotale =
      n(charge?.electricite_plastique) +
      n(charge?.electricite_cosmetique) +
      gazCout +
      gasoilPlastiqueCout +
      gasoilCosmetiqueCout;
    const energieCosmetique = n(charge?.electricite_cosmetique) + gasoilCosmetiqueCout;

    const journalierTotal = n(charge?.salaire_journalier_global);
    const journalierCosmetique = n(charge?.salaire_journalier_cosmetique);
    const embauches = n(charge?.salaire_embauche);
    const cadre = n(charge?.salaire_cadre);
    const depenseUsine = n(charge?.depense_usine);

    const hasData = Boolean(charge);
    const r1 = ratio(journalierTotal, nbCarton, hasData);
    const r2 = ratio(journalierCosmetique, nbCarton, hasData);
    const r3 = ratio(journalierCosmetique + energieCosmetique, nbCarton, hasData);
    const r4 = ratio(journalierTotal + energieTotale, nbCarton, hasData);
    const r5 = ratio(journalierTotal + embauches + energieTotale, nbCarton, hasData);
    const r6 = ratio(
      journalierTotal + embauches + cadre + depenseUsine + energieTotale + essenceCout,
      nbCarton,
      hasData
    );

    return {
      mois,
      moisLabel: MOIS_NOMS[i],
      hasData,
      nbCarton,
      nbCartonEstManuel,
      journalierTotal,
      journalierCosmetique,
      r1,
      r2,
      r3,
      r4,
      r5,
      r6,
    };
  });

  return monthRows;
}
