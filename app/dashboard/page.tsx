import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { formatDate } from "@/lib/format-date";

type StockSummaryRow = {
  article_id: number;
  nom_article: string;
  type_article: string | null;
  marque: string | null;
  gamme: string | null;
  stock_total: number;
  stock_2_mois: number;
  stock_4_mois: number;
  stock_6_mois: number;
};

type ReservedArticleRow = {
  quantite_chargee: number;
  article_id: number | null;
  commandes?: {
    statut: string;
  } | null;
};

type DormantRow = {
  lot_stock_id: number;
  nom_article: string;
  numero_lot: string;
  stock_restant: number;
  date_fabrication: string;
  couleur: string | null;
  priorite: number;
};

type CommandeRow = {
  id: number;
  numero_proforma: string;
  client: string;
  statut: string;
  commentaire: string | null;
  commande_lignes:
    | {
        quantite_demandee: number;
      }[]
    | null;
};

function colorClasses(couleur: string | null) {
  switch (couleur) {
    case "ROUGE":
      return "bg-red-50 text-red-800 ring-1 ring-red-200";
    case "ORANGE":
      return "bg-orange-50 text-orange-800 ring-1 ring-orange-200";
    case "JAUNE":
      return "bg-amber-50 text-amber-900 ring-1 ring-amber-200";
    default:
      return "bg-slate-50 text-slate-700 ring-1 ring-slate-200";
  }
}

