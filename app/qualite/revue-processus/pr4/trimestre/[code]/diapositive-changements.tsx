import type { ReactNode } from "react";
import { BLEU_TITRE, POLICE } from "./diapositive";
import {
  FICHES_CHANGEMENTS,
  type Changement,
  type NiveauImpact,
  type StatutChangement,
} from "./changements-donnees";

// Diapositive "Changements" : la fiche "Changements et impacts sur le processus" du trimestre (donnees dans
// changements-donnees.ts). Comme le demande le guide de la fiche, la diapositive reprend le nombre de changements, ceux a
// impact eleve, ceux en cours et la conclusion du pilote ; la fiche detaillee (tous les champs) se deplie sous la
// diapositive, sur la page seulement (jamais dans le diaporama).
const carte =
  "rounded-[1.75rem] border border-black/5 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-6";

const NIVEAU_STYLE: Record<NiveauImpact, string> = {
  Faible: "border-slate-300 bg-slate-50 text-slate-700",
  Moyen: "border-amber-300 bg-amber-50 text-amber-800",
  Élevé: "border-red-300 bg-red-50 text-red-800",
};

const STATUT_STYLE: Record<StatutChangement, string> = {
  Planifié: "border-sky-300 bg-sky-50 text-sky-800",
  "En cours": "border-orange-300 bg-orange-50 text-orange-800",
  Réalisé: "border-emerald-300 bg-emerald-50 text-emerald-800",
  "Vérifié efficace": "border-emerald-500 bg-emerald-100 text-emerald-900",
};

const jourFr = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

function Pastille({ style, children }: { style: string; children: ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${style}`}>
      {children}
    </span>
  );
}

const PastilleNiveau = ({ niveau }: { niveau: NiveauImpact }) => <Pastille style={NIVEAU_STYLE[niveau]}>{niveau}</Pastille>;

const PastilleStatut = ({ statut }: { statut: StatutChangement }) => (
  <Pastille style={STATUT_STYLE[statut]}>{statut === "Vérifié efficace" ? `✓ ${statut}` : statut}</Pastille>
);

function Tuile({ titre, valeur, ton }: { titre: string; valeur: number; ton: "neutre" | "alerte" | "encours" | "bon" }) {
  const bordure =
    ton === "alerte" ? "border-l-red-500" : ton === "encours" ? "border-l-orange-500" : ton === "bon" ? "border-l-emerald-500" : "border-l-violet-500";
  return (
    <div className={`rounded-2xl border border-slate-200 border-l-4 bg-white px-4 py-3 ${bordure}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{titre}</p>
      <p className="mt-1 text-4xl font-black tracking-tight text-slate-900">{valeur}</p>
    </div>
  );
}

