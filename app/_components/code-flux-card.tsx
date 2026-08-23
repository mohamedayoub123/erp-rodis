import Link from "next/link";
import type { CodeFlux } from "@/lib/production-code-flux";

// Carte d'affichage du flux complet d'un code de dispatch (PL, PD, TO
// d'origine de la matiere, entree stock du produit fini, sortie/proforma si
// deja livre) - partagee entre le Rapport "Flux par Code", la page PL
// (Historique programme) et la page PD (Historique Programme Dispatcher),
// pour ne jamais desynchroniser 3 affichages du meme calcul.
export function CodeFluxCard({ flux }: { flux: CodeFlux }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-bold text-slate-900">{flux.code}</span>
        {flux.produit ? <span className="text-sm text-slate-600">- {flux.produit}</span> : null}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Programme (PL)</p>
          {flux.pl ? (
            <Link href={flux.pl.href} className="mt-1 inline-block text-sm font-semibold text-sky-700 underline">
              {flux.pl.label}
            </Link>
          ) : (
            <p className="mt-1 text-sm text-slate-500">-</p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dispatch (PD)</p>
          {flux.pds.length > 0 ? (
            <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-sm">
              {flux.pds.map((pd) => (
                <Link key={pd.href} href={pd.href} className="font-semibold text-sky-700 underline">
                  {pd.label}
                </Link>
              ))}
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-500">-</p>
          )}
        </div>
      </div>

      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Matiere premiere consommee (TO/TI d&apos;origine)</p>
        {flux.mpSources.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">Aucune reservation MP tracee pour ce code.</p>
        ) : (
          <div className="mt-1 space-y-2">
            {flux.mpSources.map((mp, i) => (
              <div key={`${mp.articleNom}-${mp.numeroLot}-${i}`} className="rounded-xl bg-white px-3 py-2 text-sm">
                <p className="font-semibold text-slate-900">
                  {mp.articleNom} {mp.numeroLot ? `(lot ${mp.numeroLot})` : ""} - {mp.quantiteReservee.toLocaleString("fr-FR")}{" "}
                  <span className="font-normal text-slate-500">- depot {mp.depotNom}</span>
                </p>
                {mp.tos.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">Aucun Transfer Order retrouve pour ce lot/depot.</p>
                ) : (
                  <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-slate-600">
                    Livre par{" "}
                    {mp.tos.map((to) => (
                      <Link key={to.href} href={to.href} className="font-semibold text-sky-700 underline">
                        {to.label}
                      </Link>
                    ))}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Produit fini</p>
        <p className="mt-1 text-sm">
          {flux.entreeProduction.entree ? (
            <Link href={flux.entreeProduction.href} className="font-semibold text-emerald-700 underline">
              entre en stock ({flux.entreeProduction.label})
            </Link>
          ) : (
            <span className="text-amber-700">pas encore entre en stock</span>
          )}
        </p>
        {flux.sorties.length > 0 ? (
          <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
            {flux.sorties.map((s, i) => (
              <li key={`${s.label}-${i}`}>
                Livre (
                <Link href={s.href} className="font-semibold text-sky-700 underline">
                  {s.label}
                </Link>
                ) - {s.quantite.toLocaleString("fr-FR")}
                {s.proforma ? ` - proforma ${s.proforma}` : s.livrePour ? ` - ${s.livrePour}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
