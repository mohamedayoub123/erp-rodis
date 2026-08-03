import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";

export async function deleteLotStockCore(lotId: number) {
  if (!lotId) {
    throw new Error("Ligne stock invalide.");
  }

  const { error } = await supabaseServer.rpc("stock_delete_lot", { p_lot_id: lotId });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/stock");
  revalidatePath("/mouvements/produit-fini");
  revalidatePath("/dashboard");
  revalidatePath("/stock-dormant");
  revalidatePath("/stock-dormant-sans-commande");
  revalidatePath("/fifo");
  revalidatePath("/admin");
  revalidatePath("/");
}