// "1. Retirer ... 2. Mettre a jour ..." -> ["Retirer ...", "Mettre a jour ..."]
function etapesNumerotees(texte: string): string[] {
  return texte
    .split(/\s+(?=\d+\.\s)/)
    .map((etape) => etape.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
}

// "A ; B ; C" -> ["A", "B", "C"]
const elementsSepares = (texte: string): string[] =>
  texte
    .split(/\s*;\s*/)
    .map((element) => element.trim())
    .filter(Boolean);

function Champ({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{titre}</p>
      <div className="mt-1 text-sm leading-relaxed text-slate-800">{children}</div>
    </div>
  );
}

const Liste = ({ elements, numerotee = false }: { elements: string[]; numerotee?: boolean }) =>
  numerotee ? (
    <ol className="list-decimal space-y-0.5 pl-5">
      {elements.map((element, index) => (
        <li key={index}>{element}</li>
      ))}
    </ol>
  ) : (
    <ul className="list-disc space-y-0.5 pl-5">
      {elements.map((element, index) => (
        <li key={index}>{element}</li>
      ))}
    </ul>
  );

function FicheDetaillee({ changement }: { changement: Changement }) {
  return (
    <details className="group rounded-2xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="text-slate-400 transition group-open:rotate-90">
          ▸
        </span>
        <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-bold text-violet-800">N° {changement.numero}</span>
        <span className="min-w-[14rem] flex-1 text-sm font-semibold text-slate-900">{changement.description}</span>
        <PastilleNiveau niveau={changement.niveau} />
        <PastilleStatut statut={changement.statut} />
      </summary>
      <div className="grid gap-x-8 gap-y-4 border-t border-slate-100 px-4 py-4 md:grid-cols-2">
        <Champ titre="Type de changement">{changement.type}</Champ>
        <Champ titre="Origine / demandeur">{changement.origine}</Champ>
        <Champ titre="Date effective (ou prévue)">{jourFr(changement.dateEffective) || "Non renseignée"}</Champ>
        <Champ titre="Responsable">{changement.responsable}</Champ>
        <Champ titre="Étapes du processus impactées">{changement.etapes}</Champ>
        <Champ titre="Échéance">{jourFr(changement.echeance) || "Non renseignée"}</Champ>
        <Champ titre="Impact sur le processus">{changement.impact}</Champ>
        <Champ titre="Documents à mettre à jour">{changement.documents}</Champ>
        <Champ titre="Formation / information nécessaire">{changement.formation}</Champ>
        <Champ titre="Ressources nécessaires">{changement.ressources}</Champ>
        <Champ titre="Risques liés au changement et mesures">
          <Liste elements={elementsSepares(changement.risques)} />
        </Champ>
        <Champ titre="Actions à mener">
          <Liste elements={etapesNumerotees(changement.actions)} numerotee />
        </Champ>
        <Champ titre="Vérification de l'efficacité">
          <Liste elements={elementsSepares(changement.verification)} />
        </Champ>
        <Champ titre="Commentaire">{changement.commentaire || "—"}</Champ>
      </div>
    </details>
  );
}

const entete = "px-3 py-2 text-left font-semibold";
const cellule = "px-3 py-3 align-top";

export function DiapositiveChangements({ code, libelle }: { code: string; libelle: string }) {
  const fiche = FICHES_CHANGEMENTS[code];

  const titre = (
    <>
      <h2 className="text-5xl font-light" style={{ color: BLEU_TITRE, fontFamily: POLICE }}>
        Changements
      </h2>
      <h3 className="mt-2 text-center text-2xl font-bold uppercase tracking-[0.12em] text-slate-700 sm:text-3xl" style={{ fontFamily: POLICE }}>
        Changements et impacts sur le processus – {libelle}
      </h3>
    </>
  );

  if (!fiche || fiche.changements.length === 0) {
    return (
      <section className={carte}>
        {titre}
        <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-base text-slate-600">
          Aucun changement enregistré pour ce trimestre.
        </p>
      </section>
    );
  }

  const { changements } = fiche;
  const compter = (condition: (changement: Changement) => boolean) => changements.filter(condition).length;
  const revue = jourFr(fiche.dateRevue);
  const conclusionVide = fiche.conclusion.trim() === "";

  return (
    <div className="space-y-4">
      <section className={carte}>
        {titre}

        <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-sm text-slate-700">
          <div className="min-w-[16rem] flex-1">
            <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Processus</dt>
            <dd>{fiche.processus}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Période</dt>
            <dd>{fiche.periode}</dd>
          </div>
          {revue && !fiche.periode.includes(revue) ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Date de revue</dt>
              <dd>{revue}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Pilote</dt>
            <dd>{fiche.pilote}</dd>
          </div>
        </dl>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <Tuile titre="Changements enregistrés" valeur={changements.length} ton="neutre" />
          <Tuile titre="Dont impact élevé" valeur={compter((c) => c.niveau === "Élevé")} ton="alerte" />
          <Tuile titre="Dont en cours" valeur={compter((c) => c.statut === "En cours")} ton="encours" />
          <Tuile titre="Réalisés, pas encore vérifiés" valeur={compter((c) => c.statut === "Réalisé")} ton="neutre" />
          <Tuile titre="Vérifiés efficaces" valeur={compter((c) => c.statut === "Vérifié efficace")} ton="bon" />
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-[56rem] w-full text-sm text-slate-800">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className={entete}>N°</th>
                <th className={entete}>Type</th>
                <th className={entete}>Changement</th>
                <th className={entete}>Date effective</th>
                <th className={entete}>Étapes impactées</th>
                <th className={entete}>Impact</th>
                <th className={entete}>Statut</th>
                <th className={entete}>Responsable</th>
              </tr>
            </thead>
            <tbody>
              {changements.map((changement) => (
                <tr key={changement.numero} className="border-t border-slate-100">
                  <td className={`${cellule} font-bold tabular-nums`}>{changement.numero}</td>
                  <td className={`${cellule} text-slate-600`}>{changement.type}</td>
                  <td className={`${cellule} min-w-[16rem] font-medium text-slate-900`}>{changement.description}</td>
                  <td className={`${cellule} whitespace-nowrap tabular-nums`}>{jourFr(changement.dateEffective) || "—"}</td>
                  <td className={`${cellule} min-w-[12rem] text-slate-600`}>{changement.etapes}</td>
                  <td className={cellule}>
                    <PastilleNiveau niveau={changement.niveau} />
                  </td>
                  <td className={cellule}>
                    <PastilleStatut statut={changement.statut} />
                  </td>
                  <td className={`${cellule} min-w-[9rem] text-slate-600`}>{changement.responsable}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Conclusion du pilote : jamais inventee. Vide dans la fiche -> bloc "a completer" visible sur la page seulement. */}
        <div
          data-hors-diapo={conclusionVide ? "" : undefined}
          className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
            Conclusion du pilote sur la maîtrise des changements
          </p>
          {conclusionVide ? (
            <p className="mt-1 text-sm italic text-slate-500">
              À compléter : la conclusion du pilote n&apos;est pas renseignée dans la fiche.
            </p>
          ) : (
            <p className="mt-1 whitespace-pre-line text-base leading-relaxed text-slate-900">{fiche.conclusion}</p>
          )}
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Référence : ISO 9001 §6.3 (planification des modifications), ISO 22716 §16 (gestion des changements).
        </p>
      </section>

      <section data-hors-diapo className={carte}>
        <h3 className="text-lg font-bold text-slate-900">Fiche détaillée</h3>
        <p className="mt-1 text-sm text-slate-600">Cliquez sur un changement pour voir tous les champs de la fiche.</p>
        <div className="mt-4 space-y-3">
          {changements.map((changement) => (
            <FicheDetaillee key={changement.numero} changement={changement} />
          ))}
        </div>
      </section>
    </div>
  );
}
