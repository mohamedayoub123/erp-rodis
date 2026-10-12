import { getCurrentStockUser, getNcTafProcessusAutorisesUser } from "@/lib/stock-auth";
import { BandeauFiabilite } from "./bandeau-fiabilite";
import { BLEU_TITRE, POLICE } from "./diapositive";
import { lireSuiviNcTafPr4, peutVoirNcTafPr4, type Compte, type CompteNc } from "./nc-taf-donnees";

// Diapositive "NC et TAF" : combien de NC et de TAF le processus PR4 a en <annee du trimestre> et combien sont
// terminees, au total puis par audit. NC et TAF restent separes (jamais un total ni un % "NC + TAF"). Les chiffres
// viennent de Qualite > NC et TAF, en direct, et suivent les droits d'acces de l'utilisateur a ces donnees.
const VERT = "#0b9a46";
const ORANGE = "#ed7d31";
const ROUGE = "#e00000";
const carte =
  "rounded-[1.75rem] border border-black/5 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-6";

const pct = (partie: number, total: number) =>
  total > 0 ? `${((partie / total) * 100).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %` : "—";

function Message({ children }: { children: string }) {
  return <section className={`${carte} text-sm text-slate-600`}>{children}</section>;
}

function Panneau({ titre, unite, compte }: { titre: string; unite: string; compte: Compte | CompteNc }) {
  const segments = [
    { cle: "terminees", libelle: "Terminées", valeur: compte.terminees, couleur: VERT },
    { cle: "enCours", libelle: "En cours", valeur: compte.enCours, couleur: ORANGE },
    { cle: "enAttente", libelle: "En attente / pas d'action", valeur: compte.enAttente, couleur: ROUGE },
  ];
  const nc = "correctionRealisees" in compte ? compte : null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">{titre}</h4>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-6xl font-black tracking-tight text-slate-900">{compte.total}</span>
        <span className="text-lg text-slate-600">{unite}</span>
      </p>

      <div
        className="mt-4 flex h-4 w-full overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={`${compte.terminees} terminées sur ${compte.total}`}
      >
        {compte.total > 0
          ? segments
              .filter((segment) => segment.valeur > 0)
              .map((segment) => (
                <div key={segment.cle} style={{ width: `${(segment.valeur / compte.total) * 100}%`, backgroundColor: segment.couleur }} />
              ))
          : null}
      </div>

      <ul className="mt-4 space-y-2">
        {segments
          .filter((segment) => segment.cle !== "enAttente" || segment.valeur > 0)
          .map((segment) => (
            <li key={segment.cle} className="flex items-center justify-between gap-3 text-base">
              <span className="flex items-center gap-2 text-slate-700">
                <span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: segment.couleur }} />
                {segment.libelle}
              </span>
              <span className="tabular-nums text-slate-900">
                <strong className="text-xl font-bold">{segment.valeur}</strong>
                <span className="ml-2 text-sm text-slate-500">{pct(segment.valeur, compte.total)}</span>
              </span>
            </li>
          ))}
      </ul>

      {nc ? (
        <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
          Correction réalisée : <strong className="text-slate-900">{nc.correctionRealisees} / {nc.total}</strong>
          <span className="mx-2 text-slate-300">|</span>
          Action corrective (AC) réalisée : <strong className="text-slate-900">{nc.acRealisees} / {nc.total}</strong>
        </p>
      ) : null}
    </div>
  );
}

const cellule = "px-3 py-2 tabular-nums";

