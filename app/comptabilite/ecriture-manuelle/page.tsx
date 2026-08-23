import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { EcritureManuelleForm } from "./ecriture-form";
import { RecentEcrituresList, type EcritureManuelleRow } from "./recent-list";
import type { CompteOption } from "./compte-search";

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

async function fetchEcrituresManuellesRecentes(): Promise<EcritureManuelleRow[]> {
  const { data: ecritures } = await supabaseServer
    .from("ecritures_comptables")
    .select("id, date_ecriture, libelle, piece_reference, created_by")
    .eq("source_type", "ecriture_manuelle")
    .order("id", { ascending: false })
    .limit(50);

  const rows = (ecritures ?? []) as {
    id: number;
    date_ecriture: string;
    libelle: string;
    piece_reference: string | null;
    created_by: string | null;
  }[];
  if (rows.length === 0) return [];

  const { data: lignes } = await supabaseServer
    .from("ecriture_lignes")
    .select("ecriture_id, debit")
    .in(
      "ecriture_id",
      rows.map((r) => r.id)
    );

  const totalByEcritureId = new Map<number, number>();
  for (const ligne of (lignes ?? []) as { ecriture_id: number; debit: number }[]) {
    totalByEcritureId.set(ligne.ecriture_id, (totalByEcritureId.get(ligne.ecriture_id) ?? 0) + Number(ligne.debit ?? 0));
  }

  return rows.map((row) => ({ ...row, total: totalByEcritureId.get(row.id) ?? 0 }));
}

export default async function EcritureManuellePage() {
  noStore();

  const currentUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentUser, "comptabilite");

  const [comptes, ecrituresRecentes] = await Promise.all([fetchAllComptes(), fetchEcrituresManuellesRecentes()]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">Comptabilite</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Ecriture manuelle</h1>
              <p className="mt-2 text-sm text-slate-600">
                Saisis une ecriture sur n&apos;importe quel compte du plan comptable ({comptes.length} comptes
                disponibles) - pour tout ce qui n&apos;est pas deja genere automatiquement par l&apos;appli (achat,
                vente, production...).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/comptabilite" label="Retour Comptabilite" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {!canWrite ? (
            <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-600">
              Lecture seule : saisie d&apos;ecriture cachee pour cet utilisateur.
            </p>
          ) : (
            <EcritureManuelleForm comptes={comptes} />
          )}
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Dernieres ecritures saisies ici</h2>
          {canWrite ? (
            <RecentEcrituresList ecritures={ecrituresRecentes} />
          ) : (
            <p className="text-sm text-slate-500">
              {ecrituresRecentes.length} ecriture(s) - vue detaillee reservee a l&apos;ecriture.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
