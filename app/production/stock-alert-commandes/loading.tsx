// Le calcul porte sur toutes les commandes ouvertes (une dizaine de secondes) : cet ecran s'affiche tout de suite pendant ce temps.
export default function Loading() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Production</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Stock Alert MP par commande</h1>
          <p className="mt-2 text-sm text-slate-600">
            Calcul en cours sur toutes les commandes ouvertes : le besoin de chaque matiere premiere est compare au stock du Depot E.
            Cela peut prendre une dizaine de secondes.
          </p>
        </section>
        <section className="grid gap-4 md:grid-cols-5" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="h-24 animate-pulse rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)]" />
          ))}
        </section>
        <div className="h-64 animate-pulse rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)]" aria-hidden="true" />
      </div>
    </main>
  );
}
