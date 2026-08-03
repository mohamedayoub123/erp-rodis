import Link from "next/link";

export default function StatistiquePage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f9ff_0%,#fbfdff_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
            ERP Rodis
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Statistique</h1>
          <p className="mt-2 text-sm text-slate-600">Choisis quelle statistique tu veux voir.</p>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <Link
            href="/historique-mouvements"
            className="rounded-[1.75rem] border border-sky-200 bg-[linear-gradient(160deg,#eff8ff_0%,#ffffff_100%)] p-6 shadow-[0_18px_40px_rgba(14,165,233,0.12)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_46px_rgba(14,165,233,0.22)]"
          >
            <span className="text-4xl">{"\u{1F4C8}"}</span>
            <p className="mt-4 text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
              Statistique produit fini
            </p>
            <p className="mt-2 text-lg font-bold text-slate-900">Ventes par mois, par article</p>
          </Link>

          <Link
            href="/statistique-livraison"
            className="rounded-[1.75rem] border border-emerald-200 bg-[linear-gradient(160deg,#ecfdf5_0%,#ffffff_100%)] p-6 shadow-[0_18px_40px_rgba(16,185,129,0.12)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_46px_rgba(16,185,129,0.22)]"
          >
            <span className="text-4xl">{"\u{1F69A}"}</span>
            <p className="mt-4 text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">
              Statistique livraison
            </p>
            <p className="mt-2 text-lg font-bold text-slate-900">
              Commandes livrees par mois
            </p>
          </Link>

          <Link
            href="/statistique-livraison-client"
            className="rounded-[1.75rem] border border-fuchsia-200 bg-[linear-gradient(160deg,#fdf4ff_0%,#ffffff_100%)] p-6 shadow-[0_18px_40px_rgba(217,70,239,0.12)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_46px_rgba(217,70,239,0.22)]"
          >
            <span className="text-4xl">{"\u{1F465}"}</span>
            <p className="mt-4 text-sm font-semibold uppercase tracking-[0.16em] text-fuchsia-700">
              Statistique livraison client
            </p>
            <p className="mt-2 text-lg font-bold text-slate-900">
              Commandes livrees par client
            </p>
          </Link>
        </section>
      </div>
    </main>
  );
}
