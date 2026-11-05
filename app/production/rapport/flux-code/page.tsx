import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SimplePrintButton } from "@/app/_components/simple-print-button";
import { CodeFluxCard, LEGENDE_FLUX } from "@/app/_components/code-flux-card";
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
    <main className="min-h-screen bg-[linear-gradient(180deg,#e0f2fe_0%,#f0f9ff_40%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="overflow-hidden rounded-[1.75rem] border border-sky-100 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.10)]">
          <div className="bg-[linear-gradient(135deg,#0c4a6e_0%,#0369a1_55%,#0891b2_100%)] px-6 py-7 text-white [-webkit-print-color-adjust:exact] [print-color-adjust:exact] sm:px-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-sky-200">
                  ERP Rodis - Production - Rapport
                </p>
                <h1 className="mt-2 text-5xl font-black tracking-tight sm:text-6xl">Flux par Code</h1>
                <p className="mt-4 max-w-4xl text-lg leading-relaxed text-sky-50">
                  Tape un code de dispatch (ex : AA4256) pour voir tout son parcours, de la matiere premiere jusqu&apos;a
                  la livraison au client.
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-3 rounded-full bg-white px-3 py-2 shadow-lg">
                <BackButton href="/production/rapport" label="Retour rapport" />
                <RefreshButton />
                {flux ? <SimplePrintButton /> : null}
              </div>
            </div>
          </div>

          <div className="px-6 py-6 sm:px-8">
            <form method="get" className="flex flex-wrap gap-3">
              <input
                type="text"
                name="code"
                defaultValue={code}
                placeholder="Code, ex: AA4256"
                autoFocus
                className="min-w-[240px] flex-1 rounded-2xl border-2 border-sky-200 bg-sky-50/50 px-5 py-4 text-xl font-bold text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-sky-500 focus:bg-white"
              />
              <button
                type="submit"
                className="rounded-full bg-sky-700 px-9 py-4 text-lg font-black text-white shadow-md transition hover:bg-sky-600"
              >
                Chercher
              </button>
            </form>

            <div className="mt-5">
              <p className="text-sm font-black uppercase tracking-wide text-slate-500">Ce que tu vois pour un code</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {LEGENDE_FLUX.map((element) => (
                  <li
                    key={element.label}
                    className={`rounded-full px-4 py-1.5 text-base font-bold ${element.classe}`}
                  >
                    {element.label}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-base text-slate-600">
                Pour chaque etape : la quantite, qui l&apos;a faite et sur quelle machine, les Transfer Order/Invoice qui
                ont livre la matiere, l&apos;entree en stock du produit fini (chambre, date de fabrication, reste en
                stock) et la livraison avec sa proforma.
              </p>
            </div>
          </div>
        </section>

        {code ? (
          flux ? (
            <CodeFluxCard flux={flux} />
          ) : (
            <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <p className="text-xl font-bold text-amber-900">Aucun code &quot;{code}&quot; trouve.</p>
              <p className="mt-1 text-base text-amber-800">
                Verifie l&apos;ecriture du code (lettres et chiffres, sans espace) et recommence.
              </p>
            </section>
          )
        ) : null}
      </div>
    </main>
  );
}
