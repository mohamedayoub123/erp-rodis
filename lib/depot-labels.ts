import { supabaseServer } from "@/lib/supabase-server";

// Meme convention d'affichage que partout ailleurs (flux.ts, pages
// detail...) : "TO.annee.numero" / "TI.annee.numero", repli sur l'id brut
// si le numero/date_jour n'est plus lisible (ligne deja supprimee).
export async function fetchTransferOrderLabel(transferOrderId: number): Promise<string> {
  const { data } = await supabaseServer
    .from("transfer_orders")
    .select("date_jour, numero")
    .eq("id", transferOrderId)
    .maybeSingle();
  const row = data as { date_jour: string; numero: number | null } | null;
  return row ? `TO.${row.date_jour.slice(0, 4)}.${row.numero ?? transferOrderId}` : `TO-${transferOrderId}`;
}

export async function fetchInvoiceOrderLabel(invoiceOrderId: number): Promise<string> {
  const { data } = await supabaseServer
    .from("invoice_orders")
    .select("date_jour, numero")
    .eq("id", invoiceOrderId)
    .maybeSingle();
  const row = data as { date_jour: string; numero: number | null } | null;
  return row ? `TI.${row.date_jour.slice(0, 4)}.${row.numero ?? invoiceOrderId}` : `TI-${invoiceOrderId}`;
}
