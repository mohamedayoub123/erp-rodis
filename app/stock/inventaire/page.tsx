import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { formatDateTime } from "@/lib/format-date";
import { AnnulerInventaireButton } from "@/app/_components/annuler-inventaire-button";
import {
  getCurrentStockUser,
  canInventairePfDemarrerUser,
  canInventairePfCompterUser,
  canInventairePfRegulariserUser,
} from "@/lib/stock-auth";
import {
  demarrerInventairePfAction,
  soumettreComptagePfAction,
  regulariserLignePfAction,
  annulerInventairePfAction,
  supprimerSessionInventairePfAction,
} from "./actions";

type SessionRow = {
  id: number;
  statut: "en_cours" | "termine" | "annule";
  taille_lot: number;
  cree_par: string | null;
  created_at: string;
  termine_at: string | null;
};

type LigneRow = {
  id: number;
  article_id: number;
  numero_lot: string;
  lot_numero: number;
  stock_systeme: number;
  compte_1: number | null;
  compte_2: number | null;
  compte_3: number | null;
  nombre_comptages: number;
  statut: "a_compter" | "bon" | "ecart_confirme" | "regularise";
  regularise_par: string | null;
};

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function attemptLabel(nombreComptages: number) {
  if (nombreComptages === 0) return "1er comptage";
  if (nombreComptages === 1) return "2e comptage (ne correspondait pas)";
  return "3e et dernier comptage (ne correspondait toujours pas)";
}

function StatutBadge({ statut }: { statut: LigneRow["statut"] }) {
  const config: Record<LigneRow["statut"], { label: string; className: string }> = {
    a_compter: { label: "A compter", className: "bg-slate-100 text-slate-600" },
    bon: { label: "Bon", className: "bg-emerald-100 text-emerald-800" },
    ecart_confirme: { label: "Ecart confirme", className: "bg-red-100 text-red-800" },
    regularise: { label: "Regularise", className: "bg-sky-100 text-sky-800" },
  };
  const { label, className } = config[statut];
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}