export async function DiapositiveNcTafPr4({ annee }: { annee: number }) {
  const utilisateur = await getCurrentStockUser();
  const autorises = await getNcTafProcessusAutorisesUser(utilisateur);
  if (!peutVoirNcTafPr4(autorises)) {
    return <Message>Vous n&apos;avez pas accès aux NC et TAF du processus PR4.</Message>;
  }

  let suivi;
  try {
    suivi = await lireSuiviNcTafPr4(annee, autorises);
  } catch {
    return <Message>Impossible de calculer l&apos;analyse des NC et TAF pour le moment. Rechargez la page dans un instant.</Message>;
  }

  return (
    <section className={carte}>
      <h2 className="text-5xl font-light" style={{ color: BLEU_TITRE, fontFamily: POLICE }}>
        NC et TAF
      </h2>
      <h3 className="mt-2 text-center text-2xl font-bold uppercase tracking-[0.12em] text-slate-700 sm:text-3xl" style={{ fontFamily: POLICE }}>
        Analyse des NC et des TAF – PR4 {annee}
      </h3>

      {suivi.nc.total === 0 && suivi.taf.total === 0 ? (
        <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-base text-slate-600">
          Aucune NC ni TAF enregistrée pour le processus PR4 en {annee}.
        </p>
      ) : (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Panneau titre="Non-conformités (NC)" unite="NC" compte={suivi.nc} />
            <Panneau titre="TAF" unite="TAF" compte={suivi.taf} />
          </div>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-center text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th rowSpan={2} className="px-3 py-2 text-left font-semibold">
                    Audit
                  </th>
                  <th colSpan={4} className="border-l border-slate-200 px-3 py-2 font-semibold">
                    NC
                  </th>
                  <th colSpan={4} className="border-l border-slate-200 px-3 py-2 font-semibold">
                    TAF
                  </th>
                </tr>
                <tr>
                  {["Total", "Terminées", "En cours", "En attente"].map((libelle) => (
                    <th key={`nc-${libelle}`} className={`px-3 py-2 font-medium ${libelle === "Total" ? "border-l border-slate-200" : ""}`}>
                      {libelle}
                    </th>
                  ))}
                  {["Total", "Terminées", "En cours", "Pas d'action"].map((libelle) => (
                    <th key={`taf-${libelle}`} className={`px-3 py-2 font-medium ${libelle === "Total" ? "border-l border-slate-200" : ""}`}>
                      {libelle}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {suivi.parAudit.map((ligne) => (
                  <tr key={ligne.audit} className="border-t border-slate-100 text-slate-800">
                    <td className={`${cellule} text-left font-semibold`}>{ligne.audit}</td>
                    <td className={`${cellule} border-l border-slate-100 font-semibold`}>{ligne.nc.total}</td>
                    <td className={`${cellule} font-semibold`} style={{ color: VERT }}>{ligne.nc.terminees}</td>
                    <td className={cellule}>{ligne.nc.enCours}</td>
                    <td className={cellule}>{ligne.nc.enAttente}</td>
                    <td className={`${cellule} border-l border-slate-100 font-semibold`}>{ligne.taf.total}</td>
                    <td className={`${cellule} font-semibold`} style={{ color: VERT }}>{ligne.taf.terminees}</td>
                    <td className={cellule}>{ligne.taf.enCours}</td>
                    <td className={cellule}>{ligne.taf.enAttente}</td>
                  </tr>
                ))}
                <tr className="border-t border-slate-200 bg-slate-50 font-bold text-slate-900">
                  <td className={`${cellule} text-left`}>Total {annee}</td>
                  <td className={`${cellule} border-l border-slate-200`}>{suivi.nc.total}</td>
                  <td className={cellule} style={{ color: VERT }}>{suivi.nc.terminees}</td>
                  <td className={cellule}>{suivi.nc.enCours}</td>
                  <td className={cellule}>{suivi.nc.enAttente}</td>
                  <td className={`${cellule} border-l border-slate-200`}>{suivi.taf.total}</td>
                  <td className={cellule} style={{ color: VERT }}>{suivi.taf.terminees}</td>
                  <td className={cellule}>{suivi.taf.enCours}</td>
                  <td className={cellule}>{suivi.taf.enAttente}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      <BandeauFiabilite
        source="ERP (Qualité : NC et TAF du processus PR4), situation à ce jour pour l'année en cours du rapport"
        rapport={{ calculeLe: new Date().toISOString() }}
        alertes={
          suivi.ncAcheveesNonCloturees > 0
            ? [
                `${suivi.ncAcheveesNonCloturees} NC ont la Correction et l'AC réalisées mais leur Statut clôture est encore « EN COURS » : elles sont comptées en cours (à corriger dans NC si elles sont terminées)`,
              ]
            : []
        }
      />
    </section>
  );
}
