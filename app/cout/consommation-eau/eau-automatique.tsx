import {
  FAMILLES_SANS_EAU,
  LIBELLES_SANS_EAU,
  type EauDuMois,
} from "@/lib/cout-eau-fabrication";
import { libelleMois } from "@/lib/cout-eau";

function nombre(value: number, decimales = 0) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: decimales });
}

// Eau utilisee dans le mois : calculee toute seule (rien a saisir) a partir du
// vrac fabrique. Les produits sans eau sont comptes mais ne generent pas d'eau.
export function EauAutomatique({
  annee,
  mois,
  eau,
  erreur,
}: {
  annee: number;
  mois: number;
  eau: EauDuMois | null;
  erreur: string | null;
}) {
  return (
    <section className="rounded-[1.75rem] border border-sky-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">Eau utilisee en {libelleMois(annee, mois)} (automatique)</h2>
        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">Calcul automatique</span>
      </div>

      {erreur || !eau ? (
        <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Les quantites fabriquees n&apos;ont pas pu etre lues{erreur ? ` (${erreur})` : ""}. Recharge la page.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fabrique dans le mois</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{nombre(eau.kgTotal, 1)} kg</p>
              <p className="mt-1 text-xs text-slate-500">{eau.nombreEntrees} entree(s) de fabrication</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sans eau (non compte)</p>
              <p className="mt-1 text-2xl font-black text-slate-900">- {nombre(eau.kgSansEau, 1)} kg</p>
              <p className="mt-1 text-xs text-slate-500">Savon, huile, serum, talc</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Base avec eau x {eau.pourcentage} %
              </p>
              <p className="mt-1 text-2xl font-black text-slate-900">{nombre(eau.kgAvecEau, 1)} kg</p>
              <p className="mt-1 text-xs text-slate-500">
                {nombre(eau.kgAvecEau, 1)} x {eau.pourcentage} %
              </p>
            </div>
            <div className="rounded-2xl bg-sky-600 p-4 text-white">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-100">Eau utilisee</p>
              <p className="mt-1 text-2xl font-black">{nombre(eau.litres, 1)} L</p>
              <p className="mt-1 text-xs text-sky-100">litres du mois</p>
            </div>
          </div>

          <p className="mt-4 text-sm text-slate-600">
            Quantite fabriquee des produits qui n&apos;utilisent pas d&apos;eau (comptee, mais sans eau) :{" "}
            {FAMILLES_SANS_EAU.map((famille, index) => (
              <span key={famille}>
                {index > 0 ? " - " : ""}
                <span className="font-semibold text-slate-800">{LIBELLES_SANS_EAU[famille]}</span>{" "}
                {nombre(eau.parFamille[famille], 1)} kg
              </span>
            ))}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Source : vrac fabrique saisi dans Entree production (kg), compte selon la date du jour de fabrication.
            Les lignes exclues des rapports ne sont pas comptees.
          </p>
        </>
      )}
    </section>
  );
}
