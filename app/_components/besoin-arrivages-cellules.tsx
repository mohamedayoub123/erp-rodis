import Link from "next/link";
import { formatDate } from "@/lib/format-date";
import { encodeDossierId } from "@/app/stock/matiere-premiere/commande/dossier-id";
import type { CommandeEnCours, ImportEnCours } from "@/lib/besoin-conditionnement-proforma";

function nombre(valeur: number, decimales = 3) {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: decimales });
}

// Les deux colonnes "Commande (BC) en cours" et "Import en cours" d'un article MP des pages Besoin Conditionnement et
// Besoin Fabrication : ce qu'il reste a recevoir sur les bons de commande (codes BC en liens) et les imports en route (dossier,
// statut, dates). A placer dans une ligne <tr> de tableau.
export function CellulesArrivagesMp({
  commandes,
  commandeTotal,
  imports,
  importTotal,
}: {
  commandes: CommandeEnCours[];
  commandeTotal: number;
  imports: ImportEnCours[];
  importTotal: number;
}) {
  return (
    <>
      <td className="px-4 py-3">
        {commandes.length === 0 ? (
          <span className="text-slate-300">-</span>
        ) : (
          <>
            <p className="font-semibold tabular-nums text-slate-900">{nombre(commandeTotal)}</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {commandes.map((commande) => (
                <li key={commande.code} className="text-slate-600">
                  <Link href={`/stock/matiere-premiere/bc/${commande.code}`} className="font-semibold text-sky-700 underline">
                    {commande.code}
                  </Link>{" "}
                  - {nombre(commande.quantite)}
                  {commande.dateCommande ? ` - commande du ${formatDate(commande.dateCommande)}` : " - date de commande non renseignee"}
                </li>
              ))}
            </ul>
          </>
        )}
      </td>
      <td className="px-4 py-3">
        {imports.length === 0 ? (
          <span className="text-slate-300">-</span>
        ) : (
          <>
            <p className="font-semibold tabular-nums text-slate-900">{nombre(importTotal)}</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {imports.map((transit) => (
                <li key={`${transit.nDoss4d ?? ""}|${transit.nDossErp ?? ""}`} className="text-slate-600">
                  <Link
                    href={`/stock/matiere-premiere/commande/${encodeDossierId(transit.nDoss4d, transit.nDossErp)}`}
                    className="font-semibold text-sky-700 underline"
                  >
                    {transit.nDoss4d || transit.nDossErp || "Sans dossier"}
                  </Link>{" "}
                  - {nombre(transit.quantite)}
                  {transit.statutDossier ? ` - ${transit.statutDossier}` : ""}
                  {transit.dateImport ? ` - import du ${formatDate(transit.dateImport)}` : ""}
                  {transit.datePrevueReception
                    ? ` - reception prevue le ${formatDate(transit.datePrevueReception)}`
                    : " - date de reception prevue non renseignee"}
                </li>
              ))}
            </ul>
          </>
        )}
      </td>
    </>
  );
}
