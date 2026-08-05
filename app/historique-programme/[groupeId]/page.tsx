import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { deleteProgrammeLigneGroupAction, relaunchProgrammeLigneGroupAction } from "../../programe-par-ligne/actions";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";

type ProgrammeLigneRow = {
  id: number;
  groupe_id: number;
  zone: string;
  chaine: string;
  produit: string | null;
  type_article: string | null;
  qt_carton: number | null;
  vrac_a_fabriquer: number | null;
  plateforme: string | null;
  programe: string | null;
  date_jour: string;
  created_at: string;
  numero_lot: string | null;
};

function formatDate(value: string) {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

export default async function HistoriqueProgrammeDetailPage({
  params,
}: {
  params: Promise<{ groupeId: string }>;
}) {
  const { groupeId } = await params;
  const groupeIdNumber = Number(groupeId);
  const currentUser = await getCurrentStockUser();
  const canDelete = await canDeletePageUser(currentUser, "historiqueProgramme");
  const canRelaunch = await canWritePageUser(currentUser, "programeParLigne");

  if (!groupeIdNumber) {
    notFound();
  }

  const { data } = await supabaseServer
    .from("programme_lignes")
    .select(
      "id, groupe_id, zone, chaine, produit, type_article, qt_carton, vrac_a_fabriquer, plateforme, programe, date_jour, created_at, numero_lot"
    )
    .eq("groupe_id", groupeIdNumber)
    .order("id", { ascending: true });

  const lignes = (data ?? []) as ProgrammeLigneRow[];

  if (lignes.length === 0) {
    notFound();
  }

  // Le code PL1.2026, PL2.2026... n'est pas stocke en base - il depend du
  // rang de ce groupe PARMI CEUX DE LA MEME ANNEE (le plus ancien de
  // l'annee = PL1.<annee>), remis a 1 a chaque nouvelle annee de date_jour -
  // meme principe que TE1/TS1 dans Mouvements. La colonne "Programme" reste
  // un champ libre tape par l'utilisateur, independant de ce code.
  const allGroupRows: { groupe_id: number; created_at: string; date_jour: string }[] = [];
  let fromIndex = 0;
  const pageSize = 1000;

  while (true) {
    const { data: groupRows } = await supabaseServer
      .from("programme_lignes")
      .select("groupe_id, created_at, date_jour")
      .range(fromIndex, fromIndex + pageSize - 1);

    const chunk = (groupRows as { groupe_id: number; created_at: string; date_jour: string }[] | null) ?? [];
    allGroupRows.push(...chunk);

    if (chunk.length < pageSize) break;
    fromIndex += pageSize;
  }

  const earliestByGroup = new Map<number, { createdAt: string; dateJourForYear: string }>();
  for (const row of allGroupRows) {
    const current = earliestByGroup.get(row.groupe_id);
    if (!current || new Date(row.created_at).getTime() < new Date(current.createdAt).getTime()) {
      earliestByGroup.set(row.groupe_id, { createdAt: row.created_at, dateJourForYear: row.date_jour });
    }
  }

  const orderedGroupIds = [...earliestByGroup.entries()]
    .sort((a, b) => new Date(a[1].createdAt).getTime() - new Date(b[1].createdAt).getTime())
    .map(([groupeId, info]) => ({ groupeId, annee: new Date(info.dateJourForYear).getFullYear() }));

  const rankByYear = new Map<number, number>();
  let code = `PL-${groupeIdNumber}`;
  for (const entry of orderedGroupIds) {
    const rank = (rankByYear.get(entry.annee) ?? 0) + 1;
    rankByYear.set(entry.annee, rank);
    if (entry.groupeId === groupeIdNumber) {
      code = `PL${rank}.${entry.annee}`;
    }
  }

  const dateJour = lignes[0]?.date_jour;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                {code}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                {formatDate(dateJour)} - {lignes.length} ligne{lignes.length > 1 ? "s" : ""}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <BackButton href="/historique-programme" label="Retour historique" />
              <RefreshButton />
              {canRelaunch ? (
                <Link
                  href={`/programe-par-ligne?groupe_id=${groupeIdNumber}`}
                  className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
                >
                  Charger dans Programme par ligne
                </Link>
              ) : null}
              {canRelaunch ? (
                <form action={relaunchProgrammeLigneGroupAction}>
                  <input type="hidden" name="groupe_id" value={groupeIdNumber} />
                  <button
                    type="submit"
                    className="rounded-full bg-emerald-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
                  >
                    Relancer au Ravitailleur
                  </button>
                </form>
              ) : null}
              {canDelete ? (
                <form action={deleteProgrammeLigneGroupAction}>
                  <input type="hidden" name="groupe_id" value={groupeIdNumber} />
                  <DeleteIconButton />
                </form>
              ) : null}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Zone</th>
                  <th className="px-4 py-3 font-semibold">Chaine</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Produit</th>
                  <th className="px-4 py-3 font-semibold">N Lot</th>
                  <th className="px-4 py-3 font-semibold">Qt carton</th>
                  <th className="px-4 py-3 font-semibold">Vrac a fabriquer</th>
                  <th className="px-4 py-3 font-semibold">Plateforme</th>
                  <th className="px-4 py-3 font-semibold">Programme</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((ligne) => (
                  <tr key={ligne.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{ligne.zone}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{ligne.chaine}</td>
                    <td className="px-4 py-3 text-slate-600">{ligne.type_article || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{ligne.produit || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{ligne.numero_lot || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {ligne.qt_carton !== null ? Math.round(ligne.qt_carton).toLocaleString("fr-FR") : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {ligne.vrac_a_fabriquer !== null
                        ? ligne.vrac_a_fabriquer.toLocaleString("fr-FR")
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{ligne.plateforme || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{ligne.programe || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
