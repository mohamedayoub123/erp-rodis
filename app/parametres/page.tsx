import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

export default async function ParametresPage() {
  const diagnostics = {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnon: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  const [
    { count: articlesCount },
    { count: lotsCount },
    { count: commandesCount },
    { count: fifoCount },
    { count: dormantCount },
    { count: fifoPartielCount },
    { count: livreeCount },
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
    supabaseServer
      .from("commandes")
      .select("id", { count: "exact", head: true })
      .eq("statut", "LIVREE"),
  ]);

  const diagnosticsOk =
    diagnostics.supabaseUrl && diagnostics.supabaseAnon && diagnostics.serviceRole;
  const globalStatus = diagnosticsOk
    ? "Configuration locale complete"
    : "Configuration a verifier";
  const nextAction =
    !diagnosticsOk
      ? "Controle d'abord les cles Supabase et l'environnement local."
      : (fifoPartielCount ?? 0) > 0
        ? `Verifier ${fifoPartielCount ?? 0} commande(s) FIFO partiel.`
        : (dormantCount ?? 0) > 0
          ? `Controler ${dormantCount ?? 0} lot(s) dormant(s).`
          : "Le site est pret pour la saisie et le suivi quotidien.";

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7f5ff_0%,#fbfbff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Parametres
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
              Espace de reglage simple avec informations de demarrage, liens utiles et
              etat general de la base web.
            </p>
          </div>

          <Link
            href="/admin"
            className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Ouvrir administration
          </Link>
        </div>

        <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-[2rem] border border-violet-200 bg-[linear-gradient(135deg,#f5f3ff_0%,#ede9fe_100%)] p-6 shadow-[0_18px_40px_rgba(139,92,246,0.1)]">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-700">
              Si tu es dans parametres
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-violet-950">
              Controle la base puis passe a l&apos;action
            </h2>
            <p className="mt-3 text-sm leading-7 text-violet-900/80">
              Cette page sert a verifier que la configuration locale est bonne. Quand tout
              est OK, tu peux aller dans admin, dashboard ou le centre d&apos;actions.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Link
                href="/admin"
                className="rounded-[1.25rem] bg-white px-4 py-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
              >
                Ouvrir admin
              </Link>
              <Link
                href="/dashboard"
                className="rounded-[1.25rem] bg-white px-4 py-4 text-sm font-semibold text-sky-900 transition hover:bg-sky-50"
              >
                Ouvrir dashboard
              </Link>
              <Link
                href="/operations"
                className="rounded-[1.25rem] bg-white px-4 py-4 text-sm font-semibold text-rose-900 transition hover:bg-rose-50"
              >
                Centre d&apos;actions
              </Link>
            </div>
          </article>

          <article className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Lecture simple
            </p>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <div className="rounded-2xl bg-violet-50 px-4 py-3">
                <p className="font-semibold text-violet-900">Configuration locale</p>
                <p className="mt-1">Les cles et l&apos;acces Supabase necessaires au site.</p>
              </div>
              <div className="rounded-2xl bg-amber-50 px-4 py-3">
                <p className="font-semibold text-amber-900">Etat de la base</p>
                <p className="mt-1">Le nombre d&apos;articles, lots, commandes et alertes.</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                <p className="font-semibold text-emerald-900">Action suivante</p>
                <p className="mt-1">Admin si mise a jour, dashboard si controle, operations si saisie.</p>
              </div>
            </div>
          </article>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm uppercase tracking-[0.16em] text-slate-500">Articles</p>
            <p className="mt-3 text-3xl font-black text-slate-900">{articlesCount ?? 0}</p>
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm uppercase tracking-[0.16em] text-slate-500">Lots stock</p>
            <p className="mt-3 text-3xl font-black text-slate-900">{lotsCount ?? 0}</p>
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm uppercase tracking-[0.16em] text-slate-500">Commandes</p>
            <p className="mt-3 text-3xl font-black text-slate-900">{commandesCount ?? 0}</p>
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm uppercase tracking-[0.16em] text-slate-500">Lignes FIFO</p>
            <p className="mt-3 text-3xl font-black text-slate-900">{fifoCount ?? 0}</p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-5 shadow-[0_18px_40px_rgba(245,158,11,0.08)]">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
              A surveiller
            </p>
            <h2 className="mt-2 text-2xl font-black text-amber-950">
              {dormantCount ?? 0} lots dormants
            </h2>
            <p className="mt-2 text-sm leading-6 text-amber-900/80">
              Controle `Stock dormant` et `Dormant sans commande`.
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-fuchsia-200 bg-fuchsia-50 p-5 shadow-[0_18px_40px_rgba(168,85,247,0.08)]">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-fuchsia-700">
              Commandes
            </p>
            <h2 className="mt-2 text-2xl font-black text-fuchsia-950">
              {fifoPartielCount ?? 0} FIFO partiels
            </h2>
            <p className="mt-2 text-sm leading-6 text-fuchsia-900/80">
              Commandes a verifier ou a completer avant livraison.
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-emerald-200 bg-emerald-50 p-5 shadow-[0_18px_40px_rgba(16,185,129,0.08)]">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Avancement
            </p>
            <h2 className="mt-2 text-2xl font-black text-emerald-950">
              {livreeCount ?? 0} commandes livrees
            </h2>
            <p className="mt-2 text-sm leading-6 text-emerald-900/80">
              Historique des commandes deja terminees dans la web.
            </p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-[2rem] border border-black/5 bg-slate-950 p-6 text-white shadow-[0_20px_60px_rgba(15,23,42,0.22)]">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-300">
              Etat global
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-white">
              {globalStatus}
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">{nextAction}</p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/admin"
                className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
              >
                Ouvrir admin
              </Link>
              <Link
                href="/dashboard"
                className="rounded-full bg-sky-400 px-5 py-3 text-sm font-semibold text-sky-950 transition hover:bg-sky-300"
              >
                Ouvrir dashboard
              </Link>
              <Link
                href="/operations"
                className="rounded-full bg-rose-400 px-5 py-3 text-sm font-semibold text-rose-950 transition hover:bg-rose-300"
              >
                Centre d&apos;actions
              </Link>
            </div>
          </article>

          <article className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-900">Que faire maintenant</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <div className="rounded-2xl bg-amber-50 px-4 py-3">
                <p className="font-semibold text-amber-900">1. Verifier la configuration</p>
                <p className="mt-1">Controle les voyants Supabase juste en dessous.</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                <p className="font-semibold text-emerald-900">2. Mettre a jour la base</p>
                <p className="mt-1">Passe par `Admin` pour recharger articles et stock.</p>
              </div>
              <div className="rounded-2xl bg-sky-50 px-4 py-3">
                <p className="font-semibold text-sky-900">3. Ouvrir le dashboard</p>
                <p className="mt-1">Regarde les alertes prioritaires du jour.</p>
              </div>
              <div className="rounded-2xl bg-violet-50 px-4 py-3">
                <p className="font-semibold text-violet-900">4. Passer a la saisie</p>
                <p className="mt-1">Entre stock, sors stock ou cree une commande.</p>
              </div>
            </div>
          </article>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Link
            href="/mouvements/produit-fini#entree-stock"
            className="rounded-[1.75rem] border border-emerald-200 bg-white p-5 shadow-[0_18px_40px_rgba(16,185,129,0.08)] transition hover:bg-emerald-50"
          >
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Action
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-900">Entrer stock</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Ouvrir directement l&apos;entree de lot.
            </p>
          </Link>
          <Link
            href="/mouvements/produit-fini#sortie-stock"
            className="rounded-[1.75rem] border border-sky-200 bg-white p-5 shadow-[0_18px_40px_rgba(14,165,233,0.08)] transition hover:bg-sky-50"
          >
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              Action
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-900">Sortir stock</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Ouvrir directement la sortie de lot.
            </p>
          </Link>
          <Link
            href="/commandes#nouvelle-commande"
            className="rounded-[1.75rem] border border-amber-200 bg-white p-5 shadow-[0_18px_40px_rgba(245,158,11,0.08)] transition hover:bg-amber-50"
          >
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
              Action
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-900">Creer commande</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Ouvrir directement la saisie commande.
            </p>
          </Link>
          <Link
            href="/admin"
            className="rounded-[1.75rem] border border-violet-200 bg-white p-5 shadow-[0_18px_40px_rgba(139,92,246,0.08)] transition hover:bg-violet-50"
          >
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-700">
              Action
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-900">Mettre a jour</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Aller a l&apos;administration pour recharger la base.
            </p>
          </Link>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-900">Diagnostic rapide</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Verification simple de la configuration locale au lundi 27 juillet 2026.
            </p>

            <div className="mt-5 grid gap-3 text-sm text-slate-700">
              <div
                className={`rounded-2xl px-4 py-3 ${
                  diagnostics.supabaseUrl
                    ? "bg-emerald-50 text-emerald-900"
                    : "bg-red-50 text-red-900"
                }`}
              >
                URL Supabase :
                <span className="ml-2 font-bold">
                  {diagnostics.supabaseUrl ? "OK" : "MANQUANTE"}
                </span>
              </div>
              <div
                className={`rounded-2xl px-4 py-3 ${
                  diagnostics.supabaseAnon
                    ? "bg-emerald-50 text-emerald-900"
                    : "bg-red-50 text-red-900"
                }`}
              >
                Cle publique Supabase :
                <span className="ml-2 font-bold">
                  {diagnostics.supabaseAnon ? "OK" : "MANQUANTE"}
                </span>
              </div>
              <div
                className={`rounded-2xl px-4 py-3 ${
                  diagnostics.serviceRole
                    ? "bg-emerald-50 text-emerald-900"
                    : "bg-red-50 text-red-900"
                }`}
              >
                Cle service role :
                <span className="ml-2 font-bold">
                  {diagnostics.serviceRole ? "OK" : "MANQUANTE"}
                </span>
              </div>
            </div>
          </article>

          <article className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-900">Depannage rapide</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Si le site ne repond pas ou si une page ne charge pas, suis cet ordre simple.
            </p>

            <div className="mt-5 space-y-3 text-sm text-slate-700">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-900">1. Verifier le serveur local</p>
                <p className="mt-1">
                  Relance `demarrer-erp-web.bat` si `localhost:3000` ne s&apos;ouvre plus.
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-900">2. Recharger la base</p>
                <p className="mt-1">
                  Va dans `Admin` puis clique sur `Rafraichir Articles` et `Rafraichir
                  Stock`.
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-900">3. Controler le fichier Excel</p>
                <p className="mt-1">
                  Verifie que le fichier source n&apos;a pas ete deplace ou renomme.
                </p>
              </div>
            </div>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-900">Etat des modules</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Resume simple de ce qui est deja tres utilisable et de ce qui depend encore
              partiellement d&apos;Excel.
            </p>

            <div className="mt-5 grid gap-3 text-sm text-slate-700">
              <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                <p className="font-semibold text-emerald-900">Web principal deja utilisable</p>
                <p className="mt-1">Articles, Stock, Commandes, FIFO, Mouvements, Dashboard.</p>
              </div>
              <div className="rounded-2xl bg-amber-50 px-4 py-3">
                <p className="font-semibold text-amber-900">Lecture Excel encore active</p>
                <p className="mt-1">Planning, Dormant sans commande et certains tests live.</p>
              </div>
              <div className="rounded-2xl bg-sky-50 px-4 py-3">
                <p className="font-semibold text-sky-900">Base web centrale</p>
                <p className="mt-1">Supabase porte deja les articles, lots, commandes et FIFO.</p>
              </div>
            </div>
          </article>

          <article className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-900">Parcours recommande</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Sequence simple pour travailler dans le bon ordre.
            </p>

            <div className="mt-5 space-y-3 text-sm text-slate-700">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-900">1. Admin</p>
                <p className="mt-1">Mettre a jour `Articles` puis `Stock`.</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-900">2. Stock</p>
                <p className="mt-1">Verifier les lots, chambres, pays et disponible reel.</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-900">3. Commandes puis FIFO</p>
                <p className="mt-1">Creer, calculer, controler, puis livrer.</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-900">4. Dormant</p>
                <p className="mt-1">Suivre les alertes rouge, orange et jaune.</p>
              </div>
            </div>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-900">Etat d&apos;utilisation</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Resume simple de la situation actuelle de la web au samedi 25 juillet 2026.
            </p>

            <div className="mt-5 grid gap-3 text-sm text-slate-700">
              <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                <p className="font-semibold text-emerald-900">Local OK</p>
                <p className="mt-1">Le site fonctionne en local sur `localhost:3000`.</p>
              </div>
              <div className="rounded-2xl bg-sky-50 px-4 py-3">
                <p className="font-semibold text-sky-900">Base connectee</p>
                <p className="mt-1">Supabase alimente deja articles, stock, commandes et FIFO.</p>
              </div>
              <div className="rounded-2xl bg-amber-50 px-4 py-3">
                <p className="font-semibold text-amber-900">Excel encore present</p>
                <p className="mt-1">
                  Certaines pages lisent encore directement le fichier Excel local.
                </p>
              </div>
            </div>
          </article>

          <article className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-900">Raccourcis parametres</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Liens rapides pour piloter la base et l&apos;exploitation.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/admin"
                className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Administration
              </Link>
              <Link
                href="/dashboard"
                className="rounded-full bg-indigo-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-600"
              >
                Dashboard
              </Link>
              <Link
                href="/stock"
                className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600"
              >
                Stock
              </Link>
              <Link
                href="/mouvements/produit-fini#entree-stock"
                className="rounded-full bg-cyan-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-cyan-600"
              >
                Entree stock
              </Link>
              <Link
                href="/mouvements/produit-fini#sortie-stock"
                className="rounded-full bg-sky-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-600"
              >
                Sortie stock
              </Link>
              <Link
                href="/commandes#nouvelle-commande"
                className="rounded-full bg-amber-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-500"
              >
                Nouvelle commande
              </Link>
              <Link
                href="/fifo"
                className="rounded-full bg-fuchsia-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-fuchsia-600"
              >
                FIFO
              </Link>
            </div>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-900">Demarrage du site</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Pour ouvrir rapidement la web sur ce PC, utilise les lanceurs deja prepares
              dans le dossier du projet.
            </p>

            <div className="mt-5 space-y-3 text-sm text-slate-700">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-900">Demarrage simple</p>
                <p className="mt-1">demarrer-erp-web.bat</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-900">Mise a jour Excel + ouverture</p>
                <p className="mt-1">maj-et-demarrer-erp-web.bat</p>
              </div>
              <div className="rounded-2xl bg-violet-50 px-4 py-3">
                <p className="font-semibold text-violet-900">Adresse locale</p>
                <p className="mt-1">http://localhost:3000</p>
              </div>
            </div>
          </article>

          <article className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-900">Actions rapides</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Raccourcis vers les zones les plus utilisees.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/mouvements/produit-fini#entree-stock"
                className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600"
              >
                Entree stock
              </Link>
              <Link
                href="/mouvements/produit-fini#sortie-stock"
                className="rounded-full bg-sky-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-600"
              >
                Sortie stock
              </Link>
              <Link
                href="/commandes#nouvelle-commande"
                className="rounded-full bg-amber-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-500"
              >
                Nouvelle commande
              </Link>
              <Link
                href="/stock"
                className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Voir stock
              </Link>
              <Link
                href="/dashboard"
                className="rounded-full bg-indigo-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-600"
              >
                Ouvrir dashboard
              </Link>
            </div>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-900">Chemins utiles</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Repere rapide des emplacements importants sur ce PC.
            </p>

            <div className="mt-5 space-y-3 text-sm text-slate-700">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-900">Dossier du site web</p>
                <p className="mt-1 break-all">C:\Users\ayoub\Desktop\erprodis</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-900">Fichier Excel source</p>
                <p className="mt-1 break-all">
                  C:\Users\ayoub\Desktop\MACRO EXCEL\GFPC-ENR-026 suivi stock depot pf .xlsm
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-900">Guide de lancement</p>
                <p className="mt-1">GUIDE_DEMARRAGE.txt</p>
              </div>
            </div>
          </article>

          <article className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-900">Ordre conseille</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Workflow simple recommande pour travailler sans te perdre.
            </p>

            <div className="mt-5 space-y-3 text-sm text-slate-700">
              <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                <p className="font-semibold text-emerald-900">1. Mettre a jour la base</p>
                <p className="mt-1">Passe par `Admin` puis recharge `Articles` et `Stock`.</p>
              </div>
              <div className="rounded-2xl bg-sky-50 px-4 py-3">
                <p className="font-semibold text-sky-900">2. Verifier le stock</p>
                <p className="mt-1">Controle `Stock`, `Dormant` et `Dashboard`.</p>
              </div>
              <div className="rounded-2xl bg-amber-50 px-4 py-3">
                <p className="font-semibold text-amber-900">3. Saisir la commande</p>
                <p className="mt-1">Va dans `Commandes`, cree puis calcule le FIFO.</p>
              </div>
              <div className="rounded-2xl bg-violet-50 px-4 py-3">
                <p className="font-semibold text-violet-900">4. Faire les mouvements</p>
                <p className="mt-1">Utilise `Mouvements` pour entree ou sortie manuelle.</p>
              </div>
            </div>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-900">Ce qui est deja pret</h2>
            <div className="mt-4 grid gap-3 text-sm text-slate-700">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">Articles web consultables</div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">Stock par lots avec filtres</div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">Commandes web + FIFO web</div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">Stock dormant et planning</div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">Mouvements de stock web</div>
            </div>
          </article>

          <article className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-900">Ce qui reste encore</h2>
            <div className="mt-4 grid gap-3 text-sm text-slate-700">
              <div className="rounded-2xl bg-amber-50 px-4 py-3">Import 100% automatique de tout Excel</div>
              <div className="rounded-2xl bg-amber-50 px-4 py-3">Suppression de la dependance Excel locale</div>
              <div className="rounded-2xl bg-amber-50 px-4 py-3">Vrai lien internet public</div>
              <div className="rounded-2xl bg-amber-50 px-4 py-3">Utilisateurs, droits et securite</div>
              <div className="rounded-2xl bg-amber-50 px-4 py-3">Validation complete des regles Excel metier</div>
            </div>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-900">Questions rapides</h2>
            <div className="mt-5 space-y-3 text-sm text-slate-700">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-900">
                  Le terminal doit-il rester ouvert ?
                </p>
                <p className="mt-1">
                  Oui, tant que le site reste en local sur `localhost:3000`.
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-900">
                  Peut-on travailler deja dans une seule web ?
                </p>
                <p className="mt-1">
                  Oui pour une grande partie du flux: stock, commandes, FIFO, dormant,
                  mouvements et dashboard.
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-900">
                  Pourquoi certaines pages lisent encore Excel ?
                </p>
                <p className="mt-1">
                  Parce que toutes les feuilles et toutes les regles ne sont pas encore
                  100% transferees dans la base web.
                </p>
              </div>
            </div>
          </article>

          <article className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-900">Publication</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Etat de la mise en ligne au samedi 25 juillet 2026.
            </p>

            <div className="mt-5 grid gap-3 text-sm text-slate-700">
              <div className="rounded-2xl bg-amber-50 px-4 py-3">
                <p className="font-semibold text-amber-900">Etat actuel</p>
                <p className="mt-1">Le site tourne en local sur ton PC uniquement.</p>
              </div>
              <div className="rounded-2xl bg-sky-50 px-4 py-3">
                <p className="font-semibold text-sky-900">Pour avoir un vrai lien web</p>
                <p className="mt-1">
                  Il faudra deployer le projet et brancher proprement la base.
                </p>
              </div>
              <div className="rounded-2xl bg-violet-50 px-4 py-3">
                <p className="font-semibold text-violet-900">Etape suivante</p>
                <p className="mt-1">
                  Finir la migration 100% web puis preparer la publication internet.
                </p>
              </div>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}

