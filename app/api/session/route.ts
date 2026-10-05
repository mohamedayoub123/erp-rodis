import { NextResponse } from "next/server";
import { getSessionStatus } from "@/lib/stock-auth";

// Etat de la session du navigateur qui appelle (voir SessionWatcher). Ne
// renvoie rien d'autre qu'un statut : jamais de donnee d'un autre compte.
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getSessionStatus();
  return NextResponse.json({ status }, { headers: { "Cache-Control": "no-store" } });
}
