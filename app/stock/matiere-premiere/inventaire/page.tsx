import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { AnnulerInventaireButton } from "@/app/_components/annuler-inventaire-button";
import { formatDateTime } from "@/lib/format-date";
import {
  demarrerInventaireMpAction,
  annulerInventaireMpAction,
  supprimerSessionInventaireMpAction,
} from "./actions";

type SessionRow = {
  id: number;
  statut: "en_cours" | "termine" | "annule";
  taille_lot: number;
  cree_par: string | null;
  created_at: string;
  termine_at: string | null;
  categories_filtre: string[] | null;
};

type CategorieCount = { categorie: string; count: number };

async function fetchCategorieCounts(): Promise<CategorieCount[]> {
  const counts = new Map<string, number>();
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("categorie")
      .range(from, from + pageSize - 1);
    if (error) break;
    const chunk = (data ?? []) as { categorie: string | null }[];
    for (const row of chunk) {
      const cat = (row.categorie || "").trim();
      if (!cat) continue;
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return [...counts.entries()]
    .map(([categorie, count]) => ({ categorie, count }))
    .sort((a, b) => a.categorie.localeCompare(b.categorie, "fr"));
}

export default async function InventaireMpPage() {
  noStore();

  const [{ data: sessionsData }, { count: totalLotsCount }, categorieCounts] = await Promise.all([
    supabaseServer
      .from("inventaire_mp_sessions")
      .select("id, statut, taille_lot, cree_par, created_at, termine_at, categories_filtre")
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseServer.rpc("stock_mp_lot_balances", {}, { count: "exact", head: true }),
    fetchCategorieCounts(),
  ]);

  const sessions = (sessionsData as SessionRow[] | null) ?? [];
  const activeSessions = sessions.filter((s) => s.statut === "en_cours");
  const history = sessions.filter((s) => s.statut !== "en_cours");

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
                stock actuellement. Tu peux lancer plusieurs inventaires en meme temps, chacun sur ses propres
                categories.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <BackButton href="/stock/matiere-premiere" label="Retour" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <h2 className="text-lg font-bold text-slate-900">Nouvel inventaire</h2>
          <p className="mt-1 text-sm text-slate-600">
            Choisis combien de lots te donner a la fois, et coche une ou plusieurs categories pour limiter cet
            inventaire (rien de coche = tout le MP). Les articles qui bougent le plus seront distribues en
            premier. Une fois un lot de travail entierement compte, le suivant arrive automatiquement.
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
              <p className="mb-2 text-sm font-semibold text-slate-700">Categories (optionnel)</p>
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
            <button
              type="submit"
              className="rounded-full bg-emerald-600 px-5 py-2 text-[15px] font-semibold text-white shadow-sm transition hover:opacity-90"
            >
              Commencer
            </button>
          </form>
        </section>

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
                        Session #{s.id}{" "}
                        {s.categories_filtre && s.categories_filtre.length > 0
                          ? `- ${s.categories_filtre.join(", ")}`
                          : "- tout le MP"}
                      </p>
                      <p className="text-slate-500">
                        Demarree le {formatDateTime(s.created_at)} par {s.cree_par || "-"} - {stats.total} lot(s)
                        traite(s), {stats.bon} bon(s), {stats.ecarts} ecart(s)
                      </p>
                    </Link>
                    <form action={annulerInventaireMpAction}>
                      <input type="hidden" name="session_id" value={s.id} />
                      <AnnulerInventaireButton />
                    </form>
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
                        Session #{s.id} - {formatDateTime(s.termine_at)}
                        {s.categories_filtre && s.categories_filtre.length > 0
                          ? ` - ${s.categories_filtre.join(", ")}`
                          : ""}
                      </p>
                      <p className="text-slate-500">
                        {stats.total} lot(s) compte(s), {stats.bon} bon(s), {stats.ecarts} ecart(s)
                      </p>
                    </Link>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        s.statut === "annule" ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {s.statut === "annule" ? "Annule" : "Termine"}
                    </span>
                    <form action={supprimerSessionInventaireMpAction}>
                      <input type="hidden" name="session_id" value={s.id} />
                      <DeleteIconButton
                        label="Supprimer cet inventaire"
                        confirmMessage="Supprimer cet inventaire de l'historique ? Cette action est definitive (les regularisations deja appliquees restent en place)."
                      />
                    </form>
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
