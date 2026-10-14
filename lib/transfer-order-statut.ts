import { supabaseServer } from "@/lib/supabase-server";
import { logAudit } from "@/lib/audit-log";

// Un Transfer Order "Partiellement fini" dont il ne reste plus rien a transferer (plus aucune quantite reservee en attente sur ses
// lignes : par exemple apres avoir supprime la seule ligne pas encore livree, ou ramene la demande a ce qui est deja livre) est
// TERMINE : statut "Poste", comme apres la validation du dernier Transfer Invoice (voir invoice-order/actions.ts).
// Rend vrai si le statut vient de passer a "Poste".
export async function terminerSiPlusRienATransferer(transferOrderId: number): Promise<boolean> {
  const { data: transferOrderData } = await supabaseServer
    .from("transfer_orders")
    .select("statut")
    .eq("id", transferOrderId)
    .maybeSingle();
  if ((transferOrderData as { statut: string } | null)?.statut !== "partiellement_fini") return false;

  const { data: lignesData } = await supabaseServer.from("transfer_order_lignes").select("id").eq("transfer_order_id", transferOrderId);
  const ligneIds = ((lignesData ?? []) as { id: number }[]).map((ligne) => ligne.id);
  if (ligneIds.length === 0) return false;

  const { data: lotsData, error: lotsError } = await supabaseServer
    .from("transfer_order_ligne_lots")
    .select("quantite")
    .in("transfer_order_ligne_id", ligneIds);
  if (lotsError) throw new Error(lotsError.message);
  if (((lotsData ?? []) as { quantite: number }[]).some((lot) => Number(lot.quantite ?? 0) > 1e-6)) return false;

  const { error } = await supabaseServer.from("transfer_orders").update({ statut: "poste" }).eq("id", transferOrderId);
  if (error) throw new Error(error.message);
  return true;
}

// Meme regle pour TOUS les Transfer Orders "Partiellement fini" d'un coup (filet de securite appele a l'ouverture de la liste) :
// quel que soit le chemin qui les a laisses dans cet etat (ex : ligne retiree avec un Transfer Invoice), ils passent a "Poste".
// Ne fait jamais echouer la page : toute erreur est ignoree (le statut sera reverifie a la prochaine ouverture).
export async function terminerLesTransferOrdersSansReste(): Promise<number> {
  try {
    const { data: tosData } = await supabaseServer
      .from("transfer_orders")
      .select("id, numero, date_jour")
      .eq("statut", "partiellement_fini");
    const tos = (tosData ?? []) as { id: number; numero: number | null; date_jour: string }[];
    if (tos.length === 0) return 0;

    const ligneIdsParTo = new Map<number, number[]>();
    const toIds = tos.map((to) => to.id);
    for (let debut = 0; debut < toIds.length; debut += 100) {
      const { data } = await supabaseServer
        .from("transfer_order_lignes")
        .select("id, transfer_order_id")
        .in("transfer_order_id", toIds.slice(debut, debut + 100));
      for (const ligne of (data ?? []) as { id: number; transfer_order_id: number }[]) {
        const liste = ligneIdsParTo.get(ligne.transfer_order_id) ?? [];
        liste.push(ligne.id);
        ligneIdsParTo.set(ligne.transfer_order_id, liste);
      }
    }

    const toDeLigne = new Map<number, number>();
    for (const [toId, ids] of ligneIdsParTo) for (const id of ids) toDeLigne.set(id, toId);
    const resteParTo = new Map<number, number>();
    const tousLigneIds = [...toDeLigne.keys()];
    for (let debut = 0; debut < tousLigneIds.length; debut += 100) {
      const { data } = await supabaseServer
        .from("transfer_order_ligne_lots")
        .select("transfer_order_ligne_id, quantite")
        .in("transfer_order_ligne_id", tousLigneIds.slice(debut, debut + 100));
      for (const lot of (data ?? []) as { transfer_order_ligne_id: number; quantite: number }[]) {
        const toId = toDeLigne.get(lot.transfer_order_ligne_id);
        if (toId !== undefined) resteParTo.set(toId, (resteParTo.get(toId) ?? 0) + Number(lot.quantite ?? 0));
      }
    }

    const aTerminer = tos.filter((to) => (ligneIdsParTo.get(to.id)?.length ?? 0) > 0 && !((resteParTo.get(to.id) ?? 0) > 1e-6));
    if (aTerminer.length === 0) return 0;

    const { error } = await supabaseServer
      .from("transfer_orders")
      .update({ statut: "poste" })
      .in("id", aTerminer.map((to) => to.id))
      .eq("statut", "partiellement_fini");
    if (error) return 0;

    for (const to of aTerminer) {
      const label = `TO.${to.date_jour.slice(0, 4)}.${to.numero ?? to.id}`;
      await logAudit({
        utilisateur: "systeme",
        module: "TransferOrder",
        action: "modification",
        cible: label,
        resume: `Transfer Order ${label} : statut passe a Poste automatiquement (plus rien a transferer)`,
      });
    }
    return aTerminer.length;
  } catch {
    return 0;
  }
}
