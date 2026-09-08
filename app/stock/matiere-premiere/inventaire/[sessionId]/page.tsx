import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDateTime } from "@/lib/format-date";
import { AnnulerInventaireButton } from "@/app/_components/annuler-inventaire-button";
import { soumettreComptageAction, regulariserLigneAction, annulerInventaireMpAction } from "../actions";

type SessionRow = {
  id: number;
  statut: "en_cours" | "termine" | "annule";
  taille_lot: number;
  cree_par: string | null;
  created_at: string;
  termine_at: string | null;
  categories_filtre: string[] | null;
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
  compte_par: string | null;
  regularise_par: string | null;
};

type ArticleInfo = { nom_article: string; unite: string | null };

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

type PageParams = Promise<{ sessionId: string }>;

export default async function InventaireMpSessionPage({ params }: { params: PageParams }) {
  noStore();
  const { sessionId: sessionIdParam } = await params;
  const sessionId = Number(sessionIdParam);

  const { data: sessionData } = await supabaseServer
    .from("inventaire_mp_sessions")
    .select("id, statut, taille_lot, cree_par, created_at, termine_at, categories_filtre")
    .eq("id", sessionId)
    .maybeSingle();
  const session = sessionData as SessionRow | null;

  if (!session) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#f0fdf4_0%,#fbfffc_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm text-slate-600">Inventaire introuvable.</p>
            <div className="mt-4">
              <BackButton href="/stock/matiere-premiere/inventaire" label="Retour" />
            </div>
          </section>
        </div>
      </main>
    );
  }

  const { data: lignesData } = await supabaseServer
    .from("inventaire_mp_lignes")
    .select(
      "id, article_id, numero_lot, lot_numero, stock_systeme, compte_1, compte_2, compte_3, nombre_comptages, statut, compte_par, regularise_par"
    )
    .eq("session_id", sessionId)
    .order("lot_numero", { ascending: true })
    .order("id", { ascending: true });
  const lignes = (lignesData as LigneRow[] | null) ?? [];

  const articleIds = [...new Set(lignes.map((l) => l.article_id))];
  const { data: articlesData } = articleIds.length
    ? await supabaseServer.from("articles_matiere_premiere").select("id, nom_article, unite").in("id", articleIds)
    : { data: [] };
  const articleById = new Map(
    ((articlesData as { id: number; nom_article: string; unite: string | null }[] | null) ?? []).map((a) => [
      a.id,
      { nom_article: a.nom_article, unite: a.unite } as ArticleInfo,
    ])
  );

  const totalBon = lignes.filter((l) => l.statut === "bon").length;
  const totalEcarts = lignes.filter((l) => l.statut === "ecart_confirme" || l.statut === "regularise").length;

  const scopeLabel =
    session.categories_filtre && session.categories_filtre.length > 0
      ? session.categories_filtre.join(", ")
      : "tout le MP";

  // Sessions terminees/annulees : vue lecture seule (tableau complet), pas
  // de saisie possible.
  if (session.statut !== "en_cours") {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#f0fdf4_0%,#fbfffc_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
        <div className="mx-auto w-full space-y-6">
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">ERP Rodis</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                  Inventaire MP - Session #{session.id}
                </h1>
                <p className="mt-2 text-sm text-slate-600">
                  Perimetre : {scopeLabel}. Demarree le {formatDateTime(session.created_at)} par{" "}
                  {session.cree_par || "-"}. Lots de {session.taille_lot}.{" "}
                  {session.statut === "annule" ? "Annulee" : "Terminee"} le {formatDateTime(session.termine_at)}.
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-700">
                  {lignes.length} lot(s) - {totalBon} bon(s), {totalEcarts} ecart(s)
                </p>
              </div>
              <BackButton href="/stock/matiere-premiere/inventaire" label="Retour" />
            </div>
          </section>

          <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Article</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Lot</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Stock systeme</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Comptage 1</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Comptage 2</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Comptage 3</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Ecart</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Statut</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Compte par</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((ligne) => {
                    const article = articleById.get(ligne.article_id);
                    const dernierComptage = ligne.compte_3 ?? ligne.compte_2 ?? ligne.compte_1;
                    const ecart = dernierComptage !== null ? dernierComptage - ligne.stock_systeme : null;
                    return (
                      <tr key={ligne.id} className="border-t border-slate-100 align-top">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {article?.nom_article || `Article #${ligne.article_id}`}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{ligne.numero_lot}</td>
                        <td className="px-4 py-3 text-slate-600">{formatNumber(ligne.stock_systeme)}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {ligne.compte_1 !== null ? formatNumber(ligne.compte_1) : "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {ligne.compte_2 !== null ? formatNumber(ligne.compte_2) : "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {ligne.compte_3 !== null ? formatNumber(ligne.compte_3) : "-"}
                        </td>
                        <td className="px-4 py-3">
                          {ecart === null ? (
                            "-"
                          ) : (
                            <span
                              className={
                                ecart === 0
                                  ? "text-slate-500"
                                  : ecart < 0
                                    ? "font-semibold text-red-700"
                                    : "font-semibold text-emerald-700"
                              }
                            >
                              {ecart > 0 ? "+" : ""}
                              {formatNumber(ecart)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatutBadge statut={ligne.statut} />
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {ligne.regularise_par || ligne.compte_par || "-"}
                        </td>
                      </tr>
                    );
                  })}
                  {lignes.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">
                        Aucun lot dans cette session.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    );
  }

  // Session en cours : interface de comptage (identique a l'ancienne page
  // principale, deplacee ici pour qu'une session precise se compte via sa
  // propre URL - plusieurs sessions peuvent tourner en parallele).
  const maxLotNumero = lignes.reduce((max, l) => Math.max(max, l.lot_numero), 0);
  const currentBatch = lignes.filter((l) => l.lot_numero === maxLotNumero);
  const pendingInBatch = currentBatch.filter((l) => l.statut === "a_compter");
  const doneInBatch = currentBatch.filter((l) => l.statut !== "a_compter");
  const ecartsAConfirmer = lignes.filter((l) => l.statut === "ecart_confirme");

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f0fdf4_0%,#fbfffc_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Inventaire MP en cours - Session #{session.id}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Perimetre : {scopeLabel}. Demarree le {formatDateTime(session.created_at)} par{" "}
                {session.cree_par || "-"}. Lots de {session.taille_lot}.
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-700">
                {lignes.length} lot(s) traites - {totalBon} bon(s), {totalEcarts} ecart(s)
              </p>
            </div>
            <div className="flex items-center gap-3">
              <BackButton href="/stock/matiere-premiere/inventaire" label="Retour" />
              <RefreshButton />
              <form action={annulerInventaireMpAction}>
                <input type="hidden" name="session_id" value={session.id} />
                <AnnulerInventaireButton />
              </form>
            </div>
          </div>
        </section>

        {pendingInBatch.length > 0 ? (
          <section className="rounded-[1.75rem] border border-emerald-200 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-lg font-bold text-slate-900">A compter ({pendingInBatch.length})</h2>
            <p className="mt-1 text-sm text-slate-600">
              Compte physiquement chaque lot ci-dessous et rentre la quantite trouvee - le stock systeme n&apos;est
              pas affiche pour un comptage a l&apos;aveugle.
            </p>
            <form action={soumettreComptageAction} autoComplete="off" className="mt-4 space-y-4">
              <input type="hidden" name="session_id" value={session.id} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {pendingInBatch.map((ligne) => {
                  const article = articleById.get(ligne.article_id);
                  return (
                    <div key={ligne.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 p-3">
                      <input type="hidden" name="ligne_id" value={ligne.id} />
                      <div>
                        <p className="font-semibold text-slate-900">
                          {article?.nom_article || `Article #${ligne.article_id}`}
                        </p>
                        <p className="text-xs text-slate-500">
                          Lot {ligne.numero_lot} - {attemptLabel(ligne.nombre_comptages)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          name={`compte_${ligne.id}`}
                          autoComplete="off"
                          placeholder="Qte comptee"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                        <span className="text-sm text-slate-500">{article?.unite || ""}</span>
                      </div>
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
              Tout est compte pour le moment - actualise pour recevoir le prochain lot, ou tout le perimetre de
              cette session est deja couvert.
            </p>
          </section>
        )}

        {doneInBatch.length > 0 ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-lg font-bold text-slate-900">Deja traites dans ce lot de travail</h2>
            <ul className="mt-3 divide-y divide-slate-100">
              {doneInBatch.map((ligne) => {
                const article = articleById.get(ligne.article_id);
                return (
                  <li key={ligne.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div>
                      <p className="font-medium text-slate-800">{article?.nom_article || `Article #${ligne.article_id}`}</p>
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
                const article = articleById.get(ligne.article_id);
                const dernierComptage = ligne.compte_3 ?? ligne.compte_2 ?? ligne.compte_1 ?? 0;
                const ecart = dernierComptage - ligne.stock_systeme;
                return (
                  <li key={ligne.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="font-semibold text-slate-900">{article?.nom_article || `Article #${ligne.article_id}`}</p>
                      <p className="text-xs text-slate-500">
                        Lot {ligne.numero_lot} - Systeme: {formatNumber(ligne.stock_systeme)} - Compte:{" "}
                        {formatNumber(dernierComptage)} -{" "}
                        <span className={ecart < 0 ? "font-semibold text-red-700" : "font-semibold text-emerald-700"}>
                          Ecart {ecart > 0 ? "+" : ""}
                          {formatNumber(ecart)}
                        </span>
                      </p>
                    </div>
                    <form action={regulariserLigneAction}>
                      <input type="hidden" name="ligne_id" value={ligne.id} />
                      <button
                        type="submit"
                        className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
                      >
                        Regulariser le stock
                      </button>
                    </form>
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