export default async function InventairePfPage() {
  noStore();

  const currentUser = await getCurrentStockUser();
  const [peutDemarrer, peutCompter, peutRegulariser] = await Promise.all([
    canInventairePfDemarrerUser(currentUser),
    canInventairePfCompterUser(currentUser),
    canInventairePfRegulariserUser(currentUser),
  ]);

  const { data: activeSessionData } = await supabaseServer
    .from("inventaire_pf_sessions")
    .select("id, statut, taille_lot, cree_par, created_at, termine_at")
    .eq("statut", "en_cours")
    .maybeSingle();
  const activeSession = activeSessionData as SessionRow | null;

  const { count: totalLotsCount } = await supabaseServer.rpc(
    "stock_pf_lot_balances",
    {},
    { count: "exact", head: true }
  );

  // Numero "Inventaire N" = rang chronologique de creation (pas l'id brut,
  // qui a des trous des qu'une session est supprimee de l'historique) -
  // meme principe que cote MP.
  const { data: allSessionsData } = await supabaseServer
    .from("inventaire_pf_sessions")
    .select("id")
    .order("created_at", { ascending: true });
  const rankById = new Map<number, number>(
    ((allSessionsData as { id: number }[] | null) ?? []).map((s, i) => [s.id, i + 1])
  );

  if (!activeSession) {
    const { data: historyData } = await supabaseServer
      .from("inventaire_pf_sessions")
      .select("id, statut, taille_lot, cree_par, created_at, termine_at")
      .in("statut", ["termine", "annule"])
      .order("termine_at", { ascending: false })
      .limit(20);
    const history = (historyData as SessionRow[] | null) ?? [];

    const historyIds = history.map((s) => s.id);
    const statsBySession = new Map<number, { total: number; bon: number; ecarts: number }>();
    if (historyIds.length > 0) {
      const { data: lignesHistData } = await supabaseServer
        .from("inventaire_pf_lignes")
        .select("session_id, statut")
        .in("session_id", historyIds);
      for (const row of (lignesHistData as { session_id: number; statut: string }[] | null) ?? []) {
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
                <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Inventaire PF</h1>
                <p className="mt-2 text-sm text-slate-600">
                  Comptage physique du stock produit fini, lot par lot, en aveugle. {totalLotsCount ?? 0} lot(s) au
                  total en stock actuellement.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <BackButton href="/gestion-stock-pf" label="Retour" />
                <RefreshButton />
              </div>
            </div>
          </section>

          {peutDemarrer ? (
            <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <h2 className="text-lg font-bold text-slate-900">Nouvel inventaire</h2>
              <p className="mt-1 text-sm text-slate-600">
                Choisis combien de lots te donner a la fois. Les articles qui bougent le plus seront distribues en
                premier. Une fois un lot de travail entierement compte, le suivant arrive automatiquement.
              </p>
              <form action={demarrerInventairePfAction} className="mt-4 flex flex-wrap items-end gap-3">
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
                <button
                  type="submit"
                  className="rounded-full bg-emerald-600 px-5 py-2 text-[15px] font-semibold text-white shadow-sm transition hover:opacity-90"
                >
                  Commencer
                </button>
              </form>
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
                      <Link href={`/stock/inventaire/${s.id}`} className="flex-1 hover:opacity-80">
                        <p className="font-semibold text-sky-700 underline">Inventaire {rankById.get(s.id) ?? s.id}</p>
                        <p className="text-slate-500">
                          Ouvert le {formatDateTime(s.created_at)} - {s.statut === "annule" ? "Annule" : "Termine"} le{" "}
                          {formatDateTime(s.termine_at)}
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
                      {peutDemarrer ? (
                        <form action={supprimerSessionInventairePfAction}>
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

  const { data: lignesData } = await supabaseServer
    .from("inventaire_pf_lignes")
    .select(
      "id, article_id, numero_lot, lot_numero, stock_systeme, compte_1, compte_2, compte_3, nombre_comptages, statut, regularise_par"
    )
    .eq("session_id", activeSession.id)
    .order("lot_numero", { ascending: true })
    .order("id", { ascending: true });
  const lignes = (lignesData as LigneRow[] | null) ?? [];

  const articleIds = [...new Set(lignes.map((l) => l.article_id))];
  const { data: articlesData } = articleIds.length
    ? await supabaseServer.from("articles").select("id, nom_article").in("id", articleIds)
    : { data: [] };
  const articleById = new Map(
    ((articlesData as { id: number; nom_article: string }[] | null) ?? []).map((a) => [a.id, a.nom_article])
  );

  const maxLotNumero = lignes.reduce((max, l) => Math.max(max, l.lot_numero), 0);
  const currentBatch = lignes.filter((l) => l.lot_numero === maxLotNumero);
  const pendingInBatch = currentBatch.filter((l) => l.statut === "a_compter");
  const doneInBatch = currentBatch.filter((l) => l.statut !== "a_compter");

  const ecartsAConfirmer = lignes.filter((l) => l.statut === "ecart_confirme");

  const totalBon = lignes.filter((l) => l.statut === "bon").length;
  const totalEcarts = lignes.filter((l) => l.statut === "ecart_confirme" || l.statut === "regularise").length;
  const pendingTotal = lignes.filter((l) => l.statut === "a_compter").length;
  const totalCompte = lignes.length - pendingTotal;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f0fdf4_0%,#fbfffc_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Inventaire {rankById.get(activeSession.id) ?? activeSession.id} en cours
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Ouvert le {formatDateTime(activeSession.created_at)} par {activeSession.cree_par || "-"}. Lots de{" "}
                {activeSession.taille_lot}.
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-700">
                {totalCompte} compte(s) sur {lignes.length} assigne(s) ({totalLotsCount ?? 0} au total) -{" "}
                {totalBon} bon(s), {totalEcarts} ecart(s)
                {pendingTotal > 0 ? ` - ${pendingTotal} restant(s) a compter` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <BackButton href="/gestion-stock-pf" label="Retour" />
              <RefreshButton />
              {peutDemarrer ? (
                <form action={annulerInventairePfAction}>
                  <input type="hidden" name="session_id" value={activeSession.id} />
                  <AnnulerInventaireButton />
                </form>
              ) : null}
            </div>
          </div>
        </section>

        {!peutCompter ? (
          <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-6 text-center shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-semibold text-amber-800">
              Tu n&apos;as pas l&apos;autorisation de saisir un comptage physique sur l&apos;inventaire PF.
            </p>
          </section>
        ) : pendingInBatch.length > 0 ? (
          <section className="rounded-[1.75rem] border border-emerald-200 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-lg font-bold text-slate-900">A compter ({pendingInBatch.length})</h2>
            <p className="mt-1 text-sm text-slate-600">
              Compte physiquement chaque lot ci-dessous et rentre la quantite trouvee - le stock systeme n&apos;est
              pas affiche pour un comptage a l&apos;aveugle.
            </p>
            <form action={soumettreComptagePfAction} autoComplete="off" className="mt-4 space-y-4">
              <input type="hidden" name="session_id" value={activeSession.id} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {pendingInBatch.map((ligne) => {
                  const nomArticle = articleById.get(ligne.article_id);
                  return (
                    <div key={ligne.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 p-3">
                      <input type="hidden" name="ligne_id" value={ligne.id} />
                      <div>
                        <p className="font-semibold text-slate-900">
                          {nomArticle || `Article #${ligne.article_id}`}
                        </p>
                        <p className="text-xs text-slate-500">
                          Lot {ligne.numero_lot} - {attemptLabel(ligne.nombre_comptages)}
                        </p>
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        name={`compte_${ligne.id}`}
                        autoComplete="off"
                        placeholder="Qte comptee"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  );
                })}
              </div>
              <button
                type="submit"
                className="rounded-full bg-emerald-600 px-5 py-2.5 text-[15px] font-semibold text-white shadow-sm transition hover:opacity-90"
              >
                Valider ce lot ({pendingInBatch.length})
              </button>
            </form>
          </section>
        ) : (
          <section className="rounded-[1.75rem] border border-emerald-200 bg-emerald-50 p-6 text-center shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-semibold text-emerald-800">
              Tout est compte pour le moment - actualise pour recevoir le prochain lot, ou tout le stock est deja
              couvert.
            </p>
          </section>
        )}

        {doneInBatch.length > 0 ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-lg font-bold text-slate-900">Deja traites dans ce lot de travail</h2>
            <ul className="mt-3 divide-y divide-slate-100">
              {doneInBatch.map((ligne) => {
                const nomArticle = articleById.get(ligne.article_id);
                return (
                  <li key={ligne.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div>
                      <p className="font-medium text-slate-800">{nomArticle || `Article #${ligne.article_id}`}</p>
                      <p className="text-xs text-slate-500">Lot {ligne.numero_lot}</p>
                    </div>
                    <StatutBadge statut={ligne.statut} />
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {ecartsAConfirmer.length > 0 ? (
          <section className="rounded-[1.75rem] border border-red-200 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-lg font-bold text-red-800">
              Ecarts confirmes a regulariser ({ecartsAConfirmer.length})
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              3 comptages discordants - le dernier comptage est retenu. Regulariser cree un mouvement de correction
              sur ce lot.
            </p>
            <ul className="mt-3 divide-y divide-slate-100">
              {ecartsAConfirmer.map((ligne) => {
                const nomArticle = articleById.get(ligne.article_id);
                const dernierComptage = ligne.compte_3 ?? ligne.compte_2 ?? ligne.compte_1 ?? 0;
                const ecart = dernierComptage - ligne.stock_systeme;
                return (
                  <li key={ligne.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="font-semibold text-slate-900">{nomArticle || `Article #${ligne.article_id}`}</p>
                      <p className="text-xs text-slate-500">
                        Lot {ligne.numero_lot} - Systeme: {formatNumber(ligne.stock_systeme)} - Compte:{" "}
                        {formatNumber(dernierComptage)} -{" "}
                        <span className={ecart < 0 ? "font-semibold text-red-700" : "font-semibold text-emerald-700"}>
                          Ecart {ecart > 0 ? "+" : ""}
                          {formatNumber(ecart)}
                        </span>
                      </p>
                    </div>
                    {peutRegulariser ? (
                      <form action={regulariserLignePfAction}>
                        <input type="hidden" name="ligne_id" value={ligne.id} />
                        <button
                          type="submit"
                          className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
                        >
                          Regulariser le stock
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs font-semibold text-slate-400">
                        Autorisation regularisation requise
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
