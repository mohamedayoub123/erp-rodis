import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { AnnulerInventaireButton } from "@/app/_components/annuler-inventaire-button";
import { formatDateTime } from "@/lib/format-date";
import { getCurrentStockUser, canInventaireMpDemarrerUser } from "@/lib/stock-auth";
import {
  demarrerInventaireMpAction,
  annulerInventaireMpAction,
  supprimerSessionInventaireMpAction,
} from "./actions";
import { fetchCategorieCounts, fetchGammeCounts } from "./lib";

type SessionRow = {
  id: number;
  statut: "en_cours" | "termine" | "annule";
  taille_lot: number;
  cree_par: string | null;
  created_at: string;
  termine_at: string | null;
  categories_filtre: string[] | null;
  gammes_filtre: string[] | null;
};

// Total de lots dans le PERIMETRE d'une session (pas le nombre de lots deja
// distribues) - une session limitee a des categories/gammes doit afficher
// le total de CE perimetre, pas le total global du MP. Meme regle "OR"
// entre categorie et gamme que distribuerProchainLot (actions.ts).
function scopeTotal(
  categoriesFiltre: string[] | null,
  gammesFiltre: string[] | null,
  categorieCounts: { categorie: string; count: number }[],
  gammeCounts: { gamme: string; count: number }[],
  totalLotsCount: number
): number {
  const hasCategorie = !!categoriesFiltre && categoriesFiltre.length > 0;
  const hasGamme = !!gammesFiltre && gammesFiltre.length > 0;
  if (!hasCategorie && !hasGamme) return totalLotsCount;
  const catSet = hasCategorie ? new Set(categoriesFiltre) : null;
  const gamSet = hasGamme ? new Set(gammesFiltre) : null;
  const fromCat = catSet
    ? categorieCounts.filter((c) => catSet.has(c.categorie)).reduce((sum, c) => sum + c.count, 0)
    : 0;
  const fromGamme = gamSet ? gammeCounts.filter((g) => gamSet.has(g.gamme)).reduce((sum, g) => sum + g.count, 0) : 0;
  // Simple somme (pas d'intersection exacte calculee ici, juste un ordre de
  // grandeur du perimetre) - suffisant pour "combien au total", la vraie
  // liste distribuee (distribuerProchainLot) fait le calcul exact par lot.
  if (catSet && gamSet) return Math.max(fromCat, fromGamme);
  return fromCat || fromGamme;
}

