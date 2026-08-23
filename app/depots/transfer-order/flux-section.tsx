import Link from "next/link";
import type { FluxConsommateur, FluxInfo } from "./flux";

export function FluxSection({
  flux,
  transferOrderRef,
}: {
  flux: FluxInfo | null;
  transferOrderRef?: { label: string; href: string } | null;
}) {
  if (!flux) return null;

  const { origine, tis, destinations } = flux;

  // Demande explicite : plus de detail par article MP (sleeve/carton...),
  // juste le code de production, s'il est entre en stock, et s'il est deja
  // reparti/livre avec la quantite. Un meme code peut apparaitre sous
  // plusieurs articles de ce Transfer Order (sleeve ET carton par ex.) -
  // dedoublonne par code, garde la premiere occurrence rencontree.
  const consommateursParCode = new Map<string, FluxConsommateur>();
  for (const d of destinations) {
    for (const c of d.consommateurs) {
      if (!consommateursParCode.has(c.code)) consommateursParCode.set(c.code, c);
    }
  }
  const consommateursUniques = [...consommateursParCode.values()];

  return (
    <details className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <summary className="cursor-pointer px-6 py-4 text-sm font-bold text-slate-900">Flux - d&apos;ou vient/ou part ce stock</summary>
      <div className="space-y-4 border-t border-slate-100 px-6 py-4">
        {transferOrderRef ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Transfer Order</p>
            <p className="mt-1 text-sm">
              Ce Transfer Invoice vient de{" "}
              <Link href={transferOrderRef.href} className="font-semibold text-sky-700 underline">
                {transferOrderRef.label}
              </Link>
            </p>
          </div>
        ) : null}

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Origine</p>
          {origine.type === "manuel" ? (
            <p className="mt-1 text-sm text-slate-700">
              Cree a la main par <span className="font-semibold">{origine.creePar ?? "-"}</span>
              {origine.remarque ? (
                <>
                  {" "}
                  - <span className="italic">{origine.remarque}</span>
                </>
              ) : null}
            </p>
          ) : (
            <p className="mt-1 text-sm">
              Genere automatiquement depuis{" "}
              <Link href={origine.href} className="font-semibold text-sky-700 underline">
                {origine.label}
              </Link>
              {origine.type === "programme_ligne" && origine.pds.length > 0 ? (
                <>
                  {" "}
                  - dispatche dans{" "}
                  {origine.pds.map((pd, i) => (
                    <span key={pd.href}>
                      <Link href={pd.href} className="font-semibold text-sky-700 underline">
                        {pd.label}
                      </Link>
                      {i < origine.pds.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </>
              ) : null}
            </p>
          )}
        </div>

        {tis.length > 0 ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Transfer Invoice(s)</p>
            <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-sm">
              {tis.map((ti, i) => (
                <span key={ti.href}>
                  <Link href={ti.href} className="font-semibold text-sky-700 underline">
                    {ti.label}
                  </Link>{" "}
                  <span className="text-xs text-slate-500">({ti.statut})</span>
                  {i < tis.length - 1 ? "," : ""}
                </span>
              ))}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Transfer Invoice(s)</p>
            <p className="mt-1 text-sm text-slate-500">Aucun Transfer Invoice cree pour le moment.</p>
          </div>
        )}

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Destination du stock livre</p>
          {consommateursUniques.length === 0 ? (
            <p className="mt-1 text-sm text-slate-500">
              {destinations.length === 0
                ? "Aucun article matiere premiere sur ce Transfer Order."
                : "Toujours disponible au depot - pas encore repris par une production."}
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {consommateursUniques.map((c) => (
                <li key={c.code} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                  <div>
                    <Link href={c.href} className="font-semibold text-sky-700 underline">
                      {c.produit ? `${c.produit} - ` : ""}
                      {c.code}
                    </Link>{" "}
                    -{" "}
                    {c.entreeProduction.entree ? (
                      <Link href={c.entreeProduction.href} className="font-semibold text-emerald-700 underline">
                        entre en stock ({c.entreeProduction.label})
                      </Link>
                    ) : (
                      <span className="text-amber-700">pas encore entre en stock</span>
                    )}
                  </div>
                  {c.sorties.length > 0 ? (
                    <ul className="ml-4 mt-1 space-y-0.5 text-xs text-slate-600">
                      {c.sorties.map((s, i) => (
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
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </details>
  );
}
