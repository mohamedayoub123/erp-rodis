"use client";

import { useState } from "react";

// Tableau de la page Commandes par type : cartes de totaux + tableau (un article par ligne, un client par colonne). Une croix sur chaque client le
// retire du tableau (utile pour ne garder que les commandes qui interessent) : les totaux, le stock apres commande en cours et le reste a fabriquer
// sont recalcules sans ce client, les articles qui n'ont plus aucune commande disparaissent, et on peut remettre les clients retires. Chaque quantite
// est coloree selon le statut de la commande : Stand (orange), BL transforme (vert), En cours (jaune), comme dans le Tableau de commande.

export type StatutCommande = "EN_COURS" | "BL_TRANSFORME" | "STAND";

export type LigneTableau = {
  cle: string;
  nom: string;
  // client -> quantite par statut de commande
  parClient: Record<string, Partial<Record<StatutCommande, number>>>;
  stock: number;
  enCours: number;
  // reste a fabriquer calcule sur le serveur (toutes les commandes), valable tant qu'aucun client n'est retire
  resteServeur: number;
};

const STATUTS: { cle: StatutCommande; libelle: string; classes: string }[] = [
  { cle: "EN_COURS", libelle: "En cours", classes: "bg-[#fff200] text-slate-900" },
  { cle: "BL_TRANSFORME", libelle: "BL transforme", classes: "bg-[#16a34a] text-white" },
  { cle: "STAND", libelle: "Stand", classes: "bg-[#f59e0b] text-slate-950" },
];

