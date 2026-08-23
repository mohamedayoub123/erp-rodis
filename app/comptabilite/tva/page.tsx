import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { TvaForm, type DeclarationTvaRow } from "./tva-form";

async function fetchDeclarations(): Promise<DeclarationTvaRow[]> {
  const { data } = await supabaseServer
    .from("declarations_tva")
    .select("periode, tva_collectee, tva_deductible, date_declaration")
    .order("periode", { ascending: false });

  return ((data ?? []) as { periode: string; tva_collectee: number; tva_deductible: number; date_declaration: string }[]).map(
    (row) => ({
      periode: row.periode,
      tvaCollectee: Number(row.tva_collectee),
      tvaDeductible: Number(row.tva_deductible),
      net: Number(row.tva_collectee) - Number(row.tva_deductible),
      dateDeclaration: row.date_declaration,
    })
  );
}

export default async function TvaPage() {
  noStore();

  const currentUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentUser, "comptabilite");

  const declarations = await fetchDeclarations();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">Comptabilite</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">TVA</h1>
              <p className="mt-2 text-sm text-slate-600">
                Declare la TVA collectee et deductible du mois - l&apos;ecriture de solde (a payer ou a reporter) est
                generee automatiquement.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <BackButton href="/comptabilite" label="Retour Comptabilite" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <TvaForm declarations={declarations} canWrite={canWrite} />
        </section>
      </div>
    </main>
  );
}
