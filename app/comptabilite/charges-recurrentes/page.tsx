import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { AddChargeForm } from "./add-charge-form";
import { ChargeRow, type ChargeRowData } from "./charge-row";
import type { CompteOption } from "../ecriture-manuelle/compte-search";

async function fetchAllComptes(): Promise<CompteOption[]> {
  const rows: CompteOption[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseServer
      .from("comptes_comptables")
      .select("code, libelle, classe")
      .order("code", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) break;
    const chunk = (data ?? []) as CompteOption[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function fetchChargesAvecPaiements(): Promise<ChargeRowData[]> {
  const { data: chargesData } = await supabaseServer
    .from("charges_recurrentes")
    .select("id, nom, categorie, montant, actif")
    .order("nom", { ascending: true });

  const charges = (chargesData ?? []) as {
    id: number;
    nom: string;
    categorie: string;
    montant: number;
    actif: boolean;
  }[];
  if (charges.length === 0) return [];

  const { data: ecrituresData } = await supabaseServer
    .from("ecritures_comptables")
    .select("source_id, id")
    .eq("source_type", "charge_recurrente");

  const ecritures = (ecrituresData ?? []) as { source_id: string; id: number }[];
  const ecritureIdBySourceId = new Map(ecritures.map((e) => [e.source_id, e.id]));

  const { data: lignesData } = await supabaseServer
    .from("ecriture_lignes")
    .select("ecriture_id, debit")
    .in(
      "ecriture_id",
      ecritures.map((e) => e.id)
    );
  const lignes = (lignesData ?? []) as { ecriture_id: number; debit: number }[];
  const debitByEcritureId = new Map<number, number>();
  for (const ligne of lignes) {
    debitByEcritureId.set(ligne.ecriture_id, (debitByEcritureId.get(ligne.ecriture_id) ?? 0) + Number(ligne.debit ?? 0));
  }

  return charges.map((charge) => {
    const paiements = [...ecritureIdBySourceId.entries()]
      .filter(([sourceId]) => sourceId.startsWith(`${charge.id}::`))
      .map(([sourceId, ecritureId]) => ({
        periode: sourceId.split("::")[1],
        montant: debitByEcritureId.get(ecritureId) ?? 0,
      }))
      .sort((a, b) => b.periode.localeCompare(a.periode));

    return {
      id: charge.id,
      nom: charge.nom,
      categorie: charge.categorie,
      montant: Number(charge.montant),
      actif: charge.actif,
      paiements,
    };
  });
}

export default async function ChargesRecurrentesPage() {
  noStore();

  const currentUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentUser, "comptabilite");

  const [comptes, charges] = await Promise.all([fetchAllComptes(), fetchChargesAvecPaiements()]);
  const chargesActives = charges.filter((c) => c.actif);
  const chargesInactives = charges.filter((c) => !c.actif);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">Comptabilite</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Charges recurrentes</h1>
              <p className="mt-2 text-sm text-slate-600">
                Loyer, assurance, abonnements... - regle un mois pour generer l&apos;ecriture automatiquement.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <BackButton href="/comptabilite" label="Retour Comptabilite" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Charges</h2>
          {chargesActives.length === 0 && chargesInactives.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune charge recurrente pour le moment.</p>
          ) : (
            <div className="space-y-3">
              {[...chargesActives, ...chargesInactives].map((charge) => (
                <ChargeRow key={charge.id} charge={charge} canWrite={canWrite} />
              ))}
            </div>
          )}
        </section>

        {canWrite ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="mb-4 text-lg font-bold text-slate-900">Ajouter une charge</h2>
            <AddChargeForm comptes={comptes} />
          </section>
        ) : null}
      </div>
    </main>
  );
}
