"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import type { DisplayRow } from "./page";
import { DeleteRowButton } from "./delete-row-button";

// Copie locale (pas importee de ../suivi/data, qui importe supabaseServer -
// casserait le bundle client) - meme logique que formatDate ailleurs dans
// l'appli.
function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

function dispositionQualiteLabel(value: string | null | undefined) {
  if (value === "a_recuperer") return "A recuperer";
  if (value === "a_detruire") return "A detruire";
  if (value) return "Conforme";
  return "-";
}

type ArretField =
  | "arret_depot"
  | "arret_consommable_non_livre"
  | "arret_manque_conditionnement"
  | "arret_manque_vrac"
  | "arret_technique"
  | "arret_coupure_courant"
  | "arret_raclage_vrac"
  | "arret_changement_lot"
  | "arret_flacons_nc"
  | "arret_autre";

const ARRET_LABELS: { field: ArretField; label: string }[] = [
  { field: "arret_depot", label: "Arret depot" },
  { field: "arret_consommable_non_livre", label: "Arret consommable" },
  { field: "arret_manque_conditionnement", label: "Arret manque cond." },
  { field: "arret_manque_vrac", label: "Arret manque vrac" },
  { field: "arret_technique", label: "Arret technique" },
  { field: "arret_coupure_courant", label: "Arret coupure courant" },
  { field: "arret_raclage_vrac", label: "Arret raclage vrac" },
  { field: "arret_changement_lot", label: "Arret changement lot" },
  { field: "arret_flacons_nc", label: "Arret flacons NC" },
  { field: "arret_autre", label: "Autre arret" },
];

type FabricationArretField =
  | "fabrication_arret_absence_air"
  | "fabrication_arret_absence_vapeur"
  | "fabrication_arret_attente_aspiration_aqueuse"
  | "fabrication_arret_attente_cuves_mobiles"
  | "fabrication_arret_attente_eau_osmosee"
  | "fabrication_arret_coupure_electrique"
  | "fabrication_arret_maintenance_plateforme"
  | "fabrication_arret_manque_cuves_mobiles"
  | "fabrication_arret_probleme_pompe"
  | "fabrication_arret_probleme_ph"
  | "fabrication_arret_probleme_technique";

const FABRICATION_ARRET_LABELS: { field: FabricationArretField; label: string }[] = [
  { field: "fabrication_arret_absence_air", label: "Absence d'air" },
  { field: "fabrication_arret_absence_vapeur", label: "Absence de vapeur" },
  { field: "fabrication_arret_attente_aspiration_aqueuse", label: "Attente aspiration aqueuse vers trimix" },
  { field: "fabrication_arret_attente_cuves_mobiles", label: "Attente de cuves mobiles" },
  { field: "fabrication_arret_attente_eau_osmosee", label: "Attente eau osmosee" },
  { field: "fabrication_arret_coupure_electrique", label: "Coupure electrique" },
  { field: "fabrication_arret_maintenance_plateforme", label: "Maintenance sur la plateforme" },
  { field: "fabrication_arret_manque_cuves_mobiles", label: "Manque de cuves mobiles" },
  { field: "fabrication_arret_probleme_pompe", label: "Probleme de la pompe" },
  { field: "fabrication_arret_probleme_ph", label: "Probleme de PH" },
  { field: "fabrication_arret_probleme_technique", label: "Probleme technique" },
];

type EmballageArretField =
  | "emballage_arret_changement_bobine"
  | "emballage_arret_technique"
  | "emballage_arret_reglage"
  | "emballage_arret_coupure"
  | "emballage_arret_autre";

const EMBALLAGE_ARRET_LABELS: { field: EmballageArretField; label: string }[] = [
  { field: "emballage_arret_changement_bobine", label: "Arret changement bobine" },
  { field: "emballage_arret_technique", label: "Arret technique (emb.)" },
  { field: "emballage_arret_reglage", label: "Arret reglage" },
  { field: "emballage_arret_coupure", label: "Arret coupure" },
  { field: "emballage_arret_autre", label: "Autre arret (emb.)" },
];

