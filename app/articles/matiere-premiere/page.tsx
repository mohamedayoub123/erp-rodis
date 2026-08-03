import Link from "next/link";

export default function ArticlesMatierePremierePage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Articles Matiere Premiere
              </h1>
            </div>

            <Link
              href="/articles"
              className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700"
            >
              Retour articles
            </Link>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          Page en attente de configuration.
        </section>
      </div>
    </main>
  );
}
