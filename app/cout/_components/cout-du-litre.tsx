import { formaterFcfa } from "@/lib/cout-eau-conso";
import { libelleMois } from "@/lib/cout-eau";

function nombre(value: number, decimales = 0) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: decimales });
}

// Cout d'UN litre d'eau du mois = (cout des consommables + cout de l'electricite)
// divise par les litres d'eau du mois.
export function CoutDuLitre({
  annee,
  mois,
  litres,
  coutConsommables,
  nombreConsommables,
  consommablesSansPrix,
  coutElectricite,
  electriciteIncomplete,
  coutLitre,
}: {
  annee: number;
  mois: number;
  litres: number | null;
  coutConsommables: number;
  // 0 = aucune consommation saisie ce mois-la
  nombreConsommables: number;
  consommablesSansPrix: number;
  coutElectricite: number | null;
  // Vrai tant que l'electricite d'une ligne n'est pas calculable (kW ou prix du kWh a saisir)
  electriciteIncomplete: boolean;
  coutLitre: number | null;
}) {
  const coutTotal = coutConsommables + (coutElectricite ?? 0);
  const incomplet = nombreConsommables === 0 || consommablesSansPrix > 0 || electriciteIncomplete;

  return (
    <section className="rounded-[1.75rem] border border-sky-300 bg-gradient-to-br from-sky-50 to-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">Cout d&apos;un litre d&apos;eau - {libelleMois(annee, mois)}</h2>
        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">Calcul automatique</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        (Cout des consommables + cout de l&apos;electricite) &divide; litres d&apos;eau du mois.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Consommables</p>
          <p className="mt-1 text-xl font-black text-slate-900">{nombre(coutConsommables)} FCFA</p>
          <p className="mt-1 text-xs text-slate-500">filtres, produits, UV, membrane, sel</p>
        </div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Electricite</p>
          <p className="mt-1 text-xl font-black text-slate-900">
            {coutElectricite === null ? "-" : `${nombre(coutElectricite)} FCFA`}
          </p>
          <p className="mt-1 text-xs text-slate-500">kWh x prix du kWh, Ligne 1 + Ligne 2</p>
        </div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cout total</p>
          <p className="mt-1 text-xl font-black text-slate-900">{nombre(coutTotal)} FCFA</p>
          <p className="mt-1 text-xs text-slate-500">consommables + electricite</p>
        </div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Litres du mois</p>
          <p className="mt-1 text-xl font-black text-slate-900">{litres === null ? "-" : `${nombre(litres)} L`}</p>
          <p className="mt-1 text-xs text-slate-500">eau calculee (60 % des kg)</p>
        </div>
        <div className="rounded-2xl bg-sky-600 p-4 text-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-100">Cout d&apos;1 litre</p>
          <p className="mt-1 text-2xl font-black">{coutLitre === null ? "-" : `${nombre(coutLitre, 3)} FCFA`}</p>
          <p className="mt-1 text-xs text-sky-100">
            {litres !== null && litres > 0
              ? `${nombre(coutTotal)} ÷ ${nombre(litres)} L`
              : "pas de litres ce mois-ci"}
          </p>
        </div>
      </div>

      {litres !== null && litres > 0 ? (
        <p className="mt-3 text-sm text-slate-600">
          Dont <span className="font-semibold text-slate-800">{formaterFcfa(coutConsommables / litres, 3)} FCFA</span> de
          consommables et{" "}
          <span className="font-semibold text-slate-800">
            {coutElectricite === null ? "-" : formaterFcfa(coutElectricite / litres, 3)} FCFA
          </span>{" "}
          d&apos;electricite par litre.
        </p>
      ) : null}

      {incomplet ? (
        <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Cout incomplet pour l&apos;instant :
          {nombreConsommables === 0
            ? " aucune consommation de consommables saisie ce mois-ci (« Consommation par mois ») : le cout ne compte que l'electricite."
            : ""}
          {consommablesSansPrix > 0
            ? ` ${consommablesSansPrix} consommable(s) saisi(s) sans prix (non compte(s)).`
            : ""}
          {electriciteIncomplete
            ? " L'electricite n'est pas complete : saisis la consommation (kW) et le prix du kWh de chaque ligne dans « Prix des consommables »."
            : ""}
        </p>
      ) : null}
    </section>
  );
}
