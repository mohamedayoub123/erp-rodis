import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { formatDate } from "@/lib/format-date";
import { DateJmaFormField } from "@/app/_components/date-jma-input";
import { matchesArticleSearch } from "@/lib/article-search";
import { fetchWebMouvementSourceRows } from "../../shared";
import { createEntreeProductionBatchAction, deletePendingEmballageEntryAction } from "./actions";

type EmballageEntryRow = {
  id: number;
  programme_ligne_id: number;
  code: string;
  quantite: number;
  date_jour: string;
  created_at: string;
};

type LigneInfo = {
  id: number;
  produit: string | null;
  numero_lot: string | null;
  article_id: number | null;
};

type RapportInfo = {
  programme_ligne_id: number;
  date_fabrication_conditionnement: string | null;
  date_peremption: string | null;
};

type DateGroupLigne = {
  entryId: number;
  produit: string;
  numeroLot: string;
  quantite: number;
  dateFabrication: string;
  datePeremption: string;
  hasArticle: boolean;
};

type DateGroup = {
  date: string;
  datesEntree: string[];
  previewNumber: number;
  lignes: DateGroupLigne[];
};

async function fetchPendingEmballageEntries(): Promise<EmballageEntryRow[]> {
  const rows: EmballageEntryRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("production_emballage_entries")
      .select("id, programme_ligne_id, code, quantite, date_jour, created_at")
      .eq("transfere_stock", false)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as EmballageEntryRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchLignesInfo(ligneIds: number[]): Promise<Map<number, LigneInfo>> {
  const map = new Map<number, LigneInfo>();
  if (ligneIds.length === 0) return map;

  const { data } = await supabaseServer
    .from("programme_lignes")
    .select("id, produit, numero_lot, article_id")
    .in("id", ligneIds);

  for (const row of (data as LigneInfo[] | null) ?? []) {
    map.set(row.id, row);
  }

  return map;
}

// Le rapport Conditionnement porte deja "date de fabrication" et "date de
// peremption" saisies a la main - reutilisees ici comme valeurs par defaut
// (modifiables) au lieu de les redemander depuis zero.
async function fetchRapportsInfo(ligneIds: number[]): Promise<Map<number, RapportInfo>> {
  const map = new Map<number, RapportInfo>();
  if (ligneIds.length === 0) return map;

  const { data } = await supabaseServer
    .from("production_rapports")
    .select("programme_ligne_id, date_fabrication_conditionnement, date_peremption")
    .in("programme_ligne_id", ligneIds);

  for (const row of (data as RapportInfo[] | null) ?? []) {
    map.set(row.programme_ligne_id, row);
  }

  return map;
}

async function countExistingEntreeProductionGroups(): Promise<number> {
  const rows = await fetchWebMouvementSourceRows();
  const groupIds = new Set(
    rows.filter((row) => row.source_import === "web:entree-production").map((row) => row.mouvement_groupe_id)
  );
  return groupIds.size;
}

type SearchParams = Promise<{ article?: string; code?: string }>;

export default async function EntreeProductionPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const params = await searchParams;
  const articleFilter = (params.article || "").trim();
  const codeFilter = (params.code || "").trim().toLowerCase();
  const hasFilters = Boolean(articleFilter || codeFilter);

  const [pendingEntries, existingCount] = await Promise.all([
    fetchPendingEmballageEntries(),
    countExistingEntreeProductionGroups(),
  ]);

  const ligneIds = [...new Set(pendingEntries.map((entry) => entry.programme_ligne_id))];
  const [ligneById, rapportById] = await Promise.all([
    fetchLignesInfo(ligneIds),
    fetchRapportsInfo(ligneIds),
  ]);

  const groupsByDate = new Map<string, DateGroup>();

  for (const entry of pendingEntries) {
    const ligne = ligneById.get(entry.programme_ligne_id);
    const rapport = rapportById.get(entry.programme_ligne_id);
    // Regroupe par date de SAISIE (created_at, le jour reel ou l'emballage a
    // ete entre) et non par date_jour (la date programme, saisie a la main
    // sur le formulaire Emballage et parfois differente du jour reel) -
    // sinon des entrees faites le meme jour pour des programmes de dates
    // differentes se retrouvaient a tort dans des lots "Entree Production"
    // separes.
    const date = String(entry.created_at).slice(0, 10);

    let group = groupsByDate.get(date);
    if (!group) {
      group = { date, datesEntree: [], previewNumber: 0, lignes: [] };
      groupsByDate.set(date, group);
    }

    // "Date d'entrer" = date_jour, la date saisie a la main sur le
    // formulaire Emballage pour CETTE production (peut differer du jour
    // reel de validation ci-dessus, ex: emballage fait hier, valide ici
    // aujourd'hui) - affichee en resume dans l'entete du groupe.
    const entryDate = String(entry.date_jour).slice(0, 10);
    if (entryDate && !group.datesEntree.includes(entryDate)) {
      group.datesEntree.push(entryDate);
    }

    // Chaque entree Emballage porte desormais son propre code precis (voir
    // le suivi par code de Suivi Production) - une ligne decoupee en
    // plusieurs lots ("AA1, AA2, AA3") ne doit donc PAS afficher/transferer
    // les 3 codes combines sur chaque entree, seulement celui de CETTE
    // entree. Repli sur le numero_lot combine seulement pour une vieille
    // entree jamais resaisie depuis ce changement ET une ligne qui n'a
    // jamais ete decoupee en plusieurs codes (aucune ambiguite dans ce cas).
    const ligneCodes = (ligne?.numero_lot || "").split(",").map((c) => c.trim()).filter(Boolean);
    const resolvedCode = entry.code || (ligneCodes.length <= 1 ? ligne?.numero_lot || "" : "");

    group.lignes.push({
      entryId: entry.id,
      produit: ligne?.produit || "-",
      numeroLot: resolvedCode || "-",
      quantite: entry.quantite,
      // Par defaut, la date de fabrication proposee est la date d'entree
      // (date_jour, saisie a la main sur le formulaire Emballage) - pas la
      // date du rapport Conditionnement, qui peut dater d'avant l'emballage
      // reel. Reste modifiable a l'ecran avant de valider.
      dateFabrication: entryDate,
      datePeremption: rapport?.date_peremption || "",
      // Le code peut manquer (ligne decoupee en plusieurs lots, entree pas
      // encore resaisie depuis l'ajout du suivi par code) mais reste
      // modifiable a l'ecran juste avant de valider - seul l'article
      // (jamais modifiable ici) bloque vraiment la validation.
      hasArticle: Boolean(ligne?.article_id),
    });
  }

  const dateGroups = [...groupsByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  dateGroups.forEach((group, index) => {
    group.previewNumber = existingCount + index + 1;
    group.datesEntree.sort();
  });

  // Filtre sur les LIGNES (pas sur les groupes) - le numero "Entree
  // Production N" reste celui du groupe complet, pas d'une numerotation qui
  // changerait selon le filtre. Un groupe sans plus aucune ligne apres
  // filtre disparait de l'affichage.
  const visibleGroups = dateGroups
    .map((group) => ({
      ...group,
      lignes: group.lignes.filter((ligne) => {
        if (articleFilter && !matchesArticleSearch(ligne.produit, articleFilter)) return false;
        if (codeFilter && !ligne.numeroLot.toLowerCase().includes(codeFilter)) return false;
        return true;
      }),
    }))
    .filter((group) => group.lignes.length > 0);

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
                Entree Production
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Lignes pretes depuis Suivi Production (Emballage), regroupees par date. Quantite et
                dates sont modifiables avant de valider.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/mouvements/produit-fini" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
            <input
              type="text"
              name="article"
              defaultValue={params.article || ""}
              placeholder="Article"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <input
              type="text"
              name="code"
              defaultValue={params.code || ""}
              placeholder="Code"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <button
              type="submit"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            >
              Filtrer
            </button>
            {hasFilters ? (
              <Link
                href="/mouvements/produit-fini/entree-production"
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Effacer
              </Link>
            ) : null}
          </form>
        </section>

        {dateGroups.length === 0 ? (
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            Rien a transferer pour le moment - aucune quantite emballee non encore entree en stock.
          </div>
        ) : visibleGroups.length === 0 ? (
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            Aucun resultat pour ce filtre.
          </div>
        ) : (
          visibleGroups.map((group) => {
            const allValid = group.lignes.every((ligne) => ligne.hasArticle);
            const totalQuantite = group.lignes.reduce((sum, ligne) => sum + Number(ligne.quantite), 0);

            return (
              <section
                key={group.date}
                className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]"
              >
                <form action={createEntreeProductionBatchAction}>
                  <input
                    type="hidden"
                    name="entry_ids"
                    value={group.lignes.map((ligne) => ligne.entryId).join(",")}
                  />

                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        Entree Production {group.previewNumber}
                        <span className="ml-2 text-sm font-semibold text-emerald-700">
                          Total Qt : {totalQuantite}
                        </span>
                      </h2>
                      <p className="text-xs text-slate-500">
                        Date d&apos;aujourd&apos;hui : {formatDate(group.date)}
                        <span className="mx-2 text-slate-300">|</span>
                        Date d&apos;entrer :{" "}
                        {group.datesEntree.length > 0
                          ? group.datesEntree.map((d) => formatDate(d)).join(", ")
                          : "-"}
                      </p>
                    </div>
                    <button
                      type="submit"
                      disabled={!allValid}
                      className="rounded-full bg-emerald-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Valider cette entree
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Article</th>
                          <th className="px-4 py-3 font-semibold">Code</th>
                          <th className="px-4 py-3 font-semibold">Quantite</th>
                          <th className="px-4 py-3 font-semibold">Date fabrication</th>
                          <th className="px-4 py-3 font-semibold">Date peremption</th>
                          <th className="px-4 py-3 font-semibold">Chambre</th>
                          <th className="px-4 py-3 font-semibold">Code pays</th>
                          <th className="px-4 py-3 font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.lignes.map((ligne) => (
                          <tr key={ligne.entryId} className="border-t border-slate-100 align-top">
                            <td className="px-4 py-3 text-slate-900">{ligne.produit}</td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                name={`code_${ligne.entryId}`}
                                defaultValue={ligne.numeroLot === "-" ? "" : ligne.numeroLot}
                                className="w-32 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                name={`qty_${ligne.entryId}`}
                                defaultValue={ligne.quantite}
                                className="w-28 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <DateJmaFormField
                                name={`datefab_${ligne.entryId}`}
                                defaultValue={ligne.dateFabrication}
                                required
                              />
                            </td>
                            <td className="px-4 py-3">
                              <DateJmaFormField
                                name={`dateperemption_${ligne.entryId}`}
                                defaultValue={ligne.datePeremption}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                name={`chambre_${ligne.entryId}`}
                                placeholder="Chambre"
                                className="w-28 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                name={`codepays_${ligne.entryId}`}
                                placeholder="Code pays"
                                className="w-28 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <DeleteIconButton
                                label="Supprimer cette ligne (annule la quantite emballee correspondante)"
                                formAction={deletePendingEmballageEntryAction.bind(null, ligne.entryId)}
                                formNoValidate
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!allValid ? (
                    <p className="border-t border-red-100 bg-red-50 px-5 py-3 text-xs font-semibold text-red-700">
                      Une ou plusieurs lignes n&apos;ont pas d&apos;article associe - corrige la ligne
                      de programme avant de valider.
                    </p>
                  ) : null}
                </form>
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}
