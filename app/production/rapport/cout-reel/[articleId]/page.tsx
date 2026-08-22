import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canVoirPrixUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { computeCoutReelArticle, type LigneIncertaine } from "@/lib/cout-production-reel";
import { MonthPicker } from "./month-picker";
import { fetchAllVracEntries, fetchAllCartonEntries } from "@/app/production/suivi/data";

const MOIS_NOMS = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${MOIS_NOMS[(month || 1) - 1]} ${year}`;
}

function formatFcfa(value: number | null) {
  if (value === null) return "-";
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FCFA`;
}

// Beaucoup de lots partagent exactement le meme motif (ex: "Prix electricite
// non renseigne pour ce mois") - une ligne par lot rendait la liste illisible
// des qu'un mois entier manquait une seule donnee de reference (14+ lots
// identiques). Regroupe par motif identique, plutot qu'une ligne chacun.
function groupLignesIncertaines(lignes: LigneIncertaine[]): { motif: string; codes: string[] }[] {
  const byMotif = new Map<string, string[]>();
  for (const ligne of lignes) {
    const motif = ligne.motifs.join(" ");
    const codes = byMotif.get(motif) ?? [];
    if (ligne.code) codes.push(ligne.code);
    byMotif.set(motif, codes);
  }
  return [...byMotif.entries()].map(([motif, codes]) => ({ motif, codes }));
}

