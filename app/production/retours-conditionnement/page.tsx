import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { getCurrentStockUser, canWritePageUser } from "@/lib/stock-auth";
import { computePdCodesFromRows, type PdGroupRow } from "@/lib/programme-numbering";
import { RetourConditionnementForm, type DepotOption, type LeftoverLigne } from "./return-form";

type HistoryRow = {
  id: number;
  groupe_id: number | null;
  source_groupe_id: number | null;
  code: string | null;
  produit: string | null;
  created_at: string;
};

type PdGroupLeftover = {
  groupeId: number;
  pdCode: string;
  lignes: LeftoverLigne[];
};

async function fetchAllHistoryRows(): Promise<HistoryRow[]> {
  const rows: HistoryRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_dispatcher_history")
      .select("id, groupe_id, source_groupe_id, code, produit, created_at")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as HistoryRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

// Pour chaque PD (programme_dispatcher_history.groupe_id), retrouve les
// articles de conditionnement (production_code_termine.stage =
// "salle_conditionnement") encore reserves (production_mp_reserve.quantite
// > 0) pour un code dont le Conditionnement a ete marque "Fin Programme"
// (production_code_termine.stage = "carton", cree par markCartonTermineAction
// sur le Dashboard Suivi Production - le VRAI signal de "termine" tel que
// l'utilisateur le declenche) - ce sont les restes physiquement preleves de
// l'entrepot mais jamais consommes, donc a retourner. Utilisait avant
// programme_lignes.programme_termine, qui ne passe JAMAIS a true via ce
// bouton (seulement quand un groupe Dispatcher entier est supprime) - bug
// reel confirme : cette page restait toujours vide en usage normal. Un PD
// sans aucun reste (pas encore termine, deja tout consomme, ou deja
// retourne - production_mp_reserve.quantite mis a 0 par
// retournerConditionnementAction) n'apparait jamais ici.
async function fetchRetoursConditionnement(): Promise<PdGroupLeftover[]> {
  const allHistoryRows = await fetchAllHistoryRows();
  const pdCodeByGroupeId = computePdCodesFromRows(allHistoryRows as PdGroupRow[]);

  const groupsMap = new Map<number, HistoryRow[]>();
  for (const row of allHistoryRows) {
    if (row.groupe_id === null) continue;
    const list = groupsMap.get(row.groupe_id) ?? [];
    list.push(row);
    groupsMap.set(row.groupe_id, list);
  }

  const allCodes = new Set<string>();
  for (const row of allHistoryRows) {
    const code = (row.code || "").trim();
    if (code) allCodes.add(code);
  }
  if (allCodes.size === 0) return [];

  const { data: cartonDoneData } = await supabaseServer
    .from("production_code_termine")
    .select("code")
    .in("code", [...allCodes])
    .eq("stage", "carton");
  const cartonDoneCodes = new Set(
    ((cartonDoneData ?? []) as { code: string | null }[]).map((r) => (r.code || "").trim())
  );

  if (cartonDoneCodes.size === 0) return [];

  type CodeContext = { code: string; produit: string | null };
  const terminatedByGroup = new Map<number, CodeContext[]>();
  const allTerminatedCodes = new Set<string>();

  for (const [groupeId, rows] of groupsMap.entries()) {
    const seenCodes = new Set<string>();
    const contexts: CodeContext[] = [];

    for (const row of rows) {
      const code = (row.code || "").trim();
      if (!code || seenCodes.has(code)) continue;
      seenCodes.add(code);

      if (cartonDoneCodes.has(code)) {
        contexts.push({ code, produit: row.produit });
        allTerminatedCodes.add(code);
      }
    }

    if (contexts.length > 0) terminatedByGroup.set(groupeId, contexts);
  }

  if (allTerminatedCodes.size === 0) return [];

  const { data: termineRowsData } = await supabaseServer
    .from("production_code_termine")
    .select("id, code, programme_ligne_id")
    .in("code", [...allTerminatedCodes])
    .eq("stage", "salle_conditionnement");
  const termineRows = (termineRowsData ?? []) as { id: number; code: string; programme_ligne_id: number }[];

  if (termineRows.length === 0) return [];

  const { data: reserveRowsData } = await supabaseServer
    .from("production_mp_reserve")
    .select("id, article_mp_id, numero_lot, quantite, depot_id, production_code_termine_id")
    .in(
      "production_code_termine_id",
      termineRows.map((t) => t.id)
    )
    .gt("quantite", 0);
  const reserveRows = (reserveRowsData ?? []) as {
    id: number;
    article_mp_id: number;
    numero_lot: string | null;
    quantite: number;
    depot_id: number | null;
    production_code_termine_id: number;
  }[];

  if (reserveRows.length === 0) return [];

  const articleIds = [...new Set(reserveRows.map((r) => r.article_mp_id))];
  const depotIds = [...new Set(reserveRows.map((r) => r.depot_id).filter((id): id is number => id !== null))];

  const [{ data: articlesData }, { data: depotsData }] = await Promise.all([
    supabaseServer
      .from("articles_matiere_premiere")
      .select("id, nom_article")
      .in("id", articleIds.length > 0 ? articleIds : [0]),
    supabaseServer
      .from("depots")
      .select("id, nom")
      .in("id", depotIds.length > 0 ? depotIds : [0]),
  ]);
  const nomArticleById = new Map(
    ((articlesData ?? []) as { id: number; nom_article: string }[]).map((a) => [a.id, a.nom_article])
  );
  const nomDepotById = new Map(((depotsData ?? []) as { id: number; nom: string }[]).map((d) => [d.id, d.nom]));

  const codeByTermineId = new Map(termineRows.map((t) => [t.id, t.code]));
  const reservesByCode = new Map<string, typeof reserveRows>();
  for (const reserve of reserveRows) {
    const code = codeByTermineId.get(reserve.production_code_termine_id);
    if (!code) continue;
    const list = reservesByCode.get(code) ?? [];
    list.push(reserve);
    reservesByCode.set(code, list);
  }

  const result: PdGroupLeftover[] = [];
  for (const [groupeId, contexts] of terminatedByGroup.entries()) {
    const lignes: LeftoverLigne[] = [];

    for (const { code, produit } of contexts) {
      const reserves = reservesByCode.get(code) ?? [];
      for (const reserve of reserves) {
        lignes.push({
          reserveId: reserve.id,
          articleId: reserve.article_mp_id,
          nomArticle: nomArticleById.get(reserve.article_mp_id) ?? `Article #${reserve.article_mp_id}`,
          numeroLot: reserve.numero_lot ?? "-",
          quantite: Number(reserve.quantite),
          depotNom: reserve.depot_id !== null ? nomDepotById.get(reserve.depot_id) ?? `Depot #${reserve.depot_id}` : "-",
          produit,
          code,
        });
      }
    }

    if (lignes.length === 0) continue;

    lignes.sort((a, b) => a.nomArticle.localeCompare(b.nomArticle) || a.numeroLot.localeCompare(b.numeroLot));

    result.push({
      groupeId,
      pdCode: pdCodeByGroupeId.get(groupeId) ?? `PD-${groupeId}`,
      lignes,
    });
  }

  result.sort((a, b) => {
    const na = Number(a.pdCode.replace(/^PD/, "")) || 0;
    const nb = Number(b.pdCode.replace(/^PD/, "")) || 0;
    return nb - na;
  });

  return result;
}

async function fetchDepotOptions(): Promise<{
  depots: DepotOption[];
  depotSourceDefault: number;
  depotDestinationDefault: number;
}> {
  const { data } = await supabaseServer.from("depots").select("id, nom").order("nom", { ascending: true });
  const rows = (data ?? []) as { id: number; nom: string }[];
  const depots: DepotOption[] = rows.map((d) => ({ id: d.id, label: d.nom }));

  const depotB = rows.find((d) => d.nom.toLowerCase().includes("depot b") || d.nom.toLowerCase() === "b");
  const depotE = rows.find((d) => d.nom.toLowerCase().includes("depot e") || d.nom.toLowerCase() === "e");

  return {
    depots,
    depotSourceDefault: depotB?.id ?? rows[0]?.id ?? 2,
    depotDestinationDefault: depotE?.id ?? rows[0]?.id ?? 3,
  };
}

export default async function RetoursConditionnementPage() {
  noStore();

  const currentUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentUser, "retoursConditionnement");

  const [groups, { depots, depotSourceDefault, depotDestinationDefault }] = await Promise.all([
    fetchRetoursConditionnement(),
    fetchDepotOptions(),
  ]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Retours Conditionnement</h1>
              <p className="mt-2 text-sm text-slate-600">
                Pour chaque PD, les articles de conditionnement (carton, flacon, capsule...) restes reserves une
                fois un article marque &quot;termine&quot;. Coche les lignes a retourner puis cree le Transfer
                Order (TO) vers le depot general - le retour physique se termine ensuite normalement depuis Depots.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production" label="Retour production" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          {groups.length === 0 ? (
            <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              Aucun reste de conditionnement a retourner pour le moment.
            </div>
          ) : (
            groups.map((group) => (
              <details key={group.groupeId} className="rounded-[2rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]" open>
                <summary className="cursor-pointer text-lg font-bold text-slate-900">
                  {group.pdCode} - {group.lignes.length} ligne{group.lignes.length > 1 ? "s" : ""} a retourner
                </summary>

                <div className="mt-4">
                  {canWrite ? (
                    <RetourConditionnementForm
                      pdCode={group.pdCode}
                      lignes={group.lignes}
                      depots={depots}
                      depotSourceDefault={depotSourceDefault}
                      depotDestinationDefault={depotDestinationDefault}
                    />
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-100">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500">
                          <tr>
                            <th className="px-4 py-2 font-semibold">Produit / Code</th>
                            <th className="px-4 py-2 font-semibold">Article</th>
                            <th className="px-4 py-2 font-semibold">Lot</th>
                            <th className="px-4 py-2 font-semibold">Quantite restante</th>
                            <th className="px-4 py-2 font-semibold">Depot d&apos;origine</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.lignes.map((ligne) => (
                            <tr key={ligne.reserveId} className="border-t border-slate-100">
                              <td className="px-4 py-2 text-slate-600">
                                {ligne.produit ? `${ligne.produit} - ` : ""}
                                {ligne.code}
                              </td>
                              <td className="px-4 py-2 font-medium text-slate-900">{ligne.nomArticle}</td>
                              <td className="px-4 py-2 text-slate-600">{ligne.numeroLot}</td>
                              <td className="px-4 py-2 text-slate-600">
                                {ligne.quantite.toLocaleString("fr-FR", { maximumFractionDigits: 3 })}
                              </td>
                              <td className="px-4 py-2 text-slate-600">{ligne.depotNom}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </details>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
