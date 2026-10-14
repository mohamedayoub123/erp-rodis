import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentStockUser, isAdminUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { formatDate } from "@/lib/format-date";
import { matchesArticleSearch } from "@/lib/article-search";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { buildPdLabelByCode, pdLabelsForNumeroLot } from "../../data";
import { lireQuantitesParCode, SEUIL_FIN_PROGRAMME_CARTONS, type LigneQuantites } from "../quantites-fin-programme";
import { unmarkCartonTermineAction } from "../../actions";

type CodeTermineRow = {
  id: number;
  programme_ligne_id: number;
  code: string;
  termine_date: string | null;
  utilisateur: string | null;
};

type LigneRow = LigneQuantites & {
  zone: string | null;
  chaine: string | null;
  produit: string | null;
  date_jour: string | null;
};

async function fetchAllCartonTermineRows(): Promise<CodeTermineRow[]> {
  const rows: CodeTermineRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("production_code_termine")
      .select("id, programme_ligne_id, code, termine_date, utilisateur")
      .eq("stage", "carton")
      .order("termine_date", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as CodeTermineRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchLignesByIds(ids: number[]): Promise<LigneRow[]> {
  if (ids.length === 0) return [];
  const rows: LigneRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_lignes")
      .select("id, zone, chaine, produit, date_jour, numero_lot, numero_lot_detail, vrac_a_fabriquer, qt_carton")
      .in("id", ids)
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as LigneRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

type SearchParams = Promise<{ produit?: string; ecart?: string }>;

// Fins "automatiques" faites par un nettoyage des lignes sans quantite, pas par une personne : jamais comptees dans le rapport d'ecarts.
const NETTOYAGE_AUTO = "nettoyage_lignes_sans_quantite";

function libelleUtilisateur(utilisateur: string | null) {
  if (!utilisateur) return "Non enregistre (avant le 19/08/2026)";
  if (utilisateur === NETTOYAGE_AUTO) return "Nettoyage automatique";
  return utilisateur;
}

function EcartCell({ ecart }: { ecart: number | null }) {
  if (ecart === null) return <td className="px-6 py-4 text-slate-400">-</td>;
  const valeur = Math.round(ecart * 100) / 100;
  if (valeur === 0) return <td className="px-6 py-4 font-semibold tabular-nums text-emerald-700">0</td>;
  const gros = Math.abs(valeur) > SEUIL_FIN_PROGRAMME_CARTONS;
  const classe = gros ? "font-black text-red-700" : valeur > 0 ? "font-semibold text-amber-700" : "font-semibold text-sky-700";
  return (
    <td className={`px-6 py-4 tabular-nums ${classe}`}>
      {valeur > 0 ? "Manque" : "Surplus"} {Math.abs(valeur)}
    </td>
  );
}

// Historique de tout ce qui a ete "Fin programme" en Conditionnement -
// deplace hors du Dashboard (qui ne doit montrer que ce qui reste en
// cours) pour ne pas l'encombrer, avec qui l'a fait et un bouton pour
// revenir en arriere en cas d'erreur de clic.
//
// Reservee aux comptes admin, meme logique que l'historique des
// validations Salle de pesage/conditionnement voisin.
export default async function HistoriqueFinProgrammePage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const currentUser = await getCurrentStockUser();
  if (!isAdminUser(currentUser)) {
    notFound();
  }

  const { produit: produitParam, ecart: ecartParam } = await searchParams;
  const produitFilter = (produitParam || "").trim().toLowerCase();
  // Rapport d'ecarts : "ecart superieur a N cartons" (vide = pas de filtre)
  const ecartBrut = (ecartParam || "").trim().replace(",", ".");
  const seuilEcart = ecartBrut !== "" && Number.isFinite(Number(ecartBrut)) && Number(ecartBrut) >= 0 ? Number(ecartBrut) : null;

  const [termineRows, pdLabelByCode] = await Promise.all([fetchAllCartonTermineRows(), buildPdLabelByCode()]);

  const ligneIds = [...new Set(termineRows.map((r) => r.programme_ligne_id))];
  const lignes = await fetchLignesByIds(ligneIds);
  const ligneById = new Map(lignes.map((l) => [l.id, l]));
  // Quantite prevue et FAITE de chaque code (ce qui avait ete saisi quand le Fin programme a ete clique)
  const quantites = await lireQuantitesParCode("carton", lignes);

  const rows = termineRows
    .map((row) => {
      const ligne = ligneById.get(row.programme_ligne_id);
      const quantite = quantites.get(`${row.programme_ligne_id}::${row.code}`);
      return {
        id: row.id,
        ligneId: row.programme_ligne_id,
        code: row.code,
        date: row.termine_date,
        utilisateur: row.utilisateur,
        pdLabel: pdLabelsForNumeroLot(row.code, pdLabelByCode),
        prevu: quantite?.prevu ?? null,
        fait: quantite?.fait ?? 0,
        ecart: quantite && quantite.prevu !== null ? quantite.prevu - quantite.fait : null,
        zone: ligne?.zone ?? "-",
        chaine: ligne?.chaine ?? "-",
        produit: ligne?.produit ?? "-",
        dateJour: ligne?.date_jour ?? null,
      };
    })
    .filter((row) => !produitFilter || matchesArticleSearch(row.produit, produitFilter))
    .filter(
      (row) =>
        seuilEcart === null || (row.utilisateur !== NETTOYAGE_AUTO && row.ecart !== null && Math.abs(row.ecart) > seuilEcart)
    );

  const manqueTotal = rows.reduce((somme, row) => somme + (row.ecart !== null && row.ecart > 0 ? row.ecart : 0), 0);
  const surplusTotal = rows.reduce((somme, row) => somme + (row.ecart !== null && row.ecart < 0 ? -row.ecart : 0), 0);
  const arrondi = (valeur: number) => Math.round(valeur * 100) / 100;
  const lienEcart = (valeur: string) => {
    const query = new URLSearchParams();
    if (produitParam) query.set("produit", produitParam);
    if (valeur) query.set("ecart", valeur);
    const texte = query.toString();
    return texte ? `?${texte}` : "?";
  };

  const produitOptions = [...new Set(lignes.map((l) => l.produit).filter(Boolean))].map((label, index) => ({
    id: index,
    label: label as string,
  }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                Historique
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Fin programme - Conditionnement
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production/suivi/dashboard" label="Retour dashboard" />
              <RefreshButton />
            </div>
          </div>

          <form className="mt-4 flex flex-wrap items-end gap-3">
            <div className="w-full max-w-sm">
              <SearchableFilterInput
                name="produit"
                defaultValue={produitParam || ""}
                options={produitOptions}
                placeholder="Filtrer par article"
              />
            </div>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Ecart superieur a (cartons)
              <input
                type="number"
                name="ecart"
                min="0"
                step="any"
                defaultValue={ecartBrut}
                placeholder={`ex : ${SEUIL_FIN_PROGRAMME_CARTONS}`}
                className="w-44 rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none"
              />
            </label>
            <button
              type="submit"
              className="rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
            >
              Afficher
            </button>
            <Link
              href={lienEcart(String(SEUIL_FIN_PROGRAMME_CARTONS))}
              className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
            >
              Ecart &gt; {SEUIL_FIN_PROGRAMME_CARTONS} cartons
            </Link>
            {seuilEcart !== null ? (
              <Link
                href={lienEcart("")}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Tout afficher
              </Link>
            ) : null}
          </form>
        </section>

        {seuilEcart !== null ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            <strong>{rows.length}</strong> Fin programme Conditionnement avec un ecart superieur a {seuilEcart} cartons
            {rows.length > 0 ? (
              <>
                {" "}- manque total <strong>{arrondi(manqueTotal)}</strong> cartons
                {surplusTotal > 0 ? (
                  <>
                    , surplus total <strong>{arrondi(surplusTotal)}</strong> cartons
                  </>
                ) : null}
              </>
            ) : null}
            . Les fins automatiques de nettoyage (lignes sans quantite) ne sont pas comptees.
          </section>
        ) : null}

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {rows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              {seuilEcart !== null
                ? `Aucun Fin programme Conditionnement avec un ecart superieur a ${seuilEcart} cartons.`
                : "Aucun code Conditionnement termine pour le moment."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Termine le</th>
                    <th className="px-6 py-4 font-semibold">Chaine</th>
                    <th className="px-6 py-4 font-semibold">Produit</th>
                    <th className="px-6 py-4 font-semibold">Code</th>
                    <th className="px-6 py-4 font-semibold">PD</th>
                    <th className="px-6 py-4 font-semibold">Prevu (cartons)</th>
                    <th className="px-6 py-4 font-semibold">Fait (cartons)</th>
                    <th className="px-6 py-4 font-semibold">Ecart (cartons)</th>
                    <th className="px-6 py-4 font-semibold">Termine par</th>
                    <th className="px-6 py-4 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-6 py-4 text-slate-600">
                        {row.date ? new Date(row.date).toLocaleString("fr-FR") : formatDate(row.dateJour)}
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {row.zone} / {row.chaine}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{row.produit}</td>
                      <td className="px-6 py-4 text-slate-700">{row.code}</td>
                      <td className="px-6 py-4 text-slate-700">{row.pdLabel}</td>
                      <td className="px-6 py-4 tabular-nums text-slate-600">{row.prevu === null ? "-" : Math.round(row.prevu * 100) / 100}</td>
                      <td
                        className={`px-6 py-4 font-semibold tabular-nums ${row.prevu !== null && row.fait + 1e-9 < row.prevu ? "text-amber-700" : "text-emerald-700"}`}
                      >
                        {Math.round(row.fait * 100) / 100}
                      </td>
                      <EcartCell ecart={row.ecart} />
                      <td className="px-6 py-4 text-slate-700">{libelleUtilisateur(row.utilisateur)}</td>
                      <td className="px-6 py-4">
                        <form action={unmarkCartonTermineAction}>
                          <input type="hidden" name="ligne_id" value={row.ligneId} />
                          <input type="hidden" name="code" value={row.code} />
                          <SubmitButton
                            pendingLabel="..."
                            className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                          >
                            Annuler
                          </SubmitButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
