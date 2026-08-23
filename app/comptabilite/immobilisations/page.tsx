import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { AddImmoForm } from "./add-immo-form";
import { ImmoRow, type ImmoRowData } from "./immo-row";
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

async function fetchImmosAvecAmortissements(): Promise<ImmoRowData[]> {
  const { data: immosData } = await supabaseServer
    .from("immobilisations")
    .select("id, nom, categorie, date_acquisition, valeur_acquisition, duree_amortissement_mois, statut")
    .order("date_acquisition", { ascending: false });

  const immos = (immosData ?? []) as {
    id: number;
    nom: string;
    categorie: string | null;
    date_acquisition: string;
    valeur_acquisition: number;
    duree_amortissement_mois: number;
    statut: string;
  }[];
  if (immos.length === 0) return [];

  const { data: ecrituresData } = await supabaseServer
    .from("ecritures_comptables")
    .select("source_id, id")
    .eq("source_type", "immobilisation_amortissement");

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

  return immos.map((immo) => {
    const amortissements = [...ecritureIdBySourceId.entries()]
      .filter(([sourceId]) => sourceId.startsWith(`${immo.id}::`))
      .map(([sourceId, ecritureId]) => ({
        periode: sourceId.split("::")[1],
        montant: debitByEcritureId.get(ecritureId) ?? 0,
      }))
      .sort((a, b) => b.periode.localeCompare(a.periode));

    return {
      id: immo.id,
      nom: immo.nom,
      categorie: immo.categorie,
      dateAcquisition: immo.date_acquisition,
      valeurAcquisition: Number(immo.valeur_acquisition),
      dureeAmortissementMois: immo.duree_amortissement_mois,
      statut: immo.statut,
      amortissements,
    };
  });
}

export default async function ImmobilisationsPage() {
  noStore();

  const currentUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentUser, "comptabilite");

  const [comptes, immos] = await Promise.all([fetchAllComptes(), fetchImmosAvecAmortissements()]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">Comptabilite</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Immobilisations</h1>
              <p className="mt-2 text-sm text-slate-600">
                Machines, batiments... - ajoute une immobilisation (ecriture d&apos;acquisition automatique), puis
                genere sa dotation aux amortissements chaque mois.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <BackButton href="/comptabilite" label="Retour Comptabilite" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Immobilisations</h2>
          {immos.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune immobilisation pour le moment.</p>
          ) : (
            <div className="space-y-3">
              {immos.map((immo) => (
                <ImmoRow key={immo.id} immo={immo} canWrite={canWrite} />
              ))}
            </div>
          )}
        </section>

        {canWrite ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="mb-4 text-lg font-bold text-slate-900">Ajouter une immobilisation</h2>
            <AddImmoForm comptes={comptes} />
          </section>
        ) : null}
      </div>
    </main>
  );
}
