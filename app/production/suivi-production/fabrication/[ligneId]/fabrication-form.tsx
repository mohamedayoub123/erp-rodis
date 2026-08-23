"use client";

import { useMemo, useState } from "react";
import { saveFabricationRapportAction } from "../../actions";
import { DateJmaFormField, MOIS_OPTIONS } from "@/app/_components/date-jma-input";
import { SubmitButton } from "@/app/_components/submit-button";
import { combineTempsJourMois, splitTempsJourMois } from "@/lib/suivi-tirage-time";
import { LotSearchField } from "@/app/depots/transfer-order/lot-search-field";
import { MachineSelectField } from "../../machine-select-field";
import { TYPE_PRODUIT_OPTIONS } from "../../../machines/type-produit-options";

const ARRET_CAUSES = [
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
] as const;

type RapportInfo = {
  machine: string | null;
  type_fabrication: string | null;
  preparateur: string | null;
  cuve_1_numero: string | null;
  cuve_1_poids: number | null;
  cuve_2_numero: string | null;
  cuve_2_poids: number | null;
  cuve_3_numero: string | null;
  cuve_3_poids: number | null;
  cuve_4_numero: string | null;
  cuve_4_poids: number | null;
  temps_debut_preparation: string | null;
  temps_envoi_echantillon_labo: string | null;
  temps_fin_test: string | null;
  temps_vidange: string | null;
  nb_journaliers_fabrication: number | null;
  vrac_fabrique: number | null;
  qt_vrac_recupere: number | null;
  code_vrac_recupere: string | null;
  fabrication_arret_absence_air: number | null;
  fabrication_arret_absence_vapeur: number | null;
  fabrication_arret_attente_aspiration_aqueuse: number | null;
  fabrication_arret_attente_cuves_mobiles: number | null;
  fabrication_arret_attente_eau_osmosee: number | null;
  fabrication_arret_coupure_electrique: number | null;
  fabrication_arret_maintenance_plateforme: number | null;
  fabrication_arret_manque_cuves_mobiles: number | null;
  fabrication_arret_probleme_pompe: number | null;
  fabrication_arret_probleme_ph: number | null;
  fabrication_arret_probleme_technique: number | null;
  date_fabrication_conditionnement: string | null;
};

const inputClass =
  "rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none";

export function TempsField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: string | null | undefined;
}) {
  const initial = splitTempsJourMois(defaultValue);
  const [day, setDay] = useState(initial.day);
  const [month, setMonth] = useState(initial.month);
  const [time, setTime] = useState(initial.time);

  return (
    <label className="grid gap-1 text-xs font-semibold text-slate-500">
      {label}
      <input type="hidden" name={name} value={combineTempsJourMois(day, month, time)} />
      <div className="flex gap-1">
        <input
          type="number"
          min="1"
          max="31"
          placeholder="JJ"
          value={day}
          onChange={(event) => setDay(event.target.value)}
          required
          className={`w-14 ${inputClass} px-2`}
        />
        <select
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          required
          className={`${inputClass} px-1`}
        >
          <option value="">Mois</option>
          {MOIS_OPTIONS.map((mois) => (
            <option key={mois.value} value={mois.value}>
              {mois.label.slice(0, 3)}
            </option>
          ))}
        </select>
        <input
          type="text"
          inputMode="numeric"
          placeholder="HH:MM"
          pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
          title="Format 24h, ex: 14:30"
          value={time}
          onChange={(event) => setTime(event.target.value)}
          required
          className={inputClass}
        />
      </div>
    </label>
  );
}

