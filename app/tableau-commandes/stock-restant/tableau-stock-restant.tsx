"use client";

import { useState } from "react";
import { FiltrePd } from "../filtre-pd";
import { enCoursSelonPd, type EnCoursParPd, type PdDuType } from "@/lib/programme-en-cours-par-pd";

// Tableau de la page Stock restant par type : un article par ligne, DEUX colonnes seulement - Stock (stock PF) et Stock restant (ce qui restera apres les
// commandes ET apres les programmes en cours : stock + programme en cours - commande, comme la colonne "Stock apres commande en cours" de Commandes par
// type). Un clic sur un en-tete trie le tableau (article A-Z, stock, stock restant : les plus en manque en haut).
// Le filtre "Programme en cours : PD" choisit les PD dont le programme en cours compte dans le stock restant (tous les PD au depart).

export type LigneStockRestant = {
  cle: string;
  nom: string;
  stock: number;
  // programme en cours de TOUS les PD (cartons entiers), sa repartition par PD pour le filtre, et la commande (infobulle du stock restant)
  enCours: number;
  enCoursParPd: EnCoursParPd;
  commande: number;
  // stock + programme en cours - commande
  apres: number;
};

type Colonne = "nom" | "stock" | "apres";
type Tri = { colonne: Colonne; sens: 1 | -1 };