type ExpandState = Record<string, { cond: boolean; emb: boolean }>;

// Un code n'affiche par defaut qu'UNE ligne (row.conditionnementExtras/
// emballageExtras sont vides sur les lignes deja "extra" elles-memes) -
// quand une meme etape a ete faite plusieurs fois pour ce code (plusieurs
// "fournees" a des jours differents), un clic sur la case Date de CETTE
// etape deplie ses propres fournees, independamment de l'autre etape (demande
// explicite : Conditionnement et Emballage se replient/deplient chacun de
// leur cote, pas ensemble).
export function SuiviProductionTableBody({
  rows,
  plCodeByGroupeId,
  canDelete,
  initialExpandedByKey,
}: {
  rows: DisplayRow[];
  plCodeByGroupeId: Record<string, string>;
  canDelete: boolean;
  initialExpandedByKey: ExpandState;
}) {
  const [expanded, setExpanded] = useState<ExpandState>(initialExpandedByKey);

  function toggle(key: string, section: "cond" | "emb") {
    setExpanded((prev) => {
      const current = prev[key] ?? { cond: false, emb: false };
      return { ...prev, [key]: { ...current, [section]: !current[section] } };
    });
  }

  function renderRow(row: DisplayRow) {
    const r = row.rapport;
    const showFab = row.fabrication !== null || row.isGeneral;
    const showCond = row.conditionnement !== null || row.isGeneral;
    const showEmb = row.emballage !== null || row.isGeneral;
    const state = expanded[row.key] ?? { cond: false, emb: false };

    return (
      <tr key={row.key} className="border-t border-slate-100 align-top">
        <td className="px-6 py-4 text-slate-600">{row.ligne.produit || "-"}</td>
        <td className="px-6 py-4 font-medium text-slate-900">{row.displayCode}</td>
        <td className="px-6 py-4 text-slate-600">{row.displayVrac ?? "-"}</td>
        <td className="px-6 py-4 text-slate-600">
          {row.displayCarton !== null ? Math.round(row.displayCarton * 100) / 100 : "-"}
        </td>
        <td className="px-6 py-4 font-medium text-slate-900">
          {row.ligne.groupe_id !== null ? plCodeByGroupeId[row.ligne.groupe_id] ?? "-" : "-"}
        </td>

        {/* Test labo */}
        <td className="px-6 py-4 text-slate-600">
          {showFab && r?.date_prise_echantillon ? formatDate(r.date_prise_echantillon) : "-"}
        </td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.heure_prise_echantillon || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.heure_debut_analyse || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.heure_fin_analyse || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.ph ?? "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.densite ?? "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.viscosite ?? "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.degre_alcool ?? "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.stabilite || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.couleur || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.temperature_test ?? "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.odeur || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.taux_humidite ?? "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.pression_atmospherique ?? "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.texture || "-" : "-"}</td>
        <td
          className={`px-6 py-4 ${
            showFab && r?.disposition_qualite ? "font-semibold text-red-700" : "text-slate-600"
          }`}
        >
          {showFab ? dispositionQualiteLabel(r?.disposition_qualite) : "-"}
        </td>
        <td className="px-6 py-4 text-slate-600">{showFab ? (r?.sous_derogation ? "Oui" : "Non") : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.motif_derogation || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.remarque || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.nom_labo || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.utilisateur_test_labo || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">
          {showFab ? formatDateTime(r?.date_saisie_test_labo ?? null) : "-"}
        </td>

        {/* Fabrication */}
        <td className="px-6 py-4 text-slate-900 font-semibold">
          {row.fabrication ? formatDate(row.fabrication.date) : "-"}
        </td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.machine || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.type_fabrication || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.preparateur || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.nb_journaliers_fabrication ?? "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.cuve_1_numero || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.cuve_1_poids ?? "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.cuve_2_numero || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.cuve_2_poids ?? "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.cuve_3_numero || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.cuve_3_poids ?? "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.cuve_4_numero || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.cuve_4_poids ?? "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.temps_debut_preparation || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.temps_envoi_echantillon_labo || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.temps_fin_test || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.temps_vidange || "-" : "-"}</td>
        <td className="px-6 py-4 font-semibold text-slate-900">
          {(() => {
            if (!showFab) return "-";
            const base = row.fabrication ? row.fabrication.quantite : r?.vrac_fabrique;
            if (base === null || base === undefined) return "-";
            // Le vrac recupere (d'un autre code, voir "Code vrac
            // recupere") s'ajoute au vrac fabrique de ce code - sinon la
            // colonne ne montrait que ce qui sortait de la cuve, pas ce
            // qui a reellement ete disponible.
            const recupere = Number(r?.qt_vrac_recupere ?? 0);
            return recupere > 0 ? Number(base) + recupere : base;
          })()}
        </td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.qt_vrac_recupere ?? "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.code_vrac_recupere || "-" : "-"}</td>
        {FABRICATION_ARRET_LABELS.map(({ field }) => (
          <td
            key={field}
            className={`px-6 py-4 ${
              showFab && Number(r?.[field] ?? 0) > 0 ? "font-semibold text-red-700" : "text-slate-400"
            }`}
          >
            {showFab ? r?.[field] ?? "-" : "-"}
          </td>
        ))}
        <td className="px-6 py-4 text-slate-600">{showFab ? r?.utilisateur_fabrication || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">
          {showFab ? formatDateTime(r?.date_saisie_fabrication ?? null) : "-"}
        </td>

        {/* Conditionnement */}
        <td className="px-6 py-4 text-slate-900 font-semibold">
          <div className="flex items-center gap-2">
            <span>{row.conditionnement ? formatDate(row.conditionnement.date) : "-"}</span>
            {row.conditionnementExtras.length > 0 ? (
              <button
                type="button"
                onClick={() => toggle(row.key, "cond")}
                className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800 hover:bg-sky-200"
                title="Voir les autres fournees Conditionnement de ce code"
              >
                {state.cond ? "−" : "+"}
                {row.conditionnementExtras.length}
              </button>
            ) : null}
          </div>
        </td>
        <td className="px-6 py-4 text-slate-600">{showCond ? row.conditionnement?.zone || row.ligne.zone : "-"}</td>
        <td className="px-6 py-4 text-slate-600">
          {showCond ? row.conditionnement?.chaine || row.ligne.chaine : "-"}
        </td>
        <td className="px-6 py-4 text-slate-600">{showCond ? row.conditionnement?.chef_zone || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showCond ? row.conditionnement?.chef_ligne || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showCond ? row.conditionnement?.ravitailleur || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showCond ? row.conditionnement?.tireur || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">
          {showCond ? row.conditionnement?.nb_journaliers_conditionnement ?? "-" : "-"}
        </td>
        <td className="px-6 py-4 text-slate-600">{showCond ? row.conditionnement?.cadence ?? "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showCond ? row.conditionnement?.poids_reel ?? "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showCond ? row.conditionnement?.dechet_sleeve ?? "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showCond ? row.conditionnement?.dechet_capsule ?? "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showCond ? row.conditionnement?.dechet_pompe ?? "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showCond ? row.conditionnement?.dechet_flacon ?? "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showCond ? row.conditionnement?.dechet_pot ?? "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showCond ? row.conditionnement?.dechet_etiquette ?? "-" : "-"}</td>
        {ARRET_LABELS.map(({ field }) => (
          <td
            key={field}
            className={`px-6 py-4 ${
              showCond && Number(row.conditionnement?.[field] ?? 0) > 0
                ? "font-semibold text-red-700"
                : "text-slate-400"
            }`}
          >
            {showCond ? row.conditionnement?.[field] ?? "-" : "-"}
          </td>
        ))}
        <td className="px-6 py-4 text-slate-600">{showCond ? row.conditionnement?.temps_demarage_lot || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showCond ? row.conditionnement?.temps_arret_batch || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">
          {showCond && r?.date_fabrication_conditionnement ? formatDate(r.date_fabrication_conditionnement) : "-"}
        </td>
        <td className="px-6 py-4 text-slate-600">
          {showCond && r?.date_peremption ? formatDate(r.date_peremption) : "-"}
        </td>
        <td className="px-6 py-4 font-semibold text-slate-900">
          {row.conditionnement ? row.conditionnement.quantite : showCond ? r?.qt_fabriquer ?? "-" : "-"}
        </td>
        <td className="px-6 py-4 text-slate-600">
          {showCond ? row.conditionnement?.utilisateur_conditionnement || "-" : "-"}
        </td>
        <td className="px-6 py-4 text-slate-600">
          {showCond ? formatDateTime(row.conditionnement?.date_saisie_conditionnement ?? null) : "-"}
        </td>

        {/* Emballage */}
        <td className="px-6 py-4 text-slate-900 font-semibold">
          <div className="flex items-center gap-2">
            <span>{row.emballage ? formatDate(row.emballage.date) : "-"}</span>
            {row.emballageExtras.length > 0 ? (
              <button
                type="button"
                onClick={() => toggle(row.key, "emb")}
                className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 hover:bg-emerald-200"
                title="Voir les autres fournees Emballage de ce code"
              >
                {state.emb ? "−" : "+"}
                {row.emballageExtras.length}
              </button>
            ) : null}
          </div>
        </td>
        <td className="px-6 py-4 text-slate-600">{showEmb ? row.emballage?.emballage_machine || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showEmb ? row.emballage?.emballage_operateur || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showEmb ? row.emballage?.emballage_scotcheuse || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showEmb ? row.emballage?.nb_journaliers_emballage ?? "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showEmb ? row.emballage?.emballage_temps_demarrer || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showEmb ? row.emballage?.emballage_temps_arret || "-" : "-"}</td>
        {EMBALLAGE_ARRET_LABELS.map(({ field }) => (
          <td
            key={field}
            className={`px-6 py-4 ${
              showEmb && Number(row.emballage?.[field] ?? 0) > 0 ? "font-semibold text-red-700" : "text-slate-400"
            }`}
          >
            {showEmb ? row.emballage?.[field] ?? "-" : "-"}
          </td>
        ))}
        <td className="px-6 py-4 font-semibold text-slate-900">{row.emballage ? row.emballage.quantite : "-"}</td>
        <td className="px-6 py-4 text-slate-600">{showEmb ? row.emballage?.utilisateur_emballage || "-" : "-"}</td>
        <td className="px-6 py-4 text-slate-600">
          {showEmb ? formatDateTime(row.emballage?.date_saisie_emballage ?? null) : "-"}
        </td>

        <td className="px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {showFab ? (
              <Link
                href={`/production/suivi-production/fabrication/${row.ligne.id}?code=${encodeURIComponent(row.displayCode)}`}
                className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-slate-400"
              >
                Modifier fab.
              </Link>
            ) : null}
            {showCond ? (
              <Link
                href={`/production/suivi-production/conditionnement/${row.ligne.id}?code=${encodeURIComponent(row.displayCode)}`}
                className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-slate-400"
              >
                Modifier cond.
              </Link>
            ) : null}
            {showEmb ? (
              <Link
                href={`/production/suivi-production/emballage/${row.ligne.id}?code=${encodeURIComponent(row.displayCode)}`}
                className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-slate-400"
              >
                Modifier emb.
              </Link>
            ) : null}
            {canDelete ? (
              <DeleteRowButton
                fabricationId={row.fabrication?.entryId}
                conditionnementId={row.conditionnement?.entryId}
                emballageId={row.emballage?.entryId}
                rapportId={row.isGeneral ? row.generalRapportId : null}
                ligneId={row.ligne.id}
                code={row.displayCode}
              />
            ) : null}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tbody>
      {rows.map((row) => {
        const state = expanded[row.key] ?? { cond: false, emb: false };
        return (
          <Fragment key={row.key}>
            {renderRow(row)}
            {state.cond ? row.conditionnementExtras.map((extra) => renderRow(extra)) : null}
            {state.emb ? row.emballageExtras.map((extra) => renderRow(extra)) : null}
          </Fragment>
        );
      })}
    </tbody>
  );
}