async function fetchProgrammeLigneIds(articleId: number): Promise<number[]> {
  const ids: number[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_lignes")
      .select("id")
      .eq("article_id", articleId)
      .range(from, from + pageSize - 1);

    if (error) break;
    const chunk = (data ?? []) as { id: number }[];
    ids.push(...chunk.map((r) => r.id));
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return ids;
}

type SearchParams = Promise<{ date_from?: string; date_to?: string; months?: string | string[]; code?: string }>;

export default async function CoutReelArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ articleId: string }>;
  searchParams: SearchParams;
}) {
  noStore();
  const { articleId } = await params;
  const articleIdNumber = Number(articleId);
  if (!articleIdNumber) {
    notFound();
  }

  const currentUser = await getCurrentStockUser();
  const canVoirPrix = await canVoirPrixUser(currentUser);

  const { data: articleData } = await supabaseServer
    .from("articles")
    .select("id, nom_article, nature")
    .eq("id", articleIdNumber)
    .maybeSingle();

  if (!articleData) {
    notFound();
  }
  const article = articleData as { id: number; nom_article: string; nature: string | null };
  const nature = article.nature === "vrac" ? "vrac" : "fini";

  const sp = await searchParams;
  const monthsParam = sp.months;
  const selectedMonths = Array.isArray(monthsParam) ? monthsParam : monthsParam ? [monthsParam] : [];
  // Sans filtre explicite : tout l'historique (jamais restreint au mois en
  // cours par defaut) - demande explicite, voir un lot deja fabrique ne
  // devrait jamais dependre d'avoir pense a cocher le bon mois.
  const dateFrom = (sp.date_from || "").trim();
  const dateTo = (sp.date_to || "").trim();

  const ligneIds = await fetchProgrammeLigneIds(articleIdNumber);
  const entriesAll = nature === "vrac" ? await fetchAllVracEntries(ligneIds) : await fetchAllCartonEntries(ligneIds);
  const availableMonths = [...new Set(entriesAll.map((e) => e.date_jour.slice(0, 7)))].sort();
  const availableCodes = [...new Set(entriesAll.map((e) => e.code))].sort();
  const selectedCode = (sp.code || "").trim();

  const periode =
    selectedMonths.length > 0
      ? { months: selectedMonths, code: selectedCode || undefined }
      : { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, code: selectedCode || undefined };

  const result = canVoirPrix ? await computeCoutReelArticle(articleIdNumber, periode) : null;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{article.nom_article}</h1>
              <p className="mt-2 text-sm text-slate-600">Cout de revient reel sur la periode choisie.</p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production/rapport/cout-reel" label="Autre article" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Du
                <input
                  type="date"
                  name="date_from"
                  defaultValue={dateFrom}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Au
                <input
                  type="date"
                  name="date_to"
                  defaultValue={dateTo}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Lot / code (optionnel)
                <input
                  type="text"
                  name="code"
                  list="codes-disponibles"
                  defaultValue={selectedCode}
                  placeholder="Tous les lots"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                />
                <datalist id="codes-disponibles">
                  {availableCodes.map((code) => (
                    <option key={code} value={code} />
                  ))}
                </datalist>
              </label>
              <div className="flex items-end gap-3">
                <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
                  Filtrer
                </button>
                <Link
                  href={`/production/rapport/cout-reel/${articleIdNumber}`}
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
                >
                  Effacer
                </Link>
              </div>
            </div>

            {availableMonths.length > 0 ? (
              <MonthPicker availableMonths={availableMonths} selectedMonths={selectedMonths} />
            ) : (
              <p className="text-sm text-slate-500">Aucune production reelle enregistree pour cet article.</p>
            )}
          </form>
        </section>

        {!canVoirPrix ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            La visibilite des prix est reservee - demande l&apos;acces a un administrateur si besoin.
          </section>
        ) : result ? (
          <>
            <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Cout de revient reel</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500">
                    Quantite reellement produite ({result.uniteQuantite === "kg" ? "kg" : "cartons"})
                  </p>
                  <p className="mt-1 text-xl font-black text-slate-900">
                    {result.quantiteTotaleProduite.toLocaleString("fr-FR")}
                  </p>
                </div>
                {result.nature === "fini" ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Cout vrac reel</p>
                    <p className="mt-1 text-xl font-black text-slate-900">{formatFcfa(result.coutVracReel)}</p>
                  </div>
                ) : null}
                {result.nature === "fini" ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Cout conditionnement reel</p>
                    <p className="mt-1 text-xl font-black text-slate-900">
                      {formatFcfa(result.coutConditionnementReel)}
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Cout vrac reel</p>
                    <p className="mt-1 text-xl font-black text-slate-900">{formatFcfa(result.coutVracReel)}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-slate-500">Cout electricite</p>
                  <p className="mt-1 text-xl font-black text-slate-900">{formatFcfa(result.coutElectricite)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Cout journaliers</p>
                  <p className="mt-1 text-xl font-black text-slate-900">{formatFcfa(result.coutJournaliers)}</p>
                </div>
                {result.nature === "fini" ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Charge generale (usine, par jour/carton)</p>
                    <p className="mt-1 text-xl font-black text-slate-900">{formatFcfa(result.coutChargeGenerale)}</p>
                  </div>
                ) : null}
                <div>
                  <p className="text-xs font-semibold text-slate-500">Cout total</p>
                  <p className="mt-1 text-xl font-black text-slate-900">{formatFcfa(result.coutTotal)}</p>
                </div>
                {result.nature === "fini" ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Cout par carton</p>
                    <p className="mt-1 text-xl font-black text-slate-900">
                      {result.coutParCarton !== null
                        ? `${result.coutParCarton.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} FCFA`
                        : "-"}
                    </p>
                  </div>
                ) : null}
                {result.nature === "fini" ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Cout par piece</p>
                    <p className="mt-1 text-xl font-black text-slate-900">
                      {result.coutParPiece !== null
                        ? `${result.coutParPiece.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} FCFA`
                        : "-"}
                    </p>
                  </div>
                ) : null}
                <div>
                  <p className="text-xs font-semibold text-slate-500">Cout par gramme</p>
                  <p className="mt-1 text-xl font-black text-slate-900">
                    {result.coutParGramme !== null
                      ? `${result.coutParGramme.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} FCFA`
                      : "-"}
                  </p>
                </div>
                {result.nature === "fini" ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Prix de vente par gramme</p>
                    <p className="mt-1 text-xl font-black text-slate-900">
                      {result.prixVenteParGramme !== null
                        ? `${result.prixVenteParGramme.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} FCFA`
                        : "-"}
                    </p>
                  </div>
                ) : null}
                {result.nature === "fini" ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Marge par gramme</p>
                    <p
                      className={`mt-1 text-xl font-black ${
                        result.margeParGramme !== null && result.margeParGramme < 0
                          ? "text-red-600"
                          : "text-emerald-700"
                      }`}
                    >
                      {result.margeParGramme !== null
                        ? `${result.margeParGramme.toLocaleString("fr-FR", { maximumFractionDigits: 2, signDisplay: "always" })} FCFA`
                        : "-"}
                    </p>
                  </div>
                ) : null}
                {result.nature === "fini" ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-500">
                      {result.margeTotale !== null && result.margeTotale < 0 ? "Perte totale" : "Gain total"}
                    </p>
                    <p
                      className={`mt-1 text-xl font-black ${
                        result.margeTotale !== null && result.margeTotale < 0 ? "text-red-600" : "text-emerald-700"
                      }`}
                    >
                      {result.margeTotale !== null ? formatFcfa(Math.abs(result.margeTotale)) : "-"}
                    </p>
                  </div>
                ) : null}
              </div>

              {result.lignesIncertaines.length > 0 ? (
                <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                  <p className="mb-2">
                    {result.lignesIncertaines.length} point{result.lignesIncertaines.length > 1 ? "s" : ""} incertain
                    {result.lignesIncertaines.length > 1 ? "s" : ""} - cout partiel, incomplet :
                  </p>
                  <ul className="ml-4 list-disc space-y-1">
                    {groupLignesIncertaines(result.lignesIncertaines).map((groupe, index) => (
                      <li key={index}>
                        {groupe.codes.length > 0 ? (
                          <span className="font-semibold">
                            Lot{groupe.codes.length > 1 ? "s" : ""} {groupe.codes.join(", ")}
                            {groupe.codes.length > 1 ? ` (${groupe.codes.length})` : ""} :{" "}
                          </span>
                        ) : null}
                        {groupe.motif}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            {result.detailParMois.length > 0 ? (
              <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <div className="border-b border-slate-100 px-6 py-4">
                  <h2 className="text-lg font-bold text-slate-900">Detail par mois</h2>
                </div>
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Mois</th>
                      <th className="px-6 py-3 font-semibold">
                        Quantite ({result.uniteQuantite === "kg" ? "kg" : "cartons"})
                      </th>
                      <th className="px-6 py-3 font-semibold">Cout</th>
                      {result.nature === "fini" ? (
                        <>
                          <th className="px-6 py-3 font-semibold">Vente</th>
                          <th className="px-6 py-3 font-semibold">Marge</th>
                        </>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {result.detailParMois.map((row) => (
                      <tr key={row.mois} className="border-t border-slate-100">
                        <td className="px-6 py-3 font-medium text-slate-900">{monthLabel(row.mois)}</td>
                        <td className="px-6 py-3 text-slate-600">{row.quantite.toLocaleString("fr-FR")}</td>
                        <td className="px-6 py-3 text-slate-600">{formatFcfa(row.coutTotal)}</td>
                        {result.nature === "fini" ? (
                          <>
                            <td className="px-6 py-3 text-slate-600">{formatFcfa(row.vente)}</td>
                            <td
                              className={`px-6 py-3 font-semibold ${
                                row.marge !== null && row.marge < 0 ? "text-red-600" : "text-emerald-700"
                              }`}
                            >
                              {formatFcfa(row.marge)}
                            </td>
                          </>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
