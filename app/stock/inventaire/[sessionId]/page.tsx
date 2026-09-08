import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { formatDateTime } from "@/lib/format-date";

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
  statut: "a_compter" | "bon" | "ecart_confirme" | "regularise";
  compte_par: string | null;
  regularise_par: string | null;
};

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
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

export default async function InventairePfSessionDetailPage({ params }: { params: PageParams }) {
  noStore();
  const { sessionId: sessionIdParam } = await params;
  const sessionId = Number(sessionIdParam);

  const { data: sessionData } = await supabaseServer
    .from("inventaire_pf_sessions")
    .select("id, statut, taille_lot, cree_par, created_at, termine_at")
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
              <BackButton href="/stock/inventaire" label="Retour" />
            </div>
          </section>
        </div>
      </main>
    );
  }

  const { data: lignesData } = await supabaseServer
    .from("inventaire_pf_lignes")
    .select(
      "id, article_id, numero_lot, lot_numero, stock_systeme, compte_1, compte_2, compte_3, statut, compte_par, regularise_par"
    )
    .eq("session_id", sessionId)
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

  const totalBon = lignes.filter((l) => l.statut === "bon").length;
  const totalEcarts = lignes.filter((l) => l.statut === "ecart_confirme" || l.statut === "regularise").length;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f0fdf4_0%,#fbfffc_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Inventaire PF - Session #{session.id}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Demarree le {formatDateTime(session.created_at)} par {session.cree_par || "-"}. Lots de{" "}
                {session.taille_lot}.
                {session.termine_at
                  ? ` ${session.statut === "annule" ? "Annulee" : "Terminee"} le ${formatDateTime(session.termine_at)}.`
                  : ""}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-700">
                {lignes.length} lot(s) - {totalBon} bon(s), {totalEcarts} ecart(s)
              </p>
            </div>
            <BackButton href="/stock/inventaire" label="Retour" />
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
                  const nomArticle = articleById.get(ligne.article_id);
                  const dernierComptage = ligne.compte_3 ?? ligne.compte_2 ?? ligne.compte_1;
                  const ecart = dernierComptage !== null ? dernierComptage - ligne.stock_systeme : null;
                  return (
                    <tr key={ligne.id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {nomArticle || `Article #${ligne.article_id}`}
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