export default async function DashboardPage() {
  const [
    { count: articlesCount },
    { count: lotsCount },
    { data: stockRows, error: stockError },
    { data: reservedRows, error: reservedError },
    { data: dormantRows, error: dormantError },
    { data: commandesRows, error: commandesError },
  ] = await Promise.all([
    supabaseServer.from("articles").select("id", { count: "exact", head: true }),
    supabaseServer
      .from("lots_stock")
      .select("id", { count: "exact", head: true })
      .gt("stock_restant", 0),
    supabaseServer
      .from("v_stock_article")
      .select(
        "article_id, nom_article, type_article, marque, gamme, stock_total, stock_2_mois, stock_4_mois, stock_6_mois"
      )
      .order("nom_article", { ascending: true }),
    supabaseServer
      .from("fifo_resultats")
      .select("article_id, quantite_chargee, commandes!inner(statut)")
      .neq("commandes.statut", "LIVREE"),
    supabaseServer
      .from("v_stock_dormant")
      .select(
        "lot_stock_id, nom_article, numero_lot, stock_restant, date_fabrication, couleur, priorite"
      )
      .gt("priorite", 0)
      .order("priorite", { ascending: false })
      .order("date_fabrication", { ascending: true })
      .limit(12),
    supabaseServer
      .from("commandes")
      .select(
        "id, numero_proforma, client, statut, commentaire, commande_lignes(quantite_demandee)"
      )
      .order("id", { ascending: false })
      .limit(12),
  ]);

  const effectiveError = stockError ?? reservedError ?? dormantError ?? commandesError;
  const stockData = (stockRows as StockSummaryRow[] | null) ?? [];
  const reservations = (reservedRows as ReservedArticleRow[] | null) ?? [];
  const dormantData = (dormantRows as DormantRow[] | null) ?? [];
  const commandes = (commandesRows as CommandeRow[] | null) ?? [];

  const reservedByArticle = new Map<number, number>();
  for (const row of reservations) {
    if (!row.article_id) continue;
    reservedByArticle.set(
      row.article_id,
      (reservedByArticle.get(row.article_id) ?? 0) + Number(row.quantite_chargee ?? 0)
    );
  }

  const stockFaible = stockData
    .map((row) => {
      const reserved = Number(reservedByArticle.get(row.article_id) ?? 0);
      const disponible = Math.max(0, Number(row.stock_total ?? 0) - reserved);
      return {
        ...row,
        disponible,
      };
    })
    .filter((row) => row.disponible <= 0 || row.disponible <= 100)
    .sort((a, b) => a.disponible - b.disponible)
    .slice(0, 12);

  const totalReserved = reservations.reduce(
    (sum, row) => sum + Number(row.quantite_chargee ?? 0),
    0
  );
  const dormantRouge = dormantData.filter((row) => row.couleur === "ROUGE").length;
  const dormantOrange = dormantData.filter((row) => row.couleur === "ORANGE").length;
  const dormantJaune = dormantData.filter((row) => row.couleur === "JAUNE").length;
  const dormantStockVisible = dormantData.reduce(
    (sum, row) => sum + Number(row.stock_restant ?? 0),
    0
  );
  const topStockAlert = stockFaible[0] ?? null;
  const topDormantAlert = dormantData[0] ?? null;
  const topCommandeAlert =
    commandes.find((row) => row.statut === "FIFO_PARTIEL") ??
    commandes.find((row) => row.statut === "SAISIE_WEB") ??
    null;
  const dashboardNextStep =
    topCommandeAlert?.statut === "FIFO_PARTIEL"
      ? {
          title: "Finir une commande FIFO partielle",
          description:
            "Des lignes ne sont pas completement chargees. Controle la commande puis corrige le FIFO ou le stock.",
          href: "/commandes?statut=FIFO_PARTIEL",
          action: "Ouvrir les commandes partielles",
        }
      : topStockAlert
        ? {
            title: "Verifier les articles avec disponible faible",
            description:
              "Certains articles deviennent sensibles. Controle le stock, puis fais une entree si besoin.",
            href: "/stock",
            action: "Ouvrir le stock",
          }
        : {
            title: "Base prete pour les operations",
            description:
              "Tu peux saisir une commande, entrer du stock ou faire les sorties du jour.",
            href: "/operations",
            action: "Ouvrir le centre d'actions",
          };

  const commandesStats = commandes.reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.statut === "SAISIE_WEB") acc.saisie += 1;
      if (row.statut === "FIFO_CALCULE") acc.fifo += 1;
      if (row.statut === "FIFO_PARTIEL") acc.partiel += 1;
      if (row.statut === "LIVREE") acc.livree += 1;
      return acc;
    },
    { total: 0, saisie: 0, fifo: 0, partiel: 0, livree: 0 }
  );

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f3f8ff_0%,#fbfdff_42%,#fffefb_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Dashboard
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
              Vue centrale avec alertes stock, stock dormant, reservations et commandes web.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <BackButton href="/" label="Retour accueil" />
            <Link
              href="/admin"
              className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Administration
            </Link>
          </div>
        </div>

        {effectiveError ? (
          <section className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {effectiveError.message}
            </p>
          </section>
        ) : (
          <>
            <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
              <article className="rounded-[2rem] border border-slate-900 bg-slate-950 p-6 text-white shadow-[0_20px_60px_rgba(15,23,42,0.22)]">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-300">
                  Que faire en premier
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-tight text-white">
                  {dashboardNextStep.title}
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                  {dashboardNextStep.description}
                </p>
                <Link
                  href={dashboardNextStep.href}
                  className="mt-5 inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
                >
                  {dashboardNextStep.action}
                </Link>
              </article>

              <article className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Raccourcis chef
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Link
                    href="/mouvements/produit-fini#entree-stock"
                    className="rounded-[1.3rem] bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100"
                  >
                    Entrer stock
                  </Link>
                  <Link
                    href="/mouvements/produit-fini#sortie-stock"
                    className="rounded-[1.3rem] bg-sky-50 px-4 py-4 text-sm font-semibold text-sky-900 transition hover:bg-sky-100"
                  >
                    Sortir stock
                  </Link>
                  <Link
                    href="/commandes#nouvelle-commande"
                    className="rounded-[1.3rem] bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
                  >
                    Creer commande
                  </Link>
                  <Link
                    href="/fifo"
                    className="rounded-[1.3rem] bg-fuchsia-50 px-4 py-4 text-sm font-semibold text-fuchsia-900 transition hover:bg-fuchsia-100"
                  >
                    Verifier FIFO
                  </Link>
                </div>
              </article>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
              <Link
                href="/mouvements/produit-fini#entree-stock"
                className="rounded-[1.75rem] border border-emerald-200 bg-emerald-50 p-5 shadow-[0_18px_40px_rgba(16,185,129,0.08)] transition hover:bg-emerald-100"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Action
                </p>
                <h2 className="mt-2 text-2xl font-black text-emerald-950">Entree stock</h2>
                <p className="mt-2 text-sm leading-6 text-emerald-900/80">
                  Ajouter un nouveau lot avec date, chambre, pays et quantite.
                </p>
              </Link>
              <Link
                href="/mouvements/produit-fini#sortie-stock"
                className="rounded-[1.75rem] border border-sky-200 bg-sky-50 p-5 shadow-[0_18px_40px_rgba(14,165,233,0.08)] transition hover:bg-sky-100"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
                  Action
                </p>
                <h2 className="mt-2 text-2xl font-black text-sky-950">Sortie stock</h2>
                <p className="mt-2 text-sm leading-6 text-sky-900/80">
                  Enregistrer une sortie sur un lot existant selon le disponible reel.
                </p>
              </Link>
              <Link
                href="/commandes#nouvelle-commande"
                className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-5 shadow-[0_18px_40px_rgba(245,158,11,0.08)] transition hover:bg-amber-100"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
                  Action
                </p>
                <h2 className="mt-2 text-2xl font-black text-amber-950">Nouvelle commande</h2>
                <p className="mt-2 text-sm leading-6 text-amber-900/80">
                  Saisir la commande, calculer le FIFO puis suivre le reste a charger.
                </p>
              </Link>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <p className="text-sm uppercase tracking-[0.16em] text-slate-500">Articles</p>
                <p className="mt-3 text-3xl font-black text-slate-900">{articlesCount ?? 0}</p>
              </div>
              <div className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <p className="text-sm uppercase tracking-[0.16em] text-slate-500">Lots en stock</p>
                <p className="mt-3 text-3xl font-black text-slate-900">{lotsCount ?? 0}</p>
              </div>
              <div className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <p className="text-sm uppercase tracking-[0.16em] text-slate-500">Reserve</p>
                <p className="mt-3 text-3xl font-black text-amber-700">{totalReserved}</p>
              </div>
              <div className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <p className="text-sm uppercase tracking-[0.16em] text-slate-500">Commandes web</p>
                <p className="mt-3 text-3xl font-black text-sky-700">{commandesStats.total}</p>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[1.75rem] border border-red-200 bg-red-50 p-6 shadow-[0_18px_40px_rgba(239,68,68,0.08)]">
                <p className="text-sm uppercase tracking-[0.16em] text-red-700">Dormant rouge</p>
                <p className="mt-3 text-3xl font-black text-red-900">{dormantRouge}</p>
              </div>
              <div className="rounded-[1.75rem] border border-orange-200 bg-orange-50 p-6 shadow-[0_18px_40px_rgba(249,115,22,0.08)]">
                <p className="text-sm uppercase tracking-[0.16em] text-orange-700">
                  Dormant orange
                </p>
                <p className="mt-3 text-3xl font-black text-orange-900">{dormantOrange}</p>
              </div>
              <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-6 shadow-[0_18px_40px_rgba(245,158,11,0.08)]">
                <p className="text-sm uppercase tracking-[0.16em] text-amber-700">Dormant jaune</p>
                <p className="mt-3 text-3xl font-black text-amber-900">{dormantJaune}</p>
              </div>
              <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
                <p className="text-sm uppercase tracking-[0.16em] text-slate-500">
                  Stock dormant visible
                </p>
                <p className="mt-3 text-3xl font-black text-slate-900">{dormantStockVisible}</p>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
              <article className="rounded-[2rem] border border-black/5 bg-slate-950 p-6 text-white shadow-[0_20px_60px_rgba(15,23,42,0.22)]">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-300">
                  Priorites du jour
                </p>
                <div className="mt-5 space-y-4 text-sm">
                  <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                    <p className="font-semibold text-white">1. Stock a verifier</p>
                    <p className="mt-1 text-slate-300">
                      {topStockAlert
                        ? `${topStockAlert.nom_article} avec disponible ${topStockAlert.disponible}.`
                        : "Aucune alerte stock faible pour le moment."}
                    </p>
                    <Link
                      href="/stock"
                      className="mt-3 inline-flex rounded-full bg-emerald-500 px-4 py-2 font-semibold text-emerald-950 transition hover:bg-emerald-400"
                    >
                      Ouvrir stock
                    </Link>
                  </div>

                  <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                    <p className="font-semibold text-white">2. Dormant a traiter</p>
                    <p className="mt-1 text-slate-300">
                      {topDormantAlert
                        ? `${topDormantAlert.nom_article} lot ${topDormantAlert.numero_lot} en ${topDormantAlert.couleur || "priorite"}.`
                        : "Aucun dormant urgent visible."}
                    </p>
                    <Link
                      href="/stock-dormant"
                      className="mt-3 inline-flex rounded-full bg-amber-400 px-4 py-2 font-semibold text-amber-950 transition hover:bg-amber-300"
                    >
                      Ouvrir dormant
                    </Link>
                  </div>

                  <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                    <p className="font-semibold text-white">3. Commande a finir</p>
                    <p className="mt-1 text-slate-300">
                      {topCommandeAlert
                        ? `${topCommandeAlert.numero_proforma} pour ${topCommandeAlert.client} en statut ${topCommandeAlert.statut}.`
                        : "Aucune commande en attente visible."}
                    </p>
                    <Link
                      href="/commandes"
                      className="mt-3 inline-flex rounded-full bg-sky-400 px-4 py-2 font-semibold text-sky-950 transition hover:bg-sky-300"
                    >
                      Ouvrir commandes
                    </Link>
                  </div>
                </div>
              </article>

              <article className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Raccourcis chef d&apos;atelier
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Link
                    href="/mouvements/produit-fini#entree-stock"
                    className="rounded-[1.4rem] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
                  >
                    Entrer du stock
                  </Link>
                  <Link
                    href="/mouvements/produit-fini#sortie-stock"
                    className="rounded-[1.4rem] border border-sky-200 bg-sky-50 px-4 py-4 text-sm font-semibold text-sky-950 transition hover:bg-sky-100"
                  >
                    Sortir du stock
                  </Link>
                  <Link
                    href="/commandes#nouvelle-commande"
                    className="rounded-[1.4rem] border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-950 transition hover:bg-amber-100"
                  >
                    Creer commande
                  </Link>
                  <Link
                    href="/fifo"
                    className="rounded-[1.4rem] border border-fuchsia-200 bg-fuchsia-50 px-4 py-4 text-sm font-semibold text-fuchsia-950 transition hover:bg-fuchsia-100"
                  >
                    Controler FIFO
                  </Link>
                  <Link
                    href="/stock-dormant-sans-commande"
                    className="rounded-[1.4rem] border border-orange-200 bg-orange-50 px-4 py-4 text-sm font-semibold text-orange-950 transition hover:bg-orange-100"
                  >
                    Dormant sans commande
                  </Link>
                  <Link
                    href="/operations"
                    className="rounded-[1.4rem] border border-rose-200 bg-rose-50 px-4 py-4 text-sm font-semibold text-rose-950 transition hover:bg-rose-100"
                  >
                    Centre d&apos;actions
                  </Link>
                </div>
              </article>
            </section>

            <section className="grid gap-4 md:grid-cols-4">
              <Link
                href="/admin"
                className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.06)] transition hover:bg-amber-100"
              >
                1. Mettre a jour la base
              </Link>
              <Link
                href="/stock"
                className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-950 shadow-[0_12px_30px_rgba(16,185,129,0.06)] transition hover:bg-emerald-100"
              >
                2. Verifier le stock
              </Link>
              <Link
                href="/commandes?statut=FIFO_PARTIEL"
                className="rounded-[1.5rem] border border-sky-200 bg-sky-50 px-5 py-4 text-sm font-semibold text-sky-950 shadow-[0_12px_30px_rgba(14,165,233,0.06)] transition hover:bg-sky-100"
              >
                3. Voir FIFO partiel
              </Link>
              <Link
                href="/stock-dormant"
                className="rounded-[1.5rem] border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-950 shadow-[0_12px_30px_rgba(239,68,68,0.06)] transition hover:bg-red-100"
              >
                4. Traiter le dormant
              </Link>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              <article className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                  <div>
                    <h2 className="text-xl font-bold">Alertes stock faible</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Articles avec disponible tres faible ou nul apres reservations.
                    </p>
                  </div>
                  <Link
                    href="/stock"
                    className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                  >
                    Voir stock
                  </Link>
                </div>

                {stockFaible.length === 0 ? (
                  <div className="px-6 py-8 text-sm text-slate-500">
                    Aucune alerte de stock faible.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-6 py-4 font-semibold">Article</th>
                          <th className="px-6 py-4 font-semibold">Type</th>
                          <th className="px-6 py-4 font-semibold">Marque</th>
                          <th className="px-6 py-4 font-semibold">Disponible</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stockFaible.map((row) => (
                          <tr key={row.article_id} className="border-t border-slate-100">
                            <td className="px-6 py-4 font-medium text-slate-900">
                              {row.nom_article}
                            </td>
                            <td className="px-6 py-4 text-slate-600">{row.type_article || "-"}</td>
                            <td className="px-6 py-4 text-slate-600">{row.marque || "-"}</td>
                            <td className="px-6 py-4 font-semibold text-red-700">
                              {row.disponible}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>

              <article className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                  <div>
                    <h2 className="text-xl font-bold">Etat commandes web</h2>
                    <p className="mt-1 text-sm text-slate-500">Suivi rapide des statuts.</p>
                  </div>
                  <Link
                    href="/commandes"
                    className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                  >
                    Voir commandes
                  </Link>
                </div>

                <div className="grid gap-3 px-6 py-6">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                    En saisie web : <span className="font-bold text-slate-900">{commandesStats.saisie}</span>
                  </div>
                  <div className="rounded-2xl bg-fuchsia-50 px-4 py-3 text-sm">
                    FIFO calcule : <span className="font-bold text-fuchsia-800">{commandesStats.fifo}</span>
                  </div>
                  <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm">
                    FIFO partiel : <span className="font-bold text-amber-800">{commandesStats.partiel}</span>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm">
                    Livrees : <span className="font-bold text-emerald-800">{commandesStats.livree}</span>
                  </div>
                </div>

                <div className="border-t border-slate-100 px-6 py-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Aller plus vite
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Link
                      href="/commandes#nouvelle-commande"
                      className="rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-600"
                    >
                      Creer commande
                    </Link>
                    <Link
                      href="/commandes?statut=SAISIE_WEB"
                      className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
                    >
                      Voir saisie web
                    </Link>
                    <Link
                      href="/commandes?statut=FIFO_PARTIEL"
                      className="rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-200"
                    >
                      Voir FIFO partiel
                    </Link>
                    <Link
                      href="/commandes?statut=LIVREE"
                      className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-200"
                    >
                      Voir livrees
                    </Link>
                  </div>
                </div>
              </article>
            </section>

            <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <article className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                  <div>
                    <h2 className="text-xl font-bold">Stock dormant urgent</h2>
                    <p className="mt-1 text-sm text-slate-500">Lots dormants prioritaires.</p>
                  </div>
                  <Link
                    href="/stock-dormant"
                    className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                  >
                    Voir dormant
                  </Link>
                </div>

                <div className="space-y-3 px-6 py-6">
                  {dormantData.length === 0 ? (
                    <p className="text-sm text-slate-500">Aucun lot dormant prioritaire.</p>
                  ) : (
                    dormantData.map((row) => (
                      <div
                        key={row.lot_stock_id}
                        className="rounded-[1.5rem] border border-slate-100 bg-slate-50/70 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="font-semibold text-slate-900">{row.nom_article}</p>
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] ${colorClasses(
                              row.couleur
                            )}`}
                          >
                            {row.couleur || "-"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          Lot {row.numero_lot} | Date {formatDate(row.date_fabrication)}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-amber-700">
                          Stock restant : {row.stock_restant}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </article>

              <article className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                  <div>
                    <h2 className="text-xl font-bold">Dernieres commandes</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Apercu rapide des commandes creees dans la web.
                    </p>
                  </div>
                </div>

                {commandes.length === 0 ? (
                  <div className="px-6 py-8 text-sm text-slate-500">
                    Aucune commande web en base pour le moment.
                  </div>
                ) : (
                  <div className="space-y-3 px-6 py-6">
                    {commandes.map((commande) => {
                      const totalQuantite = (commande.commande_lignes ?? []).reduce(
                        (sum, line) => sum + Number(line.quantite_demandee ?? 0),
                        0
                      );

                      return (
                        <div
                          key={commande.id}
                          className="rounded-[1.5rem] border border-slate-100 bg-slate-50/70 p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="font-semibold text-slate-900">
                              {commande.numero_proforma}
                            </p>
                            <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white">
                              {commande.statut}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-slate-600">
                            Client : {commande.client}
                          </p>
                          <p className="mt-1 text-sm text-sky-700">
                            Quantite totale demandee : {totalQuantite}
                          </p>
                          {commande.commentaire ? (
                            <p className="mt-1 text-xs text-slate-500">{commande.commentaire}</p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

