import { supabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { BackButton } from "@/app/_components/back-button";

export default async function TestSupabasePage() {
  const { data, error } = await supabaseServer
    .from("articles")
    .select("id, nom_article, type_article")
    .limit(5);
  const lignesLues = data?.length ?? 0;
  const testStatus = error ? "Connexion a corriger" : "Connexion operationnelle";
  const nextAction = error
    ? "Controle d'abord les cles Supabase et la configuration locale dans Parametres."
    : "La connexion est bonne. Tu peux maintenant travailler sur Articles, Stock ou Commandes.";

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#eff6ff_0%,#f8fbff_50%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Test Supabase
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Page de controle rapide de la connexion base web.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <BackButton href="/" label="Retour accueil" />
            <Link
              href="/articles/produit-fini"
              className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Voir articles
            </Link>
          </div>
        </div>

        <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-[2rem] border border-sky-200 bg-[linear-gradient(135deg,#eff6ff_0%,#dbeafe_100%)] p-6 shadow-[0_18px_40px_rgba(14,165,233,0.1)]">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              Etat de la connexion
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-sky-950">
              {testStatus}
            </h2>
            <p className="mt-3 text-sm leading-7 text-sky-900/80">{nextAction}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Link
                href="/parametres"
                className="rounded-[1.25rem] bg-white px-4 py-4 text-sm font-semibold text-violet-900 transition hover:bg-violet-50"
              >
                Voir parametres
              </Link>
              <Link
                href="/articles/produit-fini"
                className="rounded-[1.25rem] bg-white px-4 py-4 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50"
              >
                Ouvrir articles
              </Link>
              <Link
                href="/dashboard"
                className="rounded-[1.25rem] bg-white px-4 py-4 text-sm font-semibold text-sky-900 transition hover:bg-sky-50"
              >
                Ouvrir dashboard
              </Link>
            </div>
          </article>

          <article className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Lecture simple
            </p>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-900">Statut</p>
                <p className="mt-1">Dit si la web arrive bien a lire la base Supabase.</p>
              </div>
              <div className="rounded-2xl bg-sky-50 px-4 py-3">
                <p className="font-semibold text-sky-900">Table testee</p>
                <p className="mt-1">Ici le test est fait sur la table articles.</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                <p className="font-semibold text-emerald-900">Lignes lues</p>
                <p className="mt-1">Le nombre d&apos;exemples renvoyes pendant le test.</p>
              </div>
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
            href="/test-supabase"
            className="rounded-[1.5rem] border border-sky-200 bg-sky-50 px-5 py-4 text-sm font-semibold text-sky-950 shadow-[0_12px_30px_rgba(14,165,233,0.06)] transition hover:bg-sky-100"
          >
            2. Tester la connexion
          </Link>
          <Link
            href="/articles/produit-fini"
            className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-950 shadow-[0_12px_30px_rgba(16,185,129,0.06)] transition hover:bg-emerald-100"
          >
            3. Voir les articles
          </Link>
          <Link
            href="/dashboard"
            className="rounded-[1.5rem] border border-fuchsia-200 bg-fuchsia-50 px-5 py-4 text-sm font-semibold text-fuchsia-950 shadow-[0_12px_30px_rgba(168,85,247,0.06)] transition hover:bg-fuchsia-100"
          >
            4. Ouvrir dashboard
          </Link>
        </section>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {error ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                Connexion Supabase en erreur
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm">
                  Statut :
                  <span className="ml-2 font-bold text-red-900">Erreur</span>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                  Table testee :
                  <span className="ml-2 font-bold text-slate-900">articles</span>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                  Lignes lues :
                  <span className="ml-2 font-bold text-slate-900">0</span>
                </div>
              </div>
              <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Commence par <span className="font-bold">Parametres</span>, puis verifie les
                cles Supabase et relance ensuite ce test.
              </div>
              <pre className="overflow-x-auto rounded-[1.5rem] bg-slate-950 p-4 text-sm text-white">
                {error.message}
              </pre>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                Connexion Supabase OK
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                  Statut :
                  <span className="ml-2 font-bold text-slate-900">Connecte</span>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                  Table testee :
                  <span className="ml-2 font-bold text-slate-900">articles</span>
                </div>
                <div className="rounded-2xl bg-sky-50 px-4 py-3 text-sm">
                  Lignes lues :
                  <span className="ml-2 font-bold text-sky-900">{lignesLues}</span>
                </div>
              </div>
              <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                Test simple reussi. La base web repond bien sur la table <span className="font-bold">articles</span>.
              </div>
              <pre className="overflow-x-auto rounded-[1.5rem] bg-slate-950 p-4 text-sm text-white">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
