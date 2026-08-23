import Link from "next/link";
import type { FluxInfo } from "./flux";

export function FluxSection({
  flux,
  transferOrderRef,
}: {
  flux: FluxInfo | null;
  transferOrderRef?: { label: string; href: string } | null;
}) {
  if (!flux) return null;

  const { origine, tis, destinations } = flux;

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
          {destinations.length === 0 ? (
            <p className="mt-1 text-sm text-slate-500">Aucun article matiere premiere sur ce Transfer Order.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {destinations.map((d, index) => (
                <div key={`${d.articleNom}-${d.numeroLot}-${index}`} className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">
                    {d.articleNom} {d.numeroLot ? `(lot ${d.numeroLot})` : ""} -{" "}
                    {d.quantite.toLocaleString("fr-FR")}
                  </p>
                  {d.consommateurs.length === 0 ? (
                    <p className="mt-1 text-xs text-slate-500">Toujours disponible au depot - pas encore repris par une production.</p>
                  ) : (
                    <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-slate-600">
                      Repris par :{" "}
                      {d.consommateurs.map((c, i) => (
                        <span key={c.code}>
                          <Link href={c.href} className="font-semibold text-sky-700 underline">
                            {c.produit ? `${c.produit} - ` : ""}
                            {c.code}
                          </Link>
                          {i < d.consommateurs.length - 1 ? "," : ""}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
