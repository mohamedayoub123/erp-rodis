// Meme motif que le bloc "Acces reserve" de app/admin/page.tsx - reutilise
// partout ou une page entiere n'a d'autre but que d'afficher des prix
// (voir permission StockPermissions.voirPrix, lib/stock-auth.ts).
export function AccesPrixRefuse() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f2f7ff_0%,#fbfdff_50%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full max-w-3xl">
        <section className="rounded-[2rem] border border-red-200 bg-white p-8 text-center shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700">Acces reserve</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
            Cette page n&apos;est pas accessible pour ce compte
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            La visibilite des prix est reservee - demande l&apos;acces a un administrateur si besoin.
          </p>
        </section>
      </div>
    </main>
  );
}
