import { BLEU_TITRE, POLICE } from "./diapositive";
import {
  INDICATEURS_DIAPO,
  estDansLaCible,
  lireIndicateursAnnee,
  type IndicateurDiapo,
  type TrimestreIndicateurs,
} from "./indicateurs-trimestre";

// Diapositive "Indicateur" : tableau des indicateurs PR4 de l'annee, jusqu'au trimestre de la page ouverte
// (page T1 : T1 seulement ; page T2 : T1 et T2 ; ...). Les chiffres viennent du tableau PR4 - Indicateurs ; chaque
// valeur est verte si elle est dans la cible (et compte dans les KPI atteints), rouge sinon. Un indicateur sans cible
// n'est pas colore et n'est pas compte.
const VERT = "#0b9a46";
const ROUGE = "#e00000";

function formater(valeur: number, indicateur: IndicateurDiapo) {
  const texte = valeur.toLocaleString("fr-FR", {
    minimumFractionDigits: indicateur.decimales,
    maximumFractionDigits: indicateur.decimales,
  });
  return indicateur.pourcentage ? `${texte}%` : texte;
}

const pct = (valeur: number | null) =>
  valeur === null ? "-" : `${valeur.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export async function DiapositiveIndicateursPr4({ annee, trimestre }: { annee: number; trimestre: number }) {
  let trimestres: TrimestreIndicateurs[];
  try {
    trimestres = await lireIndicateursAnnee(annee);
  } catch {
    return (
      <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 text-sm text-slate-600 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        Impossible de calculer les indicateurs pour le moment. Rechargez la page dans un instant.
      </section>
    );
  }
  return <CarteIndicateurs annee={annee} trimestre={trimestre} trimestres={trimestres} />;
}

export function CarteIndicateurs({
  annee,
  trimestre,
  trimestres,
}: {
  annee: number;
  trimestre: number;
  trimestres: TrimestreIndicateurs[];
}) {
  const colonnes = trimestres.filter((t) => t.trimestre <= trimestre);
  const courant = trimestres.find((t) => t.trimestre === trimestre);
  const cellule = "border border-slate-500 px-2 py-1.5 align-middle";

  return (
    <section className="rounded-[1.75rem] border border-black/5 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-6">
      <h2 className="text-4xl font-light" style={{ color: BLEU_TITRE, fontFamily: POLICE }}>
        Indicateur
      </h2>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse text-center text-[13px] leading-snug text-slate-900">
          <thead>
            <tr className="bg-slate-100 font-bold">
              <th className={`${cellule} w-[15%]`}>INDICATEUR</th>
              <th className={`${cellule} w-[19%]`}>MÉTHODE DE CALCUL</th>
              <th className={`${cellule} w-[8%]`}>{annee}</th>
              <th className={`${cellule} w-[7%]`}>Fréquence de mesure</th>
              {colonnes.map((t) => (
                <th key={t.trimestre} className={`${cellule} w-[7%]`}>
                  action T{t.trimestre}
                </th>
              ))}
              <th className={cellule}>plan d&apos;action</th>
            </tr>
          </thead>
          <tbody>
            {INDICATEURS_DIAPO.map((ind) => (
              <tr key={ind.numero} style={ind.fondOrange ? { backgroundColor: "#f8cbad" } : undefined}>
                <td className={cellule}>{ind.indicateur}</td>
                <td className={cellule}>{ind.methode}</td>
                <td className={cellule}>{ind.cibleTexte}</td>
                <td className={cellule}>{ind.numero === 1 || ind.numero === 3 ? "" : "trimestrielle"}</td>
                {colonnes.map((t) => {
                  const valeur = t.valeurs[ind.numero];
                  if (valeur === null || valeur === undefined) {
                    return (
                      <td key={t.trimestre} className={`${cellule} text-slate-400`}>
                        {t.complet ? "-" : ""}
                      </td>
                    );
                  }
                  const atteint = ind.cible ? estDansLaCible(ind.cible, valeur) : null;
                  return (
                    <td
                      key={t.trimestre}
                      className={`${cellule} font-bold`}
                      style={{ color: atteint === null ? "#1b1b1b" : atteint ? VERT : ROUGE }}
                    >
                      {formater(valeur, ind)}
                    </td>
                  );
                })}
                <td className={`${cellule} text-[12px] text-[#1f4fb5]`}>{ind.planAction}</td>
              </tr>
            ))}
            {/* Totaux par trimestre */}
            <tr className="bg-slate-50 font-bold">
              <td className={`${cellule} text-left`} colSpan={4}>
                KPI atteints / KPI avec cible (indicateurs sans cible non comptés)
              </td>
              {colonnes.map((t) => (
                <td key={t.trimestre} className={cellule}>
                  {t.complet ? `${t.kpiOk} / ${t.kpiTotal}` : ""}
                </td>
              ))}
              <td className={cellule} />
            </tr>
          </tbody>
        </table>
      </div>

      {courant ? (
        <div className="mt-6 space-y-1 text-3xl font-light sm:text-4xl" style={{ fontFamily: POLICE }}>
          <p>
            Indicateur : <span style={{ color: BLEU_TITRE }}>{pct(courant.pourcentageAtteint)}</span> d&apos;indicateur atteint
          </p>
          <p>
            Kpi ok : <span style={{ color: VERT }}>{courant.complet ? courant.kpiOk : "-"}</span>
          </p>
          <p>
            Kpi totale : <span style={{ color: BLEU_TITRE }}>{courant.complet ? courant.kpiTotal : "-"}</span>
          </p>
          {!courant.complet ? (
            <p className="pt-2 text-base font-normal text-slate-500">
              Les chiffres de T{courant.trimestre} {annee} apparaissent quand le trimestre est terminé.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
