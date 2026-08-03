import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";

export default async function OperationsPage() {
  const [
    { count: articlesCount },
    { count: lotsCount },
    { count: commandesCount },
    { count: fifoCount },
    { count: dormantCount },
    { count: fifoPartielCount },
  ] = await Promise.all([
    supabaseServer.from("articles").select("id", { count: "exact", head: true }),
    supabaseServer
      .from("lots_stock")
      .select("id", { count: "exact", head: true })
      .gt("stock_restant", 0),
    supabaseServer.from("commandes").select("id", { count: "exact", head: true }),
    supabaseServer.from("fifo_resultats").select("id", { count: "exact", head: true }),
    supabaseServer
      .from("v_stock_dormant")
      .select("lot_stock_id", { count: "exact", head: true })
      .gt("priorite", 0),
    supabaseServer
      .from("commandes")
      .select("id", { count: "exact", head: true })
      .eq("statut", "FIFO_PARTIEL"),
  ]);

  const priorityLabel =
    (fifoPartielCount ?? 0) > 0
      ? `${fifoPartielCount ?? 0} commande(s) FIFO partiel a traiter`
      : (dormantCount ?? 0) > 0
        ? `${dormantCount ?? 0} lot(s) dormant(s) a surveiller`
        : "Flux principal pret pour la saisie et le controle";

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f0f8ff_0%,#fbfdff_48%,#fffdf8_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Centre d&apos;actions
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
              Page centrale pour travailler vite dans la web sans chercher dans les menus.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <BackButton href="/" label="Retour accueil" />
            <RefreshButton />
            <Link
              href="/dashboard"
              className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Ouvrir dashboard
            </Link>
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm uppercase tracking-[0.16em] text-slate-500">Articles</p>
            <p className="mt-3 text-3xl font-black text-slate-900">{articlesCount ?? 0}</p>
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm uppercase tracking-[0.16em] text-slate-500">Lots stock</p>
            <p className="mt-3 text-3xl font-black text-emerald-700">{lotsCount ?? 0}</p>
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm uppercase tracking-[0.16em] text-slate-500">Commandes</p>
            <p className="mt-3 text-3xl font-black text-sky-700">{commandesCount ?? 0}</p>
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm uppercase tracking-[0.16em] text-slate-500">FIFO partiel</p>
            <p className="mt-3 text-3xl font-black text-amber-700">{fifoPartielCount ?? 0}</p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-[2rem] border border-black/5 bg-slate-950 p-6 text-white shadow-[0_20px_60px_rgba(15,23,42,0.22)]">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-300">
              Priorite immediate
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-white">
              {priorityLabel}
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              Commence ici puis avance dans l&apos;ordre avec les raccourcis les plus utiles.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
              >
                Ouvrir dashboard
              </Link>
              <Link
                href="/commandes?statut=FIFO_PARTIEL"
                className="rounded-full bg-fuchsia-400 px-5 py-3 text-sm font-semibold text-fuchsia-950 transition hover:bg-fuchsia-300"
              >
                Voir FIFO partiel
              </Link>
              <Link
                href="/stock-dormant"
                className="rounded-full bg-amber-400 px-5 py-3 text-sm font-semibold text-amber-950 transition hover:bg-amber-300"
              >
                Voir dormant
              </Link>
            </div>
          </article>

          <article className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-900">Raccourcis du jour</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <div className="rounded-2xl bg-amber-50 px-4 py-3">
                <p className="font-semibold text-amber-900">1. Mettre a jour la base</p>
                <p className="mt-1">Passe par `Admin` si les donnees Excel ont change.</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                <p className="font-semibold text-emerald-900">2. Verifier le stock</p>
                <p className="mt-1">Controle les disponibles, chambres et reservations.</p>
              </div>
              <div className="rounded-2xl bg-sky-50 px-4 py-3">
                <p className="font-semibold text-sky-900">3. Creer ou finir une commande</p>
                <p className="mt-1">Saisie commande, calcul FIFO puis livraison.</p>
              </div>
              <div className="rounded-2xl bg-red-50 px-4 py-3">
                <p className="font-semibold text-red-900">4. Surveiller le dormant</p>
                <p className="mt-1">Traite les rouges, puis oranges, puis jaunes.</p>
              </div>
            </div>
          </article>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <Link
            href="/admin"
            className="rounded-[1.6rem] border border-amber-200 bg-amber-50 p-5 shadow-[0_14px_35px_rgba(245,158,11,0.08)] transition hover:bg-amber-100"
          >
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
              Etape 1
            </p>
            <h2 className="mt-2 text-2xl font-black text-amber-950">Mettre a jour</h2>
            <p className="mt-2 text-sm leading-6 text-amber-900/80">
              Recharger `Articles` puis `Stock`.
            </p>
          </Link>
          <Link
            href="/stock"
            className="rounded-[1.6rem] border border-emerald-200 bg-emerald-50 p-5 shadow-[0_14px_35px_rgba(16,185,129,0.08)] transition hover:bg-emerald-100"
          >
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Etape 2
            </p>
            <h2 className="mt-2 text-2xl font-black text-emerald-950">Verifier stock</h2>
            <p className="mt-2 text-sm leading-6 text-emerald-900/80">
              Controler disponible, chambres et pays.
            </p>
          </Link>
          <Link
            href="/commandes#nouvelle-commande"
            className="rounded-[1.6rem] border border-sky-200 bg-sky-50 p-5 shadow-[0_14px_35px_rgba(14,165,233,0.08)] transition hover:bg-sky-100"
          >
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              Etape 3
            </p>
            <h2 className="mt-2 text-2xl font-black text-sky-950">Saisir commande</h2>
            <p className="mt-2 text-sm leading-6 text-sky-900/80">
              Creer une commande puis la calculer.
            </p>
          </Link>
          <Link
            href="/fifo"
            className="rounded-[1.6rem] border border-fuchsia-200 bg-fuchsia-50 p-5 shadow-[0_14px_35px_rgba(168,85,247,0.08)] transition hover:bg-fuchsia-100"
          >
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-fuchsia-700">
              Etape 4
            </p>
            <h2 className="mt-2 text-2xl font-black text-fuchsia-950">Controler FIFO</h2>
            <p className="mt-2 text-sm leading-6 text-fuchsia-900/80">
              Verifier codes, dates et quantites chargees.
            </p>
          </Link>
        </section>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Je veux faire quoi
            </p>
            <h2 className="text-2xl font-black tracking-tight text-slate-900">
              Acces direct aux vraies actions
            </h2>
            <p className="text-sm leading-6 text-slate-600">
              Clique sur l&apos;action que tu veux faire maintenant. Chaque bouton
              ouvre directement le bon formulaire.
            </p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Link
              href="/mouvements/produit-fini#entree-stock"
              className="rounded-[1.7rem] border border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5_0%,#d1fae5_100%)] p-5 shadow-[0_14px_35px_rgba(16,185,129,0.1)] transition hover:-translate-y-0.5 hover:bg-emerald-50"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
                1. Entree
              </p>
              <h3 className="mt-2 text-2xl font-black text-emerald-950">Entrer stock</h3>
              <p className="mt-2 text-sm leading-6 text-emerald-900/80">
                Ajouter un lot, une date, une chambre, un code pays et une quantite.
              </p>
            </Link>

            <Link
              href="/mouvements/produit-fini#sortie-stock"
              className="rounded-[1.7rem] border border-sky-200 bg-[linear-gradient(135deg,#eff6ff_0%,#dbeafe_100%)] p-5 shadow-[0_14px_35px_rgba(14,165,233,0.1)] transition hover:-translate-y-0.5 hover:bg-sky-50"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
                2. Sortie
              </p>
              <h3 className="mt-2 text-2xl font-black text-sky-950">Sortir stock</h3>
              <p className="mt-2 text-sm leading-6 text-sky-900/80">
                Choisir un lot existant et sortir une quantite en gardant le bon stock.
              </p>
            </Link>

            <Link
              href="/commandes#nouvelle-commande"
              className="rounded-[1.7rem] border border-amber-200 bg-[linear-gradient(135deg,#fff7ed_0%,#ffedd5_100%)] p-5 shadow-[0_14px_35px_rgba(245,158,11,0.1)] transition hover:-translate-y-0.5 hover:bg-amber-50"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
                3. Commande
              </p>
              <h3 className="mt-2 text-2xl font-black text-amber-950">Creer commande</h3>
              <p className="mt-2 text-sm leading-6 text-amber-900/80">
                Saisir le client, la proforma et les lignes a charger directement sur le web.
              </p>
            </Link>

            <Link
              href="/fifo"
              className="rounded-[1.7rem] border border-fuchsia-200 bg-[linear-gradient(135deg,#faf5ff_0%,#f5d0fe_100%)] p-5 shadow-[0_14px_35px_rgba(168,85,247,0.1)] transition hover:-translate-y-0.5 hover:bg-fuchsia-50"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-fuchsia-700">
                4. Controle
              </p>
              <h3 className="mt-2 text-2xl font-black text-fuchsia-950">Voir FIFO</h3>
              <p className="mt-2 text-sm leading-6 text-fuchsia-900/80">
                Verifier les codes pris, les dates choisies, les chambres et les quantites.
              </p>
            </Link>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-900">Saisie directe</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Ouvre directement les formulaires les plus utilises au quotidien.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Link
                href="/mouvements/produit-fini#entree-stock"
                className="rounded-[1.4rem] bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100"
              >
                Entrer stock
              </Link>
              <Link
                href="/mouvements/produit-fini#sortie-stock"
                className="rounded-[1.4rem] bg-sky-50 px-4 py-4 text-sm font-semibold text-sky-900 transition hover:bg-sky-100"
              >
                Sortir stock
              </Link>
              <Link
                href="/articles/produit-fini"
                className="rounded-[1.4rem] bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
              >
                Ajouter / controler article
              </Link>
              <Link
                href="/commandes?statut=FIFO_PARTIEL"
                className="rounded-[1.4rem] bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
              >
                Voir FIFO partiel
              </Link>
            </div>
          </article>

          <article className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-900">Controle et alertes</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Zones rapides pour surveiller les priorites et la base web.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Link
                href="/stock-dormant"
                className="rounded-[1.4rem] bg-red-50 px-4 py-4 text-sm font-semibold text-red-900 transition hover:bg-red-100"
              >
                Stock dormant ({dormantCount ?? 0})
              </Link>
              <Link
                href="/planning"
                className="rounded-[1.4rem] bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100"
              >
                Planning familles
              </Link>
              <Link
                href="/stock-dormant-sans-commande"
                className="rounded-[1.4rem] bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
              >
                Dormant sans commande
              </Link>
              <Link
                href="/test-supabase"
                className="rounded-[1.4rem] bg-sky-50 px-4 py-4 text-sm font-semibold text-sky-900 transition hover:bg-sky-100"
              >
                Tester Supabase ({fifoCount ?? 0} lignes FIFO)
              </Link>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}

