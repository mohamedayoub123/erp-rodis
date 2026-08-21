import { supabaseServer } from "@/lib/supabase-server";

// Vraies machines Conditionnement (table machines, type = "Conditionnement")
// - remplace partout lib/zone-chaine-list.ts (ancienne liste fixe copiee
// d'un Excel, zone/chaine non modifiables) pour que toute liste zone/chaine
// reste TOUJOURS a jour avec ce qui existe reellement sur /production/
// machines, comme la grille Programme par ligne (deja migree). Une machine
// ajoutee/supprimee la-bas apparait/disparait donc automatiquement ici,
// sans toucher au code. lib/zone-chaine-list.ts reste utilise tel quel par
// /ravitailleur-par-ligne (hors de ce lot).
export type MachineConditionnement = {
  id: number;
  nom: string;
  zone: string;
  typeProduit: string[];
};

export async function fetchMachinesConditionnement(): Promise<MachineConditionnement[]> {
  const rows: { id: number; nom: string; zone: string | null; type_produit: string[] | null }[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("machines")
      .select("id, nom, zone, type_produit")
      .eq("type", "Conditionnement")
      .range(from, from + pageSize - 1);

    if (error) break;
    const chunk =
      (data as { id: number; nom: string; zone: string | null; type_produit: string[] | null }[] | null) ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows.map((m) => ({ id: m.id, nom: m.nom, zone: m.zone || "-", typeProduit: m.type_produit ?? [] }));
}

export type ZoneChaineOption = { zone: string; chaine: string };

// Liste plate {zone, chaine} triee zone puis chaine - pour les pickers
// simples (reassigner/creer une ligne) qui n'ont pas besoin du machineId
// ni du type_produit (voir Programme par ligne pour la version groupee).
export async function fetchConditionnementZoneChaineOptions(): Promise<ZoneChaineOption[]> {
  const machines = await fetchMachinesConditionnement();
  return machines
    .map((m) => ({ zone: m.zone, chaine: m.nom }))
    .sort((a, b) => {
      const zoneCompare = a.zone.localeCompare(b.zone, "fr", { sensitivity: "base" });
      return zoneCompare !== 0 ? zoneCompare : a.chaine.localeCompare(b.chaine, "fr", { sensitivity: "base" });
    });
}
