import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SimplePrintButton } from "@/app/_components/simple-print-button";
import { CodeFluxCard } from "@/app/_components/code-flux-card";
import { buildCodeFluxContext, fetchCodeFlux } from "@/lib/production-code-flux";
import { canViewPageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { redirect } from "next/navigation";

type SearchParams = Promise<{ code?: string }>;

export default async function FluxParCodePage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const currentStockUser = await getCurrentStockUser();
  if (!(await canViewPageUser(currentStockUser, "productionRapportFluxCode"))) {
    redirect("/production/rapport");
  }

  const { code: codeParam } = await searchParams;
  const code = (codeParam || "").trim();

  const flux = code ? await fetchCodeFlux(code, await buildCodeFluxContext()) : null;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Flux par Code</h1>
              <p className="mt-2 text-sm text-slate-600">
                Tape un code de dispatch (ex: AA4256) pour voir tout son parcours : programme (PL), dispatch (PD), Transfer
                Order/Invoice qui ont livre la matiere, entree en stock du produit fini, et livraison/proforma si deja sorti.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production/rapport" label="Retour rapport" />
              <RefreshButton />
              {flux ? <SimplePrintButton /> : null}
            </div>
          </div>

          <form method="get" className="mt-4 flex flex-wrap gap-3">
            <input
              type="text"
              name="code"
              defaultValue={code}
              placeholder="Code, ex: AA4256"
              autoFocus
              className="min-w-[220px] flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
            />
            <button
              type="submit"
              className="rounded-full bg-sky-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-600"
            >
              Chercher
            </button>
          </form>
        </section>

        {code ? (
          flux ? (
            <CodeFluxCard flux={flux} />
          ) : (
            <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <p className="text-sm text-slate-500">Aucun code &quot;{code}&quot; trouve.</p>
            </section>
          )
        ) : null}
      </div>
    </main>
  );
}