export function FabricationForm({
  ligneId,
  code,
  rapport,
  vracRecupereLots,
  machines,
}: {
  ligneId: number;
  code: string;
  rapport: RapportInfo | null;
  vracRecupereLots: { numeroLot: string; solde: number }[];
  machines: { nom: string; typeProduit: string[] }[];
}) {
  const [cuvesPoids, setCuvesPoids] = useState({
    cuve_1_poids: rapport?.cuve_1_poids ?? "0",
    cuve_2_poids: rapport?.cuve_2_poids ?? "0",
    cuve_3_poids: rapport?.cuve_3_poids ?? "0",
    cuve_4_poids: rapport?.cuve_4_poids ?? "0",
  });

  const [typeFabrication, setTypeFabrication] = useState(rapport?.type_fabrication || "");

  const vracTotal = useMemo(() => {
    const total = Object.values(cuvesPoids).reduce<number>((sum, value) => {
      const parsed = Number(String(value).replace(",", "."));
      return sum + (Number.isNaN(parsed) ? 0 : parsed);
    }, 0);
    return Math.round(total * 100) / 100;
  }, [cuvesPoids]);

  return (
    <form action={saveFabricationRapportAction} className="grid gap-6">
      <input type="hidden" name="ligne_id" value={ligneId} />
      <input type="hidden" name="code" value={code} />

      <div>
        <h2 className="mb-1 text-lg font-bold text-slate-900">Date</h2>
        <p className="mb-3 text-xs text-slate-500">
          Cette date remplace la date automatique dans Suivi Production (colonne Date
          fabrication).
        </p>
        <label className="grid max-w-xs gap-1 text-xs font-semibold text-slate-500">
          Date fabrication
          <DateJmaFormField
            name="date_fabrication_conditionnement"
            defaultValue={rapport?.date_fabrication_conditionnement}
            required
          />
        </label>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold text-slate-900">Equipe</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Machine
            <MachineSelectField
              name="machine"
              defaultValue={rapport?.machine || ""}
              machines={machines}
              onMachineChange={(typeProduit) => setTypeFabrication(typeProduit[0] || "")}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Preparateur
            <input
              type="text"
              name="preparateur"
              defaultValue={rapport?.preparateur || ""}
              required
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Type
            <select
              name="type_fabrication"
              value={typeFabrication}
              onChange={(event) => setTypeFabrication(event.target.value)}
              required
              className={inputClass}
            >
              <option value="">-</option>
              {TYPE_PRODUIT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Nb de journaliers
            <input
              type="number"
              step="1"
              min="0"
              name="nb_journaliers_fabrication"
              defaultValue={rapport?.nb_journaliers_fabrication ?? "0"}
              required
              className={inputClass}
            />
          </label>
        </div>
      </div>

      <div>
        <h2 className="mb-1 text-lg font-bold text-slate-900">Cuves</h2>
        <p className="mb-3 text-xs text-slate-500">
          Jusqu&apos;a 4 cuves utilisees pour cette preparation (numero reel de la cuve + poids).
        </p>
        <div className="grid gap-4 md:grid-cols-4">
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            N cuve 1
            <input
              type="text"
              name="cuve_1_numero"
              defaultValue={rapport?.cuve_1_numero || ""}
              required
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            N cuve 2
            <input
              type="text"
              name="cuve_2_numero"
              defaultValue={rapport?.cuve_2_numero || ""}
              required
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            N cuve 3
            <input
              type="text"
              name="cuve_3_numero"
              defaultValue={rapport?.cuve_3_numero || ""}
              required
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            N cuve 4
            <input
              type="text"
              name="cuve_4_numero"
              defaultValue={rapport?.cuve_4_numero || ""}
              required
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Poids cuve 1
            <input
              type="number"
              step="0.01"
              name="cuve_1_poids"
              value={cuvesPoids.cuve_1_poids}
              onChange={(e) =>
                setCuvesPoids((prev) => ({ ...prev, cuve_1_poids: e.target.value }))
              }
              required
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Poids cuve 2
            <input
              type="number"
              step="0.01"
              name="cuve_2_poids"
              value={cuvesPoids.cuve_2_poids}
              onChange={(e) =>
                setCuvesPoids((prev) => ({ ...prev, cuve_2_poids: e.target.value }))
              }
              required
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Poids cuve 3
            <input
              type="number"
              step="0.01"
              name="cuve_3_poids"
              value={cuvesPoids.cuve_3_poids}
              onChange={(e) =>
                setCuvesPoids((prev) => ({ ...prev, cuve_3_poids: e.target.value }))
              }
              required
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Poids cuve 4
            <input
              type="number"
              step="0.01"
              name="cuve_4_poids"
              value={cuvesPoids.cuve_4_poids}
              onChange={(e) =>
                setCuvesPoids((prev) => ({ ...prev, cuve_4_poids: e.target.value }))
              }
              required
              className={inputClass}
            />
          </label>
        </div>
      </div>

      <div>
        <h2 className="mb-1 text-lg font-bold text-slate-900">Temps</h2>
        <p className="mb-3 text-xs text-slate-500">
          Jour/mois + heure pour chaque temps, une preparation pouvant s&apos;etaler sur plusieurs
          jours.
        </p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <TempsField
            label="Debut preparation"
            name="temps_debut_preparation"
            defaultValue={rapport?.temps_debut_preparation}
          />
          <TempsField
            label="Envoi echantillon labo"
            name="temps_envoi_echantillon_labo"
            defaultValue={rapport?.temps_envoi_echantillon_labo}
          />
          <TempsField label="Fin test" name="temps_fin_test" defaultValue={rapport?.temps_fin_test} />
          <TempsField label="Vidange" name="temps_vidange" defaultValue={rapport?.temps_vidange} />
        </div>
      </div>

      <div>
        <h2 className="mb-1 text-lg font-bold text-slate-900">Arret</h2>
        <p className="mb-3 text-xs text-slate-500">
          Temps d&apos;arret (en minutes) pour chaque cause concernee - 0 si pas concerne.
        </p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ARRET_CAUSES.map((cause) => (
            <label key={cause.field} className="grid gap-1 text-xs font-semibold text-slate-500">
              {cause.label}
              <input
                type="number"
                step="1"
                min="0"
                name={cause.field}
                defaultValue={rapport?.[cause.field] ?? "0"}
                required
                className={inputClass}
              />
            </label>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-1 text-lg font-bold text-slate-900">Production</h2>
        <p className="mb-3 text-xs text-slate-500">
          Vrac fabrique = somme automatique des poids des 4 cuves. Ce qui est enregistre ici est
          retire de ce qu&apos;il reste a faire (visible dans le Dashboard).
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Vrac fabrique (auto)
            <input
              type="number"
              step="0.01"
              name="vrac_fabrique"
              value={vracTotal}
              readOnly
              className={`${inputClass} bg-slate-50 text-slate-600`}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Qt vrac recupere
            <input
              type="number"
              step="0.01"
              name="qt_vrac_recupere"
              defaultValue={rapport?.qt_vrac_recupere ?? "0"}
              required
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Code vrac recupere
            <LotSearchField
              name="code_vrac_recupere"
              defaultValue={rapport?.code_vrac_recupere || ""}
              lots={vracRecupereLots}
            />
          </label>
        </div>
      </div>

      <div>
        <SubmitButton
          pendingLabel="Enregistrement..."
          className="rounded-full bg-amber-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-500"
        >
          Save
        </SubmitButton>
      </div>
    </form>
  );
}