function formater(valeur: number): string {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function Carte({ titre, valeur, detail, classes }: { titre: string; valeur: string; detail?: string; classes: string }) {
  return (
    <div className={`rounded-2xl border-l-4 px-4 py-3 shadow-sm ${classes}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{titre}</p>
      <p className="mt-1 text-2xl font-black">{valeur}</p>
      {detail ? <p className="mt-0.5 text-xs font-medium opacity-70">{detail}</p> : null}
    </div>
  );
}

// Les lignes avec le programme en cours des PD choisis seulement (null = tous les PD : les lignes d'origine, rien ne change)
export function appliquerPd(lignes: LigneStockRestant[], pdChoisis: Set<string> | null): LigneStockRestant[] {
  if (pdChoisis === null) return lignes;
  return lignes.map((ligne) => {
    const enCours = enCoursSelonPd(ligne.enCours, ligne.enCoursParPd, pdChoisis);
    return { ...ligne, enCours, apres: Math.round((ligne.stock + enCours - ligne.commande) * 100) / 100 };
  });
}

// Les lignes dans l'ordre choisi (article A-Z par defaut), et les totaux : stock PF = somme des stocks positifs (comme Commandes par type), stock restant =
// somme des stocks restants, articles en manque = stock restant negatif
export function preparerStockRestant(lignes: LigneStockRestant[], tri: Tri) {
  const lignesTriees = [...lignes].sort((a, b) => {
    const ordre =
      tri.colonne === "nom"
        ? a.nom.localeCompare(b.nom, "fr", { sensitivity: "base", numeric: true })
        : tri.colonne === "stock"
          ? a.stock - b.stock
          : a.apres - b.apres;
    return ordre * tri.sens || a.nom.localeCompare(b.nom, "fr", { sensitivity: "base", numeric: true });
  });
  const totaux = lignes.reduce(
    (somme, ligne) => ({
      stock: somme.stock + Math.max(0, ligne.stock),
      apres: somme.apres + ligne.apres,
      enManque: somme.enManque + (ligne.apres < 0 ? 1 : 0),
    }),
    { stock: 0, apres: 0, enManque: 0 }
  );
  return { lignesTriees, totaux: { ...totaux, apres: Math.round(totaux.apres * 100) / 100 } };
}

export function TableauStockRestant({
  titre,
  lignes: lignesTous,
  pds,
  nomFichier,
}: {
  titre: string;
  lignes: LigneStockRestant[];
  // les PD qui contiennent des articles du type choisi (filtre "Programme en cours : PD")
  pds: PdDuType[];
  nomFichier: string;
}) {
  const [tri, setTri] = useState<Tri>({ colonne: "nom", sens: 1 });
  // Au depart tous les PD sont choisis : le tableau est celui d'avant le filtre
  const [pdChoisis, setPdChoisis] = useState<Set<string>>(() => new Set(pds.map((pd) => pd.cle)));
  const tousLesPd = pdChoisis.size === pds.length;
  const lignes = appliquerPd(lignesTous, tousLesPd ? null : pdChoisis);
  const { lignesTriees, totaux } = preparerStockRestant(lignes, tri);

  function trierPar(colonne: Colonne) {
    setTri((actuel) => (actuel.colonne === colonne ? { colonne, sens: actuel.sens === 1 ? -1 : 1 } : { colonne, sens: 1 }));
  }
  const fleche = (colonne: Colonne) => (tri.colonne === colonne ? (tri.sens === 1 ? " ▲" : " ▼") : "");

  // Excel : le meme tableau que l'ecran (memes couleurs, meme ordre), voir lib/classeur-stock-restant.ts
  async function exporterExcel() {
    const { telechargerClasseurStockRestant } = await import("@/lib/classeur-stock-restant");
    await telechargerClasseurStockRestant(
      {
        titre,
        lignes: lignesTriees.map((ligne) => ({ nom: ligne.nom, stock: ligne.stock, apres: ligne.apres })),
        totaux,
        // quand on a decoche des PD : l'Excel dit lesquels comptent dans le programme en cours
        filtrePd: tousLesPd ? null : { choisis: pds.filter((pd) => pdChoisis.has(pd.cle)).map((pd) => pd.cle), total: pds.length },
      },
      nomFichier
    );
  }

  return (
    <>
      <FiltrePd pds={pds} choisis={pdChoisis} onChange={setPdChoisis} />

      {lignes.length > 0 ? (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Carte
            titre="Articles commandes"
            valeur={String(lignes.length)}
            detail={totaux.enManque > 0 ? `${totaux.enManque} en manque` : "aucun en manque"}
            classes={totaux.enManque > 0 ? "border-red-500 bg-red-50 text-red-800" : "border-slate-500 bg-slate-50 text-slate-900"}
          />
          <Carte titre="Stock" valeur={formater(totaux.stock)} detail="cartons" classes="border-emerald-500 bg-emerald-50 text-emerald-900" />
          <Carte
            titre="Stock restant"
            valeur={formater(totaux.apres)}
            detail="cartons apres commande et programme en cours"
            classes={totaux.apres < 0 ? "border-red-500 bg-red-50 text-red-800" : "border-teal-500 bg-teal-50 text-teal-900"}
          />
        </section>
      ) : null}

      <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-900">{titre}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {lignes.length} articles commandes - {totaux.enManque} en manque apres commande et programme en cours
              {tousLesPd ? "" : ` (programme en cours de ${pdChoisis.size} PD sur ${pds.length})`}
            </p>
          </div>
          <button
            type="button"
            onClick={exporterExcel}
            aria-label="Exporter en Excel"
            title="Exporter en Excel (meme forme et memes couleurs que l'ecran)"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-700 hover:border-slate-400"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6">
              <rect x="2" y="2" width="20" height="20" rx="3" fill="#1D6F42" />
              <path d="M7 7.5 10.6 12 7 16.5h2.1L11.6 13l2.5 3.5h2.1L12.6 12l3.6-4.5h-2.1l-2.5 3.4-2.5-3.4H7Z" fill="#ffffff" />
            </svg>
          </button>
        </div>

        {lignes.length === 0 ? (
          <p className="px-6 py-6 text-sm text-slate-500">Aucun article de ce type n&apos;est commande en ce moment.</p>
        ) : (
          <div className="max-h-[75vh] overflow-auto">
            <table className="w-full border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr>
                  <th className="sticky top-0 z-10 bg-slate-800 px-4 py-3 font-bold text-white">
                    <button type="button" onClick={() => trierPar("nom")} title="Trier par article" className="font-bold">
                      Article{fleche("nom")}
                    </button>
                  </th>
                  <th className="sticky top-0 z-10 w-[9rem] min-w-[9rem] border-l border-slate-300 bg-emerald-100 px-2 py-3 text-center align-middle font-bold text-emerald-900">
                    <button type="button" onClick={() => trierPar("stock")} title="Trier par stock" className="font-bold">
                      Stock{fleche("stock")}
                    </button>
                  </th>
                  <th className="sticky top-0 z-10 w-[12rem] min-w-[12rem] border-l border-slate-300 bg-teal-600 px-2 py-3 text-center align-middle font-bold text-white">
                    <button type="button" onClick={() => trierPar("apres")} title="Trier par stock restant" className="font-bold">
                      Stock restant{fleche("apres")}
                    </button>
                    <span className="block text-[11px] font-medium text-teal-100">apres commande et programme en cours</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lignesTriees.map((ligne, index) => {
                  const fond = index % 2 === 0 ? "bg-white" : "bg-slate-50";
                  return (
                    <tr key={ligne.cle} className="group">
                      <td className={`border-b border-slate-300 px-4 py-3 align-middle font-semibold text-slate-900 ${fond} group-hover:bg-sky-50`}>{ligne.nom}</td>
                      <td
                        className={`border-b border-l border-slate-300 px-2 py-3 text-center align-middle font-semibold ${
                          ligne.stock < 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"
                        }`}
                      >
                        {formater(ligne.stock)}
                      </td>
                      <td
                        title={
                          ligne.apres < 0
                            ? `Stock ${formater(ligne.stock)} + programme en cours ${formater(ligne.enCours)} - commande ${formater(ligne.commande)} : il manquera ${formater(-ligne.apres)} cartons`
                            : `Stock ${formater(ligne.stock)} + programme en cours ${formater(ligne.enCours)} - commande ${formater(ligne.commande)} : il restera ${formater(ligne.apres)} cartons en stock`
                        }
                        className={`border-b border-l border-slate-300 px-2 py-3 text-center align-middle text-base font-black ${
                          ligne.apres < 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {formater(ligne.apres)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-black">
                  <td className="sticky bottom-0 bg-slate-800 px-4 py-3 text-white">Total</td>
                  <td className="sticky bottom-0 border-l border-slate-300 bg-emerald-200 px-2 py-3 text-center text-emerald-900">{formater(totaux.stock)}</td>
                  <td className={`sticky bottom-0 border-l border-slate-300 px-2 py-3 text-center text-white ${totaux.apres < 0 ? "bg-red-600" : "bg-teal-600"}`}>
                    {formater(totaux.apres)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
