import type { ReactNode } from "react";
import { chargerRapport } from "./donnees-rapport";
import { MOIS_LONGS } from "./kpi-donnees";

// Quatre cartes de resume en haut de la page : KPI atteints, production realisee, temps d'arret, donnees manquantes.
const carte = "rounded-2xl border border-black/5 bg-white px-5 py-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]";

const nombre = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const moisTitre = (cle: string) => `${MOIS_LONGS[Number(cle.slice(5)) - 1]} ${cle.slice(0, 4)}`;
const moisCourt = (cle: string) => `${MOIS_LONGS[Number(cle.slice(5)) - 1].toLowerCase()} ${cle.slice(0, 4)}`;

function Carte({ titre, valeur, detail, ton = "neutre" }: { titre: string; valeur: ReactNode; detail: ReactNode; ton?: "neutre" | "bon" | "alerte" }) {
  const bordure = ton === "bon" ? "border-l-emerald-500" : ton === "alerte" ? "border-l-amber-500" : "border-l-violet-500";
  return (
    <div className={`${carte} border-l-4 ${bordure}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{titre}</p>
      <p className="mt-1 text-3xl font-black tracking-tight text-slate-900">{valeur}</p>
      <p className="mt-1 text-sm text-slate-600">{detail}</p>
    </div>
  );
}

// Dernier mois (jusqu'a la fin du trimestre) qui a un chiffre dans une serie du graphique
function dernierChiffre(mois: (string | null)[], valeurs: (number | null)[]): { cle: string; valeur: number } | null {
  for (let i = mois.length - 1; i >= 0; i--) {
    const cle = mois[i];
    const valeur = valeurs[i];
    if (cle && valeur !== null && valeur !== undefined) return { cle, valeur };
  }
  return null;
}

export async function CartesResume({ code, trimestre }: { code: string; trimestre: number }) {
  const rapport = await chargerRapport(code);
  const { indicateurs, arretProduction } = rapport.donnees;
  const courant = indicateurs?.find((t) => t.trimestre === trimestre) ?? null;

  const production = arretProduction ? dernierChiffre(arretProduction.mois, arretProduction.production) : null;
  const arret = arretProduction ? dernierChiffre(arretProduction.mois, arretProduction.arret) : null;
  const manquantsProduction = arretProduction?.manquantsProduction ?? [];
  const manquantsArret = arretProduction?.manquantsArret ?? [];
  const nbManquants = manquantsProduction.length + manquantsArret.length;

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Résumé du trimestre">
      <Carte
        titre="KPI atteints"
        valeur={courant?.complet ? `${courant.kpiOk} / ${courant.kpiTotal}` : "—"}
        detail={
          courant?.complet
            ? `${nombre(courant.pourcentageAtteint ?? 0)} % des indicateurs avec cible`
            : indicateurs
              ? "Chiffres à la fin du trimestre"
              : "Calcul indisponible"
        }
      />
      <Carte
        titre="Production réalisée"
        valeur={production ? `${nombre(production.valeur)} %` : "—"}
        detail={production ? moisTitre(production.cle) : "Aucun chiffre sur la période"}
      />
      <Carte
        titre="Temps d'arrêt"
        valeur={arret ? `${nombre(arret.valeur)} %` : "—"}
        detail={arret ? moisTitre(arret.cle) : "Aucun chiffre sur la période"}
      />
      <Carte
        titre="Données manquantes"
        valeur={nbManquants === 0 ? "Aucune" : `${nbManquants} mois`}
        ton={nbManquants === 0 ? "bon" : "alerte"}
        detail={
          nbManquants === 0 ? (
            "Tous les mois du graphique ont un chiffre"
          ) : (
            <>
              {manquantsProduction.length > 0 ? <>Production : {manquantsProduction.map(moisCourt).join(", ")}. </> : null}
              {manquantsArret.length > 0 ? <>Arrêt : {manquantsArret.map(moisCourt).join(", ")}.</> : null}
            </>
          )
        }
      />
    </section>
  );
}

export function CartesResumeChargement() {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Résumé du trimestre en cours de calcul">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`${carte} animate-pulse`}>
          <div className="h-3 w-24 rounded bg-slate-200" />
          <div className="mt-3 h-8 w-20 rounded bg-slate-200" />
          <div className="mt-3 h-3 w-36 rounded bg-slate-100" />
        </div>
      ))}
    </section>
  );
}
