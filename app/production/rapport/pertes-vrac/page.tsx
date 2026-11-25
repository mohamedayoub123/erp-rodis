import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ExportExcelButton } from "@/app/_components/export-excel-button";
import { calculerCiblesVrac, lireDonneesProductionVrac, type CibleVrac } from "@/lib/vrac-stock-depot-b";
import { DELAI_PERTE_JOURS, SEUIL_PERTE_SIGNALEE_KG, ajouterJours } from "@/lib/vrac-perte";

// Rapport Pertes de vrac : quand le Conditionnement d'un code est termine (Fin programme), le reste de son vrac garde sa place 5 jours au Depot
// B ; passe ce delai ce qui reste est PERDU (lib/vrac-perte.ts). Ce rapport signale les codes qui ont perdu plus de 100 kg (seuil modifiable) et,
// a part, ceux dont le reste sera perdu bientot (encore le temps de le conditionner).

type SearchParams = Promise<{
  seuil?: string;
  code?: string;
  produit?: string;
  date_debut?: string;
  date_fin?: string;
  tout?: string;
}>;

const LIGNES_AFFICHEES = 150;
const JOURS_PAR_DEFAUT = 60;

function formaterKg(valeur: number): string {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

function formaterJour(jour: string | null): string {
  if (!jour) return "-";
  const [annee, mois, jourDuMois] = jour.split("-");
  return `${jourDuMois}/${mois}/${annee}`;
}

type Ligne = {
  code: string;
  produit: string;
  fabrique: number;
  utilise: number;
  reste: number;
  perte: number;
  pct: number | null;
  dateCloture: string | null;
  datePerte: string | null;
};

function versLigne(cible: CibleVrac): Ligne {
  return {
    code: cible.code,
    produit: cible.produit ?? "-",
    fabrique: cible.entree,
    utilise: cible.sortie,
    reste: cible.reste,
    perte: cible.perte,
    pct: cible.entree > 0 ? (cible.perte > 0 ? cible.perte : cible.reste) / cible.entree * 100 : null,
    dateCloture: cible.dateCloture,
    datePerte: cible.datePerte,
  };
}

const COLONNES_EXPORT = [
  { label: "Perdu le", key: "datePerte" },
  { label: "Code", key: "code" },
  { label: "Produit", key: "produit" },
  { label: "Vrac fabrique (kg)", key: "fabrique" },
  { label: "Utilise en cartons (kg)", key: "utilise" },
  { label: "Perte (kg)", key: "perte" },
  { label: "% du vrac fabrique", key: "pct" },
  { label: "Fin programme le", key: "dateCloture" },
];

export default async function RapportPertesVracPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const seuilSaisi = (params.seuil ?? "").trim().replace(",", ".");
  const seuil = seuilSaisi !== "" && Number.isFinite(Number(seuilSaisi)) && Number(seuilSaisi) >= 0 ? Number(seuilSaisi) : SEUIL_PERTE_SIGNALEE_KG;
  const codeFiltre = (params.code ?? "").trim().toLowerCase();
  const produitFiltre = (params.produit ?? "").trim().toLowerCase();
  const toutVoir = params.tout === "1";

  const donnees = await lireDonneesProductionVrac();
  const aujourdhui = donnees.aujourdhui;
  const dateDebut = (params.date_debut ?? "").trim() || ajouterJours(aujourdhui, -JOURS_PAR_DEFAUT);
  const dateFin = (params.date_fin ?? "").trim();
  const periodeParDefaut = !(params.date_debut ?? "").trim();

  const { cibles } = calculerCiblesVrac(donnees);
  const correspond = (ligne: Ligne) =>
    (!codeFiltre || ligne.code.toLowerCase().includes(codeFiltre)) && (!produitFiltre || ligne.produit.toLowerCase().includes(produitFiltre));

  // Reste deja perdu, dans la periode, au-dessus du seuil
  const perdus = cibles
    .filter((c) => c.perte > seuil && c.datePerte && c.datePerte >= dateDebut && (!dateFin || c.datePerte <= dateFin))
    .map(versLigne)
    .filter(correspond)
    .sort((a, b) => b.perte - a.perte);
  // Reste d'un code termine pas encore perdu : encore le temps de le conditionner
  const aVenir = cibles
    .filter((c) => c.dateCloture && c.perte === 0 && c.reste > seuil && c.datePerte && c.datePerte > aujourdhui)
    .map(versLigne)
    .filter(correspond)
    .sort((a, b) => (a.datePerte ?? "").localeCompare(b.datePerte ?? "") || b.reste - a.reste);

  const totalPerdu = perdus.reduce((somme, ligne) => somme + ligne.perte, 0);
  const totalFabrique = perdus.reduce((somme, ligne) => somme + ligne.fabrique, 0);
  const totalAVenir = aVenir.reduce((somme, ligne) => somme + ligne.reste, 0);
  const affichees = toutVoir ? perdus : perdus.slice(0, LIGNES_AFFICHEES);

  const exportRows = perdus.map((ligne) => ({
    datePerte: formaterJour(ligne.datePerte),
    code: ligne.code,
    produit: ligne.produit,
    fabrique: Math.round(ligne.fabrique * 10) / 10,
    utilise: Math.round(ligne.utilise * 10) / 10,
    perte: Math.round(ligne.perte * 10) / 10,
    pct: ligne.pct !== null ? `${ligne.pct.toFixed(1)}%` : "",
    dateCloture: formaterJour(ligne.dateCloture),
  }));

  const aDesFiltres = Boolean(codeFiltre || produitFiltre || (params.date_debut ?? "").trim() || dateFin || seuilSaisi !== "");

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Pertes de vrac</h1>
              <p className="mt-2 text-sm text-slate-600">
                Apres le Fin programme du Conditionnement, le reste du vrac garde sa place {DELAI_PERTE_JOURS} jours au Depot B. Passe ce delai,
                ce qui reste est perdu. Ici : les codes qui ont perdu plus de {formaterKg(seuil)} kg.
              </p>
              {periodeParDefaut ? (
                <p className="mt-1 text-xs text-slate-400">
                  Affiche les {JOURS_PAR_DEFAUT} derniers jours par defaut (date de la perte) - change la date pour retrouver plus ancien.
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production/rapport" label="Retour rapports" />
              <ExportExcelButton rows={exportRows} columns={COLONNES_EXPORT} filename={`pertes-vrac-${aujourdhui}.xlsx`} />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="flex flex-wrap items-end gap-4">
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Perte de plus de (kg)
              <input
                type="text"
                inputMode="decimal"
                name="seuil"
                defaultValue={seuilSaisi !== "" ? seuilSaisi : String(SEUIL_PERTE_SIGNALEE_KG)}
                className="w-32 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-normal normal-case text-slate-900 outline-none"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Code
              <input
                type="text"
                name="code"
                defaultValue={params.code ?? ""}
                className="w-40 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-normal normal-case text-slate-900 outline-none"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Produit
              <input
                type="text"
                name="produit"
                defaultValue={params.produit ?? ""}
                className="w-56 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-normal normal-case text-slate-900 outline-none"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Perdu depuis le
              <input
                type="date"
                name="date_debut"
                defaultValue={(params.date_debut ?? "").trim()}
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-normal normal-case text-slate-900 outline-none"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Perdu jusqu&apos;au
              <input
                type="date"
                name="date_fin"
                defaultValue={dateFin}
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-normal normal-case text-slate-900 outline-none"
              />
            </label>
            <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
              Filtrer
            </button>
            {aDesFiltres ? (
              <Link
                href="/production/rapport/pertes-vrac"
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Effacer
              </Link>
            ) : null}
          </form>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-[1.75rem] border border-black/5 bg-red-50 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-700">Vrac perdu</p>
            <p className="mt-2 text-3xl font-black text-red-900">{formaterKg(totalPerdu)} kg</p>
            <p className="mt-1 text-xs text-red-700">{perdus.length} code(s) au-dessus de {formaterKg(seuil)} kg</p>
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">% du vrac fabrique de ces codes</p>
            <p className="mt-2 text-3xl font-black text-slate-900">
              {totalFabrique > 0 ? `${((totalPerdu / totalFabrique) * 100).toFixed(1)}%` : "-"}
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-amber-50 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">Sera perdu bientot</p>
            <p className="mt-2 text-3xl font-black text-amber-900">{formaterKg(totalAVenir)} kg</p>
            <p className="mt-1 text-xs text-amber-700">{aVenir.length} code(s) termine(s), encore le temps de le conditionner</p>
          </div>
        </section>

        {aVenir.length > 0 ? (
          <section className="overflow-hidden rounded-[1.75rem] border border-amber-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-900">
              Vrac qui sera perdu bientot (Conditionnement termine, plus de {formaterKg(seuil)} kg qui restent)
            </div>
            <div className="max-h-[40vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Sera perdu le</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Code</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Produit</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Vrac fabrique (kg)</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Utilise (kg)</th>
                    <th className="sticky top-0 z-10 bg-amber-50 px-4 py-3 font-semibold text-amber-800">Reste (kg)</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Fin programme le</th>
                  </tr>
                </thead>
                <tbody>
                  {aVenir.map((ligne) => (
                    <tr key={ligne.code} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-semibold text-amber-800">{formaterJour(ligne.datePerte)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{ligne.code}</td>
                      <td className="px-4 py-3 text-slate-600">{ligne.produit}</td>
                      <td className="px-4 py-3 text-slate-600">{formaterKg(ligne.fabrique)}</td>
                      <td className="px-4 py-3 text-slate-600">{formaterKg(ligne.utilise)}</td>
                      <td className="bg-amber-50/40 px-4 py-3 font-semibold text-amber-900">{formaterKg(ligne.reste)}</td>
                      <td className="px-4 py-3 text-slate-600">{formaterJour(ligne.dateCloture)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {perdus.length === 0 ? (
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            Aucun code n&apos;a perdu plus de {formaterKg(seuil)} kg sur cette periode.
          </div>
        ) : (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Perdu le</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Code</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Produit</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Vrac fabrique (kg)</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Utilise en cartons (kg)</th>
                    <th className="sticky top-0 z-10 bg-red-50 px-4 py-3 font-semibold text-red-800">Perte (kg)</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">% du fabrique</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Fin programme le</th>
                  </tr>
                </thead>
                <tbody>
                  {affichees.map((ligne) => (
                    <tr key={ligne.code} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-600">{formaterJour(ligne.datePerte)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{ligne.code}</td>
                      <td className="px-4 py-3 text-slate-600">{ligne.produit}</td>
                      <td className="px-4 py-3 text-slate-600">{formaterKg(ligne.fabrique)}</td>
                      <td className="px-4 py-3 text-slate-600">{formaterKg(ligne.utilise)}</td>
                      <td className="bg-red-50/40 px-4 py-3 font-semibold text-red-800">{formaterKg(ligne.perte)}</td>
                      <td className={`px-4 py-3 ${ligne.pct !== null && ligne.pct > 25 ? "font-semibold text-red-700" : "text-slate-600"}`}>
                        {ligne.pct !== null ? `${ligne.pct.toFixed(1)}%` : "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formaterJour(ligne.dateCloture)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {!toutVoir && perdus.length > LIGNES_AFFICHEES ? (
          <div className="rounded-[1.75rem] border border-black/5 bg-white px-6 py-4 text-sm shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <span className="text-slate-500">
              {LIGNES_AFFICHEES} codes affiches sur {perdus.length} (les plus gros d&apos;abord).
            </span>{" "}
            <Link
              href={`/production/rapport/pertes-vrac?${new URLSearchParams({
                ...(params.seuil ? { seuil: params.seuil } : {}),
                ...(params.code ? { code: params.code } : {}),
                ...(params.produit ? { produit: params.produit } : {}),
                ...(params.date_debut ? { date_debut: params.date_debut } : {}),
                ...(params.date_fin ? { date_fin: params.date_fin } : {}),
                tout: "1",
              }).toString()}`}
              className="font-semibold text-sky-700 underline"
            >
              Voir tout
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  );
}