function scopeLabel(categoriesFiltre: string[] | null, gammesFiltre: string[] | null): string {
  const parts = [
    categoriesFiltre && categoriesFiltre.length > 0 ? categoriesFiltre.join(", ") : null,
    gammesFiltre && gammesFiltre.length > 0 ? gammesFiltre.join(", ") : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "tout le MP";
}

export default async function InventaireMpPage() {
  noStore();

  const currentUser = await getCurrentStockUser();
  const peutDemarrer = await canInventaireMpDemarrerUser(currentUser);

  const [{ data: sessionsData }, { data: allSessionsData }, { count: totalLotsCount }, categorieCounts, gammeCounts] =
    await Promise.all([
      supabaseServer
        .from("inventaire_mp_sessions")
        .select("id, statut, taille_lot, cree_par, created_at, termine_at, categories_filtre, gammes_filtre")
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseServer.from("inventaire_mp_sessions").select("id, created_at").order("created_at", { ascending: true }),
      supabaseServer.rpc("stock_mp_lot_balances", {}, { count: "exact", head: true }),
      fetchCategorieCounts(),
      fetchGammeCounts(),
    ]);

  const sessions = (sessionsData as SessionRow[] | null) ?? [];
  const activeSessions = sessions.filter((s) => s.statut === "en_cours");
  const history = sessions.filter((s) => s.statut !== "en_cours");

  // Numero "Inventaire 1/2/3/4..." = rang chronologique de creation, pas
  // l'id brut (qui a des trous des qu'une session est supprimee de
  // l'historique) - demande explicite.
  const rankById = new Map<number, number>(
    ((allSessionsData as { id: number }[] | null) ?? []).map((s, index) => [s.id, index + 1])
  );

  const sessionIds = sessions.map((s) => s.id);
  const statsBySession = new Map<number, { total: number; bon: number; ecarts: number }>();
  if (sessionIds.length > 0) {
    const { data: lignesData } = await supabaseServer
      .from("inventaire_mp_lignes")
      .select("session_id, statut")
      .in("session_id", sessionIds);
    for (const row of (lignesData as { session_id: number; statut: string }[] | null) ?? []) {
      const stats = statsBySession.get(row.session_id) ?? { total: 0, bon: 0, ecarts: 0 };
      stats.total += 1;
      if (row.statut === "bon") stats.bon += 1;
      if (row.statut === "ecart_confirme" || row.statut === "regularise") stats.ecarts += 1;
      statsBySession.set(row.session_id, stats);
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f0fdf4_0%,#fbfffc_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Inventaire MP</h1>
              <p className="mt-2 text-sm text-slate-600">
                Comptage physique du stock, lot par lot, en aveugle. {totalLotsCount ?? 0} lot(s) au total en
                stock actuellement. Tu peux lancer plusieurs inventaires en meme temps, chacun sur son propre
                perimetre.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <BackButton href="/stock/matiere-premiere" label="Retour" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {peutDemarrer ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-lg font-bold text-slate-900">Nouvel inventaire</h2>
            <p className="mt-1 text-sm text-slate-600">
              Choisis combien de lots te donner a la fois, et coche des categories et/ou des gammes pour limiter
              cet inventaire (rien de coche = tout le MP - un article compte des qu&apos;il correspond a l&apos;une
              des cases cochees). Les articles qui bougent le plus seront distribues en premier. Une fois un lot de
              travail entierement compte, le suivant arrive automatiquement.
            </p>
            <form action={demarrerInventaireMpAction} className="mt-4 space-y-4">
              <label className="flex flex-col gap-1 text-sm text-slate-600">
                Nombre de lots a la fois
                <input
                  type="number"
                  name="taille_lot"
                  min={1}
                  max={200}
                  defaultValue={20}
                  required
                  className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700">
                  Categories (optionnel) - le nombre entre parentheses est le nombre de lots a compter
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {categorieCounts.map(({ categorie, count }) => (
                    <label
                      key={categorie}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <input type="checkbox" name="categorie" value={categorie} className="h-4 w-4" />
                      {categorie} <span className="text-slate-400">({count})</span>
                    </label>
                  ))}
                </div>
              </div>
              <details className="rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                  Gammes (optionnel, {gammeCounts.length} disponibles)
                </summary>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {gammeCounts.map(({ gamme, count }) => (
                    <label
                      key={gamme}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <input type="checkbox" name="gamme" value={gamme} className="h-4 w-4" />
                      {gamme} <span className="text-slate-400">({count})</span>
                    </label>
                  ))}
                </div>
              </details>
              <button
                type="submit"
                className="rounded-full bg-emerald-600 px-5 py-2 text-[15px] font-semibold text-white shadow-sm transition hover:opacity-90"
              >
                Commencer
              </button>
            </form>
          </section>
        ) : null}

        {activeSessions.length > 0 ? (
          <section className="rounded-[1.75rem] border border-emerald-200 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-lg font-bold text-slate-900">Inventaires en cours ({activeSessions.length})</h2>
            <ul className="mt-3 divide-y divide-slate-100">
              {activeSessions.map((s) => {
                const stats = statsBySession.get(s.id) ?? { total: 0, bon: 0, ecarts: 0 };
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <Link href={`/stock/matiere-premiere/inventaire/${s.id}`} className="flex-1 hover:opacity-80">
                      <p className="font-semibold text-sky-700 underline">
                        Inventaire {rankById.get(s.id) ?? s.id} - {scopeLabel(s.categories_filtre, s.gammes_filtre)}
                      </p>
                      <p className="text-slate-500">
                        Ouvert le {formatDateTime(s.created_at)} par {s.cree_par || "-"} - {stats.bon + stats.ecarts}{" "}
                        compte(s) sur{" "}
                        {scopeTotal(
                          s.categories_filtre,
                          s.gammes_filtre,
                          categorieCounts,
                          gammeCounts,
                          totalLotsCount ?? 0
                        )}{" "}
                        au total dans ce perimetre - {stats.bon} bon(s), {stats.ecarts} ecart(s)
                      </p>
                    </Link>
                    {peutDemarrer ? (
                      <form action={annulerInventaireMpAction}>
                        <input type="hidden" name="session_id" value={s.id} />
                        <AnnulerInventaireButton />
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <h2 className="text-lg font-bold text-slate-900">Inventaires precedents</h2>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Aucun inventaire termine pour le moment.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {history.map((s) => {
                const stats = statsBySession.get(s.id) ?? { total: 0, bon: 0, ecarts: 0 };
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <Link href={`/stock/matiere-premiere/inventaire/${s.id}`} className="flex-1 hover:opacity-80">
                      <p className="font-semibold text-sky-700 underline">
                        Inventaire {rankById.get(s.id) ?? s.id} - {scopeLabel(s.categories_filtre, s.gammes_filtre)}
                      </p>
                      <p className="text-slate-500">
                        Ouvert le {formatDateTime(s.created_at)} - {s.statut === "annule" ? "Annule" : "Termine"} le{" "}
                        {formatDateTime(s.termine_at)}
                      </p>
                      <p className="text-slate-500">
                        {stats.bon + stats.ecarts} lot(s) compte(s) sur {stats.total} assigne(s) - {stats.bon}{" "}
                        bon(s), {stats.ecarts} ecart(s)
                      </p>
                    </Link>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        s.statut === "annule" ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {s.statut === "annule" ? "Annule" : "Termine"}
                    </span>
                    {peutDemarrer ? (
                      <form action={supprimerSessionInventaireMpAction}>
                        <input type="hidden" name="session_id" value={s.id} />
                        <DeleteIconButton
                          label="Supprimer cet inventaire"
                          confirmMessage="Supprimer cet inventaire de l'historique ? Cette action est definitive (les regularisations deja appliquees restent en place)."
                        />
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
