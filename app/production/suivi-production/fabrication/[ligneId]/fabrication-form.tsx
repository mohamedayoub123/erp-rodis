"use client";

import { useMemo, useState } from "react";
import { saveFabricationRapportAction } from "../../actions";
import { DateJmaFormField } from "@/app/_components/date-jma-input";

const TYPE_FABRICATION_OPTIONS = [
  "Automatique",
  "Semi auto",
  "Gel douche",
  "Parfume",
  "Huile/Serum",
  "Savon",
  "Talc",
];

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
  ph: number | null;
  densite: number | null;
  viscosite: number | null;
  stabilite: string | null;
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

export function FabricationForm({
  ligneId,
  rapport,
}: {
  ligneId: number;
  rapport: RapportInfo | null;
}) {
  const [cuvesPoids, setCuvesPoids] = useState({
    cuve_1_poids: rapport?.cuve_1_poids ?? "",
    cuve_2_poids: rapport?.cuve_2_poids ?? "",
    cuve_3_poids: rapport?.cuve_3_poids ?? "",
    cuve_4_poids: rapport?.cuve_4_poids ?? "",
  });

  const vracTotal = useMemo(() => {
    const total = Object.values(cuvesPoids).reduce<number>((sum, value) => {
      const parsed = Number(String(value).replace(",", "."));
      return sum + (Number.isNaN(parsed) ? 0 : parsed);
    }, 0);
    return total > 0 ? Math.round(total * 100) / 100 : "";
  }, [cuvesPoids]);

  return (
    <form action={saveFabricationRapportAction} className="grid gap-6">
      <input type="hidden" name="ligne_id" value={ligneId} />

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
          />
        </label>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold text-slate-900">Equipe</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Machine
            <input
              type="text"
              name="machine"
              defaultValue={rapport?.machine || ""}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Preparateur
            <input
              type="text"
              name="preparateur"
              defaultValue={rapport?.preparateur || ""}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Type
            <select
              name="type_fabrication"
              defaultValue={rapport?.type_fabrication || ""}
              className={inputClass}
            >
              <option value="">-</option>
              {TYPE_FABRICATION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
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
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            N cuve 2
            <input
              type="text"
              name="cuve_2_numero"
              defaultValue={rapport?.cuve_2_numero || ""}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            N cuve 3
            <input
              type="text"
              name="cuve_3_numero"
              defaultValue={rapport?.cuve_3_numero || ""}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            N cuve 4
            <input
              type="text"
              name="cuve_4_numero"
              defaultValue={rapport?.cuve_4_numero || ""}
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
              className={inputClass}
            />
          </label>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold text-slate-900">Temps</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Debut preparation
            <input
              type="time"
              name="temps_debut_preparation"
              defaultValue={rapport?.temps_debut_preparation || ""}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Envoi echantillon labo
            <input
              type="time"
              name="temps_envoi_echantillon_labo"
              defaultValue={rapport?.temps_envoi_echantillon_labo || ""}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Fin test
            <input
              type="time"
              name="temps_fin_test"
              defaultValue={rapport?.temps_fin_test || ""}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Vidange
            <input
              type="time"
              name="temps_vidange"
              defaultValue={rapport?.temps_vidange || ""}
              className={inputClass}
            />
          </label>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold text-slate-900">Controle qualite</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            pH
            <input
              type="number"
              step="0.01"
              name="ph"
              defaultValue={rapport?.ph ?? ""}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Densite
            <input
              type="number"
              step="0.01"
              name="densite"
              defaultValue={rapport?.densite ?? ""}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Viscosite
            <input
              type="number"
              step="0.01"
              name="viscosite"
              defaultValue={rapport?.viscosite ?? ""}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Stabilite
            <select name="stabilite" defaultValue={rapport?.stabilite || ""} className={inputClass}>
              <option value="">-</option>
              <option value="Stable">Stable</option>
              <option value="Non stable">Non stable</option>
            </select>
          </label>
        </div>
      </div>

      <div>
        <h2 className="mb-1 text-lg font-bold text-slate-900">Arret</h2>
        <p className="mb-3 text-xs text-slate-500">
          Temps d&apos;arret (en minutes) pour chaque cause concernee.
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
                defaultValue={rapport?.[cause.field] ?? ""}
                placeholder="minutes"
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
              defaultValue={rapport?.qt_vrac_recupere ?? ""}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Code vrac recupere
            <input
              type="text"
              name="code_vrac_recupere"
              defaultValue={rapport?.code_vrac_recupere || ""}
              className={inputClass}
            />
          </label>
        </div>
      </div>

      <div>
        <button
          type="submit"
          className="rounded-full bg-amber-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-500"
        >
          Save
        </button>
      </div>
    </form>
  );
}