function formater(valeur: number): string {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function arrondi2(valeur: number): number {
  return Math.round(valeur * 100) / 100;
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

function quantiteClient(ligne: LigneTableau, client: string): number {
  const parStatut = ligne.parClient[client];
  if (!parStatut) return 0;
  return (parStatut.EN_COURS ?? 0) + (parStatut.BL_TRANSFORME ?? 0) + (parStatut.STAND ?? 0);
}

// Ce qui est affiche une fois certains clients retires : totaux, stock apres commande en cours et reste a fabriquer recalcules sans eux, articles sans
// commande restante masques. Le reste a fabriquer du serveur (toutes les commandes) ne vaut que tant qu'aucun client n'est retire.
export function calculerAffichage(lignes: LigneTableau[], clients: string[], retires: string[]) {
  const clientsVisibles = clients.filter((client) => !retires.includes(client));

  // Recalcul sans les clients retires (le reste a fabriquer du serveur ne vaut que si tous les clients sont la)
  const lignesVisibles = lignes
    .map((ligne) => {
      const total = arrondi2(clientsVisibles.reduce((somme, client) => somme + quantiteClient(ligne, client), 0));
      const reste =
        retires.length === 0
          ? ligne.resteServeur
          : arrondi2(Math.max(0, total - Math.max(0, ligne.stock) - Math.max(0, ligne.enCours)));
      return { ...ligne, total, reste, apres: arrondi2(ligne.stock + ligne.enCours - total) };
    })
    .filter((ligne) => ligne.total > 0);

  const totalParClient = new Map(
    clientsVisibles.map((client) => [client, lignesVisibles.reduce((somme, ligne) => somme + quantiteClient(ligne, client), 0)])
  );
  const totaux = lignesVisibles.reduce(
    (somme, ligne) => ({
      total: somme.total + ligne.total,
      stock: somme.stock + Math.max(0, ligne.stock),
      enCours: somme.enCours + Math.max(0, ligne.enCours),
      apres: somme.apres + ligne.apres,
      reste: somme.reste + ligne.reste,
      enManque: somme.enManque + (ligne.apres < 0 ? 1 : 0),
    }),
    { total: 0, stock: 0, enCours: 0, apres: 0, reste: 0, enManque: 0 }
  );
  return { clientsVisibles, lignesVisibles, totalParClient, totaux };
}

export function TableauParType({
  titre,
  lignes,
  clients,
  nomFichier,
}: {
  titre: string;
  lignes: LigneTableau[];
  clients: string[];
  nomFichier: string;
}) {
  const [retires, setRetires] = useState<string[]>([]);
  const { clientsVisibles, lignesVisibles, totalParClient, totaux } = calculerAffichage(lignes, clients, retires);

  // Excel : le meme tableau que l'ecran (memes couleurs, memes clients, memes totaux - les clients retires n'y sont plus), voir lib/classeur-par-type.ts
  async function exporterExcel() {
    const { telechargerClasseurParType } = await import("@/lib/classeur-par-type");
    await telechargerClasseurParType(
      {
        titre,
        clients: clientsVisibles,
        lignes: lignesVisibles.map((ligne) => ({
          nom: ligne.nom,
          quantites: ligne.parClient,
          total: ligne.total,
          stock: ligne.stock,
          enCours: ligne.enCours,
          reste: ligne.reste,
          apres: ligne.apres,
        })),
        totalParClient: Object.fromEntries(totalParClient),
        totaux,
      },
      nomFichier
    );
  }

  return (
    <>
      {lignesVisibles.length > 0 ? (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Carte titre="Articles commandes" valeur={String(lignesVisibles.length)} detail={`${clientsVisibles.length} clients`} classes="border-slate-500 bg-slate-50 text-slate-900" />
          <Carte titre="Total commande" valeur={formater(totaux.total)} detail="cartons" classes="border-indigo-500 bg-indigo-50 text-indigo-900" />
          <Carte titre="Stock PF" valeur={formater(totaux.stock)} detail="cartons" classes="border-emerald-500 bg-emerald-50 text-emerald-900" />
          <Carte titre="Programme en cours" valeur={formater(totaux.enCours)} detail="cartons" classes="border-amber-500 bg-amber-50 text-amber-900" />
          <Carte
            titre="En manque apres commande en cours"
            valeur={String(totaux.enManque)}
            detail="articles"
            classes={totaux.enManque > 0 ? "border-red-500 bg-red-50 text-red-800" : "border-emerald-500 bg-emerald-50 text-emerald-900"}
          />
          <Carte
            titre="Reste a fabriquer"
            valeur={formater(totaux.reste)}
            detail="cartons"
            classes={totaux.reste > 0 ? "border-rose-500 bg-rose-50 text-rose-800" : "border-emerald-500 bg-emerald-50 text-emerald-900"}
          />
        </section>
      ) : null}

      <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-900">{titre}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {lignesVisibles.length} articles commandes par {clientsVisibles.length} clients - reste a fabriquer total {formater(totaux.reste)} cartons
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold" title="Couleur de chaque quantite client = statut de la commande">
              {STATUTS.map((statut) => (
                <span key={statut.cle} className={`rounded-full px-3 py-1 ${statut.classes}`}>
                  {statut.libelle}
                </span>
              ))}
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
        </div>

        {retires.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-6 py-3 text-xs">
            <span className="font-semibold text-slate-600">Clients retires :</span>
            {retires.map((client) => (
              <button
                key={client}
                type="button"
                onClick={() => setRetires((actuels) => actuels.filter((autre) => autre !== client))}
                title="Remettre ce client"
                className="rounded-full border border-slate-300 bg-white px-3 py-1 font-semibold text-slate-700 hover:border-emerald-500 hover:text-emerald-700"
              >
                {client} +
              </button>
            ))}
            <button type="button" onClick={() => setRetires([])} className="rounded-full bg-slate-900 px-3 py-1 font-semibold text-white hover:bg-slate-700">
              Tout remettre
            </button>
          </div>
        ) : null}

        {lignesVisibles.length === 0 ? (
          <p className="px-6 py-6 text-sm text-slate-500">
            {lignes.length === 0 ? "Aucun article de ce type n'est commande en ce moment." : "Plus aucune commande avec les clients restants : remets un client."}
          </p>
        ) : (
          <div className="max-h-[75vh] overflow-auto">
            <table className="w-max border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-20 w-[18rem] min-w-[18rem] max-w-[18rem] bg-slate-800 px-4 py-3 font-bold text-white">Article</th>
                  {clientsVisibles.map((client) => (
                    <th
                      key={client}
                      title={client}
                      className="sticky top-0 z-10 w-[8rem] min-w-[8rem] max-w-[8rem] whitespace-normal break-words border-b border-r border-t border-sky-300 bg-sky-100 px-1 py-2 text-center align-middle text-sm font-bold leading-snug text-sky-900"
                    >
                      <span className="block">{client}</span>
                      <button
                        type="button"
                        onClick={() => setRetires((actuels) => [...actuels, client])}
                        aria-label={`Retirer ${client}`}
                        title={`Retirer ${client} du tableau`}
                        className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-base font-black leading-none text-red-600 hover:bg-red-600 hover:text-white"
                      >
                        ×
                      </button>
                    </th>
                  ))}
                  <th className="sticky top-0 z-10 border-r border-slate-300 bg-indigo-600 w-[6rem] min-w-[6rem] max-w-[6rem] px-2 py-3 text-center align-middle font-bold text-white">Total commande</th>
                  <th className="sticky top-0 z-10 border-r border-slate-300 bg-emerald-100 w-[6rem] min-w-[6rem] max-w-[6rem] px-2 py-3 text-center align-middle font-bold text-emerald-900">Stock PF</th>
                  <th className="sticky top-0 z-10 border-r border-slate-300 bg-amber-100 w-[6rem] min-w-[6rem] max-w-[6rem] px-2 py-3 text-center align-middle font-bold text-amber-900">Programme en cours</th>
                  <th className="sticky top-0 z-10 border-r border-slate-300 bg-rose-600 w-[6rem] min-w-[6rem] max-w-[6rem] px-2 py-3 text-center align-middle font-bold text-white">Reste a fabriquer</th>
                  <th className="sticky top-0 z-10 border-r border-slate-300 bg-teal-600 w-[7rem] min-w-[7rem] max-w-[7rem] px-2 py-3 text-center align-middle font-bold text-white">
                    Stock apres commande en cours
                    <span className="block text-[11px] font-medium text-teal-100">stock + programme en cours - commande</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lignesVisibles.map((ligne, index) => {
                  const fond = index % 2 === 0 ? "bg-white" : "bg-slate-50";
                  return (
                    <tr key={ligne.cle} className="group">
                      <td className={`sticky left-0 z-[1] w-[18rem] min-w-[18rem] max-w-[18rem] border-b border-r border-slate-300 px-4 py-3 align-middle font-semibold text-slate-900 ${fond} group-hover:bg-sky-50`}>
                        {ligne.nom}
                      </td>
                      {clientsVisibles.map((client) => {
                        const parStatut = ligne.parClient[client];
                        return (
                          <td
                            key={client}
                            className={`w-[8rem] min-w-[8rem] max-w-[8rem] border-b border-r border-slate-300 px-1 py-2 text-center align-middle ${fond} group-hover:bg-sky-50`}
                          >
                            <div className="flex flex-col items-center gap-1">
                              {STATUTS.filter((statut) => (parStatut?.[statut.cle] ?? 0) > 0).map((statut) => (
                                <span
                                  key={statut.cle}
                                  data-quantite={parStatut?.[statut.cle]}
                                  title={`${statut.libelle} : ${formater(parStatut?.[statut.cle] ?? 0)}`}
                                  className={`inline-block min-w-[2.75rem] rounded-lg px-2 py-0.5 text-center text-base font-bold ${statut.classes}`}
                                >
                                  {formater(parStatut?.[statut.cle] ?? 0)}
                                </span>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                      <td className="border-b border-r border-slate-300 bg-indigo-50 w-[6rem] min-w-[6rem] max-w-[6rem] px-2 py-3 text-center align-middle text-base font-black text-indigo-900">{formater(ligne.total)}</td>
                      <td
                        className={`border-b border-r border-slate-300 w-[6rem] min-w-[6rem] max-w-[6rem] px-2 py-3 text-center align-middle font-semibold ${
                          ligne.stock < 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"
                        }`}
                      >
                        {formater(ligne.stock)}
                      </td>
                      <td className={`border-b border-r border-slate-300 w-[6rem] min-w-[6rem] max-w-[6rem] px-2 py-3 text-center align-middle font-semibold ${ligne.enCours > 0 ? "bg-amber-50 text-amber-800" : `${fond} text-slate-400`}`}>
                        {formater(ligne.enCours)}
                      </td>
                      <td
                        className={`border-b border-r border-slate-300 w-[6rem] min-w-[6rem] max-w-[6rem] px-2 py-3 text-center align-middle text-base font-black ${
                          ligne.reste > 0 ? "bg-rose-100 text-rose-700" : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {formater(ligne.reste)}
                      </td>
                      <td
                        title={
                          ligne.apres < 0
                            ? `Stock ${formater(ligne.stock)} + programme en cours ${formater(ligne.enCours)} - commande ${formater(ligne.total)} : il manquera ${formater(-ligne.apres)} cartons`
                            : `Stock ${formater(ligne.stock)} + programme en cours ${formater(ligne.enCours)} - commande ${formater(ligne.total)} : il restera ${formater(ligne.apres)} cartons en stock`
                        }
                        className={`border-b border-r border-slate-300 w-[7rem] min-w-[7rem] max-w-[7rem] px-2 py-3 text-center align-middle text-base font-black ${
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
                  <td className="sticky bottom-0 left-0 z-10 w-[18rem] min-w-[18rem] max-w-[18rem] bg-slate-800 px-4 py-3 text-white">Total</td>
                  {clientsVisibles.map((client) => (
                    <td
                      key={client}
                      className="sticky bottom-0 w-[8rem] min-w-[8rem] max-w-[8rem] border-r border-sky-300 bg-sky-200 px-1 py-3 text-center text-base text-sky-900"
                    >
                      {formater(totalParClient.get(client) ?? 0)}
                    </td>
                  ))}
                  <td className="sticky bottom-0 border-r border-slate-300 bg-indigo-600 w-[6rem] min-w-[6rem] max-w-[6rem] px-2 py-3 text-center align-middle text-white">{formater(totaux.total)}</td>
                  <td className="sticky bottom-0 border-r border-slate-300 bg-emerald-200 w-[6rem] min-w-[6rem] max-w-[6rem] px-2 py-3 text-center align-middle text-emerald-900">{formater(totaux.stock)}</td>
                  <td className="sticky bottom-0 border-r border-slate-300 bg-amber-200 w-[6rem] min-w-[6rem] max-w-[6rem] px-2 py-3 text-center align-middle text-amber-900">{formater(totaux.enCours)}</td>
                  <td className="sticky bottom-0 border-r border-slate-300 bg-rose-600 w-[6rem] min-w-[6rem] max-w-[6rem] px-2 py-3 text-center align-middle text-white">{formater(totaux.reste)}</td>
                  <td className={`sticky bottom-0 w-[7rem] min-w-[7rem] max-w-[7rem] border-r border-slate-300 px-2 py-3 text-center align-middle ${totaux.apres < 0 ? "bg-red-600 text-white" : "bg-teal-600 text-white"}`}>
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
