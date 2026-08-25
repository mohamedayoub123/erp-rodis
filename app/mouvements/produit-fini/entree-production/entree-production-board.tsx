"use client";

import { useState } from "react";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { formatDate } from "@/lib/format-date";
import { DateJmaFormField } from "@/app/_components/date-jma-input";
import { matchesArticleSearch } from "@/lib/article-search";
import { createEntreeProductionBatchAction, deletePendingEmballageEntriesAction } from "./actions";
import { ExtraLignesField } from "./extra-lignes-field";

export type EntreeDateGroupLigne = {
  entryIds: number[];
  produit: string;
  numeroLot: string;
  quantite: number;
  dateFabrication: string;
  datePeremption: string;
  hasArticle: boolean;
};

export type EntreeDateGroup = {
  date: string;
  datesEntree: string[];
  previewNumber: number;
  lignes: EntreeDateGroupLigne[];
};

function preventEnterSubmit(event: React.KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter") event.preventDefault();
}

// Le filtre Article/Code est gere cote client (state, pas searchParams) et
// n'enleve JAMAIS une ligne du DOM - il se contente de la masquer (classe
// "hidden"). Avant, filtrer faisait une vraie navigation qui perdait toute
// modification de quantite/date pas encore validee ; desormais aucune
// navigation n'a lieu donc rien n'est jamais perdu, filtre actif ou pas.
export function EntreeProductionBoard({
  dateGroups,
  articleOptions,
}: {
  dateGroups: EntreeDateGroup[];
  articleOptions: { id: number; label: string }[];
}) {
  const [articleFilter, setArticleFilter] = useState("");
  const [codeFilter, setCodeFilter] = useState("");
  const hasFilters = Boolean(articleFilter.trim() || codeFilter.trim());

  function ligneVisible(ligne: EntreeDateGroupLigne) {
    if (articleFilter.trim() && !matchesArticleSearch(ligne.produit, articleFilter.trim())) return false;
    if (codeFilter.trim() && !ligne.numeroLot.toLowerCase().includes(codeFilter.trim().toLowerCase())) return false;
    return true;
  }

  const anyGroupVisible = dateGroups.some((group) => group.lignes.some(ligneVisible));

  return (
    <>
      <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            type="text"
            value={articleFilter}
            onChange={(event) => setArticleFilter(event.target.value)}
            onKeyDown={preventEnterSubmit}
            placeholder="Article"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
          <input
            type="text"
            value={codeFilter}
            onChange={(event) => setCodeFilter(event.target.value)}
            onKeyDown={preventEnterSubmit}
            placeholder="Code"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setArticleFilter("");
                setCodeFilter("");
              }}
              className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
            >
              Effacer
            </button>
          ) : null}
        </div>
      </section>

      {dateGroups.length === 0 ? (
        <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          Rien a transferer pour le moment - aucune quantite emballee non encore entree en stock.
        </div>
      ) : (
        <>
          {!anyGroupVisible ? (
            <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              Aucun resultat pour ce filtre.
            </div>
          ) : null}

          {dateGroups.map((group) => {
            const groupVisibleLignes = group.lignes.filter(ligneVisible);
            const groupHasVisibleLine = groupVisibleLignes.length > 0;
            const allValid = groupVisibleLignes.every((ligne) => ligne.hasArticle);
            const totalQuantite = groupVisibleLignes.reduce((sum, ligne) => sum + Number(ligne.quantite), 0);

            return (
              <section
                key={group.date}
                className={`overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)] ${
                  groupHasVisibleLine ? "" : "hidden"
                }`}
              >
                <form action={createEntreeProductionBatchAction}>
                  <input
                    type="hidden"
                    name="entry_ids"
                    value={groupVisibleLignes.flatMap((ligne) => ligne.entryIds).join(",")}
                  />
                  {groupVisibleLignes.map((ligne) => (
                    <input
                      key={ligne.entryIds[0]}
                      type="hidden"
                      name="merge_group"
                      value={`${ligne.entryIds[0]}:${ligne.entryIds.join(",")}`}
                    />
                  ))}

                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        Entree Production {group.previewNumber}
                        <span className="ml-2 text-sm font-semibold text-emerald-700">
                          Total Qt : {totalQuantite}
                        </span>
                      </h2>
                      <p className="text-xs text-slate-500">
                        Date d&apos;aujourd&apos;hui : {formatDate(group.date)}
                        <span className="mx-2 text-slate-300">|</span>
                        Date d&apos;entrer :{" "}
                        {group.datesEntree.length > 0
                          ? group.datesEntree.map((d) => formatDate(d)).join(", ")
                          : "-"}
                      </p>
                    </div>
                    <SubmitButton
                      disabled={!allValid}
                      pendingLabel="Validation..."
                      className="rounded-full bg-emerald-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Valider cette entree
                    </SubmitButton>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Article</th>
                          <th className="px-4 py-3 font-semibold">Code</th>
                          <th className="px-4 py-3 font-semibold">Quantite</th>
                          <th className="px-4 py-3 font-semibold">Date fabrication</th>
                          <th className="px-4 py-3 font-semibold">Date peremption</th>
                          <th className="px-4 py-3 font-semibold">Chambre</th>
                          <th className="px-4 py-3 font-semibold">Code pays</th>
                          <th className="px-4 py-3 font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.lignes.map((ligne) => {
                          const representativeId = ligne.entryIds[0];
                          const visible = ligneVisible(ligne);
                          return (
                            <tr
                              key={representativeId}
                              className={`border-t border-slate-100 align-top ${visible ? "" : "hidden"}`}
                            >
                              <td className="px-4 py-3 text-slate-900">{ligne.produit}</td>
                              <td className="px-4 py-3">
                                <input
                                  type="text"
                                  name={`code_${representativeId}`}
                                  defaultValue={ligne.numeroLot === "-" ? "" : ligne.numeroLot}
                                  className="w-32 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  name={`qty_${representativeId}`}
                                  defaultValue={ligne.quantite}
                                  className="w-28 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
                                />
                                {ligne.entryIds.length > 1 ? (
                                  <p className="mt-1 text-[11px] font-semibold text-slate-400">
                                    Total de {ligne.entryIds.length} saisies fusionnees
                                  </p>
                                ) : null}
                              </td>
                              <td className="px-4 py-3">
                                <DateJmaFormField
                                  name={`datefab_${representativeId}`}
                                  defaultValue={ligne.dateFabrication}
                                  required
                                />
                              </td>
                              <td className="px-4 py-3">
                                <DateJmaFormField
                                  name={`dateperemption_${representativeId}`}
                                  defaultValue={ligne.datePeremption}
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="text"
                                  name={`chambre_${representativeId}`}
                                  placeholder="Chambre"
                                  className="w-28 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="text"
                                  name={`codepays_${representativeId}`}
                                  placeholder="Code pays"
                                  className="w-28 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <SubmitButton
                                    name="only_entry_id"
                                    value={representativeId}
                                    disabled={!ligne.hasArticle}
                                    pendingLabel="..."
                                    className="rounded-full border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Valider cette ligne
                                  </SubmitButton>
                                  <DeleteIconButton
                                    label="Supprimer cette ligne (annule la quantite emballee correspondante)"
                                    formAction={deletePendingEmballageEntriesAction.bind(null, ligne.entryIds)}
                                    formNoValidate
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {!allValid ? (
                    <p className="border-t border-red-100 bg-red-50 px-5 py-3 text-xs font-semibold text-red-700">
                      Une ou plusieurs lignes n&apos;ont pas d&apos;article associe - corrige la ligne
                      de programme avant de valider.
                    </p>
                  ) : null}
                  <ExtraLignesField articleOptions={articleOptions} />
                </form>
              </section>
            );
          })}
        </>
      )}
    </>
  );
}
