import { cache } from "react";
import { supabaseServer } from "@/lib/supabase-server";

// Machines identiques (ex : platforme 2, 3 et 4) : machines.groupe_identique_id = meme numero pour toutes
// les machines du groupe (le plus petit id du groupe). Les produits (machine_produits : capacite, min/max,
// temps) ajoutes ou retires sur une machine sont recopies sur ses machines identiques, voir
// app/production/machines/actions.ts. Les ecrans qui lisent machine_produits n'ont rien a changer :
// chaque machine garde ses propres lignes.
export const SQL_MACHINES_IDENTIQUES = "scripts/sql/add_machines_groupe_identique.sql";

// La colonne machines.groupe_identique_id n'existe qu'une fois le SQL execute : tant qu'elle est absente
// on ne la lit ni ne l'ecrit jamais (une colonne absente ferait echouer toute la lecture des machines) et
// les Equipements marchent exactement comme avant.
export const machinesIdentiquesDisponible = cache(async () => {
  const { error } = await supabaseServer.from("machines").select("groupe_identique_id").limit(1);
  return !error;
});

export type MachineGroupe = { id: number; type: string | null; groupe_identique_id: number | null };

export type ProduitMachine = {
  machine_id: number;
  article_id: number;
  temps_minutes: number | null;
  capacite: number | null;
  capacite_min: number | null;
  capacite_max: number | null;
};

// Machines du groupe d'une machine (elle-meme exclue). Un groupe ne melange jamais 2 types de machine
// (Fabrication / Conditionnement / Embalage n'ont pas les memes champs) : filtre par securite.
export function membresDuGroupe(machines: MachineGroupe[], machineId: number): number[] {
  const machine = machines.find((m) => m.id === machineId);
  if (!machine || machine.groupe_identique_id === null || machine.groupe_identique_id === undefined) return [];
  return machines
    .filter((m) => m.id !== machineId && m.groupe_identique_id === machine.groupe_identique_id && m.type === machine.type)
    .map((m) => m.id);
}

export type ChangementGroupe = { id: number; groupe: number | null };

// Nouvelle composition apres "Machines identiques" enregistre sur la page de la machine machineId avec
// la liste choisie : la machine + les cochees + tout le groupe de chaque machine ajoutee (identique a
// une identique = identique). Les decochees sortent du groupe (si elles sont plusieurs elles restent
// identiques entre elles). Le numero de groupe = plus petit id des membres ; un groupe d'une seule
// machine n'existe pas (NULL).
export function calculerGroupes(
  machines: MachineGroupe[],
  machineId: number,
  choisis: number[]
): { changements: ChangementGroupe[]; groupe: number[]; retires: number[] } {
  const machine = machines.find((m) => m.id === machineId);
  if (!machine) return { changements: [], groupe: [], retires: [] };

  const valides = new Set(
    choisis.filter((id) => id !== machineId && machines.some((m) => m.id === id && m.type === machine.type))
  );
  const actuels = new Set(membresDuGroupe(machines, machineId));
  const retires = [...actuels].filter((id) => !valides.has(id));
  const ajoutes = [...valides].filter((id) => !actuels.has(id));

  const membres = new Set<number>([machineId]);
  for (const id of actuels) if (valides.has(id)) membres.add(id);
  for (const id of ajoutes) {
    membres.add(id);
    for (const frere of membresDuGroupe(machines, id)) if (!retires.includes(frere)) membres.add(frere);
  }

  const cible = new Map<number, number | null>();
  const poser = (ids: number[]) => {
    const groupe = ids.length >= 2 ? Math.min(...ids) : null;
    for (const id of ids) cible.set(id, groupe);
  };
  poser([...membres]);
  poser(retires);

  const changements: ChangementGroupe[] = [];
  for (const [id, groupe] of cible) {
    const actuel = machines.find((m) => m.id === id)?.groupe_identique_id ?? null;
    if (actuel !== groupe) changements.push({ id, groupe });
  }
  return { changements, groupe: [...membres].sort((a, b) => a - b), retires };
}

const memesValeurs = (a: ProduitMachine, b: ProduitMachine) =>
  a.temps_minutes === b.temps_minutes &&
  a.capacite === b.capacite &&
  a.capacite_min === b.capacite_min &&
  a.capacite_max === b.capacite_max;

// Lignes machine_produits a ecrire pour que tout le groupe (groupe = machines identiques, source
// comprise) ait les memes produits : chaque machine recoit les produits qui lui manquent ; si la machine
// source (celle ou on vient de cocher) a deja le produit, ses valeurs gagnent sur les autres machines ;
// un produit que la source n'a pas est copie seulement la ou il manque (jamais de valeur ecrasee).
export function produitsAEcrire(produits: ProduitMachine[], groupe: number[], sourceId: number): ProduitMachine[] {
  const duGroupe = produits.filter((p) => groupe.includes(p.machine_id));
  const articles = [...new Set(duGroupe.map((p) => p.article_id))];
  const aEcrire: ProduitMachine[] = [];

  for (const articleId of articles) {
    const lignes = duGroupe.filter((p) => p.article_id === articleId);
    const source = lignes.find((p) => p.machine_id === sourceId);
    const reference = source ?? [...lignes].sort((a, b) => a.machine_id - b.machine_id)[0];

    for (const machineId of groupe) {
      const existante = lignes.find((p) => p.machine_id === machineId);
      if (existante && (!source || memesValeurs(existante, reference))) continue;
      aEcrire.push({
        machine_id: machineId,
        article_id: articleId,
        temps_minutes: reference.temps_minutes,
        capacite: reference.capacite,
        capacite_min: reference.capacite_min,
        capacite_max: reference.capacite_max,
      });
    }
  }
  return aEcrire;
}
