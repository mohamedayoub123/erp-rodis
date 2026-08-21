import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { fetchSoldesParCompte } from "@/lib/comptabilite";
import { computeBilan, computeCompteResultat, type LigneEtat } from "@/lib/syscohada";

function formatMontant(value: number | null) {
  if (value === null) return "-";
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function LigneRow({ ligne }: { ligne: LigneEtat }) {
  return (
    <tr className={ligne.isTotal || ligne.isSousTotal ? "border-t border-slate-200 bg-slate-50" : "border-t border-slate-100"}>
      <td
        className={`px-6 py-3 ${ligne.indent ? "pl-10 text-slate-600" : ""} ${
          ligne.isTotal || ligne.isSousTotal ? "font-bold text-slate-900" : "text-slate-700"
        }`}
      >
        {ligne.libelle}
      </td>
      <td
        className={`px-6 py-3 text-right tabular-nums ${
          ligne.isTotal || ligne.isSousTotal ? "font-bold text-slate-900" : "text-slate-700"
        } ${ligne.montant !== null && ligne.montant < 0 ? "text-red-700" : ""}`}
      >
        {formatMontant(ligne.montant)}
      </td>
    </tr>
  );
}

function RubriqueSection({ titre, lignes, total, totalLabel }: { titre: string; lignes: LigneEtat[]; total: number; totalLabel: string }) {
  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-black/5 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
      <div className="border-b border-slate-100 bg-slate-50 px-5 py-2.5">
        <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-slate-700">{titre}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <tbody>
            {lignes.map((ligne) => (
              <LigneRow key={ligne.libelle} ligne={ligne} />
            ))}
            <LigneRow ligne={{ libelle: totalLabel, montant: total, isSousTotal: true }} />
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Bilan au format SYSCOHADA (Actif immobilise / circulant / tresorerie, puis
// Capitaux propres / Dettes financieres / Passif circulant / Tresorerie
// passif) - le Resultat net de l'exercice vient du Compte de resultat (jamais
// recalcule 2 fois), Total Actif = Total Passif est garanti par la partie
// double du grand livre, verifie en pied de page.
export default async function BilanPage({
  searchParams,
}: {
  searchParams: Promise<{ a_la_date?: string }>;
}) {
  noStore();

  const params = await searchParams;
  const aLaDate = (params.a_la_date || "").trim();

  const soldes = await fetchSoldesParCompte({ dateTo: aLaDate || undefined });
  const cr = computeCompteResultat(soldes);
  const bilan = computeBilan(soldes, cr.resultatNet);

  const equilibre = Math.abs(bilan.totalActif - bilan.totalPassif) < 0.01;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">Comptabilite - SYSCOHADA</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Bilan</h1>
              <p className="mt-2 text-sm text-slate-600">
                Photo du patrimoine a la date choisie (par defaut : aujourd&apos;hui) - Actif (ce que
                l&apos;entreprise possede) et Passif (comment c&apos;est finance), structure standard SYSCOHADA.
                Une rubrique sans compte branche affiche &quot;-&quot;.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/comptabilite" label="Retour Comptabilite" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              A la date de
              <input
                type="date"
                name="a_la_date"
                defaultValue={aLaDate}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
              />
            </label>
            <div className="flex items-end gap-2">
              <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
                Filtrer
              </button>
              <Link
                href="/comptabilite/bilan"
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Aujourd&apos;hui
              </Link>
            </div>
          </form>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Total Actif</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{formatMontant(bilan.totalActif)}</p>
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Total Passif</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{formatMontant(bilan.totalPassif)}</p>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">Actif</h2>
            <RubriqueSection
              titre="Actif immobilise"
              lignes={bilan.actifImmobilise}
              total={bilan.totalActifImmobilise}
              totalLabel="Total actif immobilise"
            />
            <RubriqueSection
              titre="Actif circulant"
              lignes={bilan.actifCirculant}
              total={bilan.totalActifCirculant}
              totalLabel="Total actif circulant"
            />
            <RubriqueSection
              titre="Tresorerie - Actif"
              lignes={bilan.tresorerieActif}
              total={bilan.totalTresorerieActif}
              totalLabel="Total tresorerie actif"
            />
            <div className="overflow-hidden rounded-[1.5rem] border border-slate-900 bg-slate-900 px-5 py-3 text-white">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold uppercase tracking-[0.1em]">Total general Actif</span>
                <span className="text-lg font-black tabular-nums">{formatMontant(bilan.totalActif)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">Passif</h2>
            <RubriqueSection
              titre="Capitaux propres et ressources assimilees"
              lignes={bilan.capitauxPropres}
              total={bilan.totalCapitauxPropres}
              totalLabel="Total capitaux propres"
            />
            <RubriqueSection
              titre="Dettes financieres et ressources assimilees"
              lignes={bilan.dettesFinancieres}
              total={bilan.totalDettesFinancieres}
              totalLabel="Total dettes financieres"
            />
            <RubriqueSection
              titre="Passif circulant"
              lignes={bilan.passifCirculant}
              total={bilan.totalPassifCirculant}
              totalLabel="Total passif circulant"
            />
            <RubriqueSection
              titre="Tresorerie - Passif"
              lignes={bilan.tresoreriePassif}
              total={bilan.totalTresoreriePassif}
              totalLabel="Total tresorerie passif"
            />
            <div className="overflow-hidden rounded-[1.5rem] border border-slate-900 bg-slate-900 px-5 py-3 text-white">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold uppercase tracking-[0.1em]">Total general Passif</span>
                <span className="text-lg font-black tabular-nums">{formatMontant(bilan.totalPassif)}</span>
              </div>
            </div>
          </div>
        </div>

        <p className={`text-xs ${equilibre ? "text-slate-500" : "font-bold text-red-700"}`}>
          {equilibre
            ? "Total Actif = Total Passif (toujours vrai ici, garanti par la partie double) - un ecart signalerait un probleme."
            : `Ecart Actif/Passif de ${formatMontant(bilan.totalActif - bilan.totalPassif)} - ne devrait jamais arriver, signale ce cas.`}
        </p>
      </div>
    </main>
  );
}
