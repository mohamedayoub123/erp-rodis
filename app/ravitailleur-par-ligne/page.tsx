import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { fetchConditionnementZones } from "@/lib/machines-conditionnement";

export default async function RavitailleurParLignePage() {
  noStore();
  const zoneButtons = await fetchConditionnementZones();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Ravitailleur par ligne
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production" label="Retour production" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <Link
            href="/ravitailleur-par-ligne/tout"
            className="block rounded-[1.75rem] border border-black/5 bg-slate-950 p-6 text-center shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1"
          >
            <span className="text-lg font-bold text-white">Toutes les zones</span>
          </Link>
          <Link
            href="/ravitailleur-par-ligne/articles"
            className="block rounded-[1.75rem] border border-black/5 bg-sky-700 p-6 text-center shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1"
          >
            <span className="text-lg font-bold text-white">Par article</span>
          </Link>
          <Link
            href="/ravitailleur-par-ligne/genres"
            className="block rounded-[1.75rem] border border-black/5 bg-emerald-700 p-6 text-center shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1"
          >
            <span className="text-lg font-bold text-white">Impression pour detail de fabrication</span>
          </Link>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {zoneButtons.map((zone) => (
            <Link
              key={zone}
              href={`/ravitailleur-par-ligne/${zone}`}
              className="rounded-[1.75rem] border border-black/5 bg-white p-6 text-left shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_44px_rgba(15,23,42,0.12)]"
            >
              <span className="text-lg font-bold text-slate-900">
                Programme Dispatcher {zone}
              </span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
