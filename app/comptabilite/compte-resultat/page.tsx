import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { fetchSoldesParCompte } from "@/lib/comptabilite";
import { computeCompteResultat, type LigneEtat } from "@/lib/syscohada";

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

// Compte de resultat au format SYSCOHADA (Produits d'exploitation / Charges
// d'exploitation, puis Resultat d'exploitation -> financier -> activites
// ordinaires -> HAO -> net) - construit uniquement a partir des comptes du
// plan comptable qui existent reellement aujourd'hui (voir lib/syscohada.ts).
// Une rubrique sans compte branche (charges de personnel, resultat
// financier...) affiche "-", pas 0 devine : la structure standard reste
// complete, mais rien n'est invente.
export default async function CompteResultatPage() {
  noStore();

  const soldes = await fetchSoldesParCompte();
  const cr = computeCompteResultat(soldes);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">Comptabilite - SYSCOHADA</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Compte de resultat</h1>
              <p className="mt-2 text-sm text-slate-600">
                Produits et charges depuis le debut de la comptabilite (pas encore de filtre par periode) -
                structure standard SYSCOHADA, une rubrique sans compte branche affiche &quot;-&quot;.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/comptabilite" label="Retour Comptabilite" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Resultat net de l&apos;exercice</p>
          <p className={`mt-2 text-3xl font-black ${cr.resultatNet < 0 ? "text-red-700" : "text-emerald-700"}`}>
            {formatMontant(cr.resultatNet)}
          </p>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="border-b border-slate-100 bg-slate-50 px-6 py-3">
            <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-slate-700">Produits d&apos;exploitation</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <tbody>
                {cr.produitsExploitation.map((ligne) => (
                  <LigneRow key={ligne.libelle} ligne={ligne} />
                ))}
                <LigneRow ligne={{ libelle: "Total produits d'exploitation", montant: cr.totalProduitsExploitation, isTotal: true }} />
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="border-b border-slate-100 bg-slate-50 px-6 py-3">
            <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-slate-700">Charges d&apos;exploitation</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <tbody>
                {cr.chargesExploitation.map((ligne) => (
                  <LigneRow key={ligne.libelle} ligne={ligne} />
                ))}
                <LigneRow ligne={{ libelle: "Total charges d'exploitation", montant: cr.totalChargesExploitation, isTotal: true }} />
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <tbody>
                <LigneRow ligne={{ libelle: "Resultat d'exploitation", montant: cr.resultatExploitation, isSousTotal: true }} />
                <LigneRow ligne={{ libelle: "Resultat financier", montant: cr.resultatFinancier, indent: true }} />
                <LigneRow
                  ligne={{ libelle: "Resultat des activites ordinaires (RAO)", montant: cr.resultatActivitesOrdinaires, isSousTotal: true }}
                />
                <LigneRow ligne={{ libelle: "Resultat HAO (hors activites ordinaires)", montant: cr.resultatHao, indent: true }} />
                <LigneRow ligne={{ libelle: "Resultat net de l'exercice", montant: cr.resultatNet, isTotal: true }} />
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
