import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SimplePrintButton } from "@/app/_components/simple-print-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { formatDate } from "@/lib/format-date";
import { DateJmaFormField } from "@/app/_components/date-jma-input";
import { matchesArticleSearch } from "@/lib/article-search";
import { encodeDossierId } from "./dossier-id";
import { deleteDossierImportsAction, updateDossierMpStatutAction } from "./actions";
import { STATUT_DOSSIER_MP_OPTIONS, statutDossierMpBadgeClass } from "./constants";

type ImportRow = {
  id: number;
  bc_ligne_id: number;
  quantite_importee: number;
  n_doss_4d_import: string | null;
  n_doss_erp_import: string | null;
  date_import: string | null;
  lot_stock_id: number | null;
};

type DossierStatutRow = {
  n_doss_4d: string | null;
  n_doss_erp: string | null;
  statut: string;
  date_prevue_reception: string | null;
};

type BcLigneInfo = {
  id: number;
  code: string;
  article_label: string | null;
};

async function fetchAllBcLigneInfo() {
  const rows: BcLigneInfo[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("bons_commande_matiere_premiere")
      .select("id, code, article_label")
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as BcLigneInfo[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

type DossierGroup = {
  nDoss4d: string | null;
  nDossErp: string | null;
  nbArticles: number;
  quantiteTotale: number;
  dateRecente: string | null;
  statut: string;
  datePrevueReception: string | null;
  codes: string[];
  articles: string[];
};

function dossierKey(nDoss4d: string | null, nDossErp: string | null) {
  return `${nDoss4d ?? ""}|||${nDossErp ?? ""}`;
}

async function fetchAllImports() {
  const rows: ImportRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("bons_commande_mp_imports")
      .select("id, bc_ligne_id, quantite_importee, n_doss_4d_import, n_doss_erp_import, date_import, lot_stock_id")
      .order("date_import", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as ImportRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

async function fetchAllDossierStatuts() {
  const rows: DossierStatutRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("dossiers_import_mp_statut")
      .select("n_doss_4d, n_doss_erp, statut, date_prevue_reception")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as DossierStatutRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

type SearchParams = Promise<{
  statut?: string | string[];
  article?: string;
  code?: string;
  doss_erp?: string;
  doss_4d?: string;
  date_debut?: string;
  date_fin?: string;
}>;

export default async function CommandeMpPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  // Plusieurs cases "Statut" peuvent etre cochees a la fois - Next.js ne
  // renvoie un tableau que quand il y a 2+ valeurs pour la meme cle dans
  // l'URL (?statut=A&statut=B), une seule reste une simple chaine.
  const statutFilter = params.statut ? (Array.isArray(params.statut) ? params.statut : [params.statut]) : [];
  const articleFilter = (params.article || "").trim();
  const codeFilter = (params.code || "").trim().toLowerCase();
  const dossErpFilter = (params.doss_erp || "").trim().toLowerCase();
  const doss4dFilter = (params.doss_4d || "").trim().toLowerCase();
  const dateDebutFilter = (params.date_debut || "").trim();
  const dateFinFilter = (params.date_fin || "").trim();
  const hasFilters = Boolean(
    statutFilter.length > 0 ||
      articleFilter ||
      codeFilter ||
      dossErpFilter ||
      doss4dFilter ||
      dateDebutFilter ||
      dateFinFilter
  );

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "commandeMp");
  const canDelete = await canDeletePageUser(currentUser, "commandeMp");

  const [{ rows, error }, { rows: statutRows }, bcLigneRows] = await Promise.all([
    fetchAllImports(),
    fetchAllDossierStatuts(),
    fetchAllBcLigneInfo(),
  ]);

  const bcLigneById = new Map(bcLigneRows.map((row) => [row.id, row]));

  const statutByDossier = new Map(
    statutRows.map((row) => [
      dossierKey(row.n_doss_4d, row.n_doss_erp),
      { statut: row.statut, datePrevueReception: row.date_prevue_reception },
    ])
  );

  const byDossier = new Map<string, ImportRow[]>();
  for (const row of rows) {
    const key = dossierKey(row.n_doss_4d_import, row.n_doss_erp_import);
    const list = byDossier.get(key) ?? [];
    list.push(row);
    byDossier.set(key, list);
  }

  const groups: DossierGroup[] = [...byDossier.entries()]
    .map(([key, groupRows]) => {
      const first = groupRows[0];
      const statutInfo = statutByDossier.get(key);
      // Une Reception cree sa propre ligne dans bons_commande_mp_imports
      // (pour l'historique), avec le meme dossier - il ne faut pas la
      // recompter dans "Qte importee"/"Nb articles" en plus du "Creer
      // import" qui l'a fait arriver, sinon les totaux doublent des qu'on
      // receptionne (ex: 50 importes + 50 receptionnes affichait 100).
      const arrivalRows = groupRows.filter((row) => row.lot_stock_id === null);
      const bcLignes = groupRows.map((row) => bcLigneById.get(row.bc_ligne_id)).filter(Boolean) as BcLigneInfo[];
      return {
        nDoss4d: first.n_doss_4d_import,
        nDossErp: first.n_doss_erp_import,
        nbArticles: new Set(arrivalRows.map((row) => row.bc_ligne_id)).size,
        quantiteTotale: arrivalRows.reduce((sum, row) => sum + Number(row.quantite_importee ?? 0), 0),
        dateRecente: groupRows.reduce<string | null>((latest, row) => {
          if (!row.date_import) return latest;
          if (!latest || row.date_import > latest) return row.date_import;
          return latest;
        }, null),
        statut: statutInfo?.statut ?? STATUT_DOSSIER_MP_OPTIONS[0],
        datePrevueReception: statutInfo?.datePrevueReception ?? null,
        codes: [...new Set(bcLignes.map((ligne) => ligne.code))],
        articles: [...new Set(bcLignes.map((ligne) => ligne.article_label).filter((label): label is string => Boolean(label)))],
      };
    })
    .filter((group) => {
      if (statutFilter.length > 0 && !statutFilter.includes(group.statut)) return false;
      if (codeFilter && !group.codes.some((code) => code.toLowerCase().includes(codeFilter))) return false;
      if (dossErpFilter && !(group.nDossErp || "").toLowerCase().includes(dossErpFilter)) return false;
      if (doss4dFilter && !(group.nDoss4d || "").toLowerCase().includes(doss4dFilter)) return false;
      if (articleFilter && !group.articles.some((article) => matchesArticleSearch(article, articleFilter))) {
        return false;
      }
      if (dateDebutFilter && (!group.dateRecente || group.dateRecente < dateDebutFilter)) return false;
      if (dateFinFilter && (!group.dateRecente || group.dateRecente > dateFinFilter)) return false;
      return true;
    })
    .sort((a, b) => (b.dateRecente ?? "").localeCompare(a.dateRecente ?? ""));

  const articleOptions = [
    ...new Set(
      bcLigneRows
        .map((row) => row.article_label)
        .filter((label): label is string => Boolean(label))
    ),
  ].map((label, index) => ({ id: index, label }));

  const codeOptions = [...new Set(bcLigneRows.map((row) => row.code))].map((label, index) => ({
    id: index,
    label,
  }));

  const dossErpOptions = [
    ...new Set(rows.map((row) => row.n_doss_erp_import).filter((label): label is string => Boolean(label))),
  ].map((label, index) => ({ id: index, label }));

  const doss4dOptions = [
    ...new Set(rows.map((row) => row.n_doss_4d_import).filter((label): label is string => Boolean(label))),
  ].map((label, index) => ({ id: index, label }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Import MP</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Vue calculee : regroupe automatiquement les imports enregistres depuis les BC qui
              partagent le meme dossier 4D / ERP.
            </p>
          </div>

          <div className="no-print flex flex-wrap gap-3">
            <BackButton href="/stock/matiere-premiere" label="Retour gestion stock MP" />
            <RefreshButton />
            <Link
              href="/stock/matiere-premiere/commande/prix"
              className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Prix des lots
            </Link>
            {groups.length > 0 ? <SimplePrintButton label="Imprimer la liste" /> : null}
          </div>
        </div>

        <section className="no-print rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <form className="grid gap-3 sm:grid-cols-3">
            <SearchableFilterInput
              name="article"
              defaultValue={params.article || ""}
              options={articleOptions}
              placeholder="Article"
            />
            <SearchableFilterInput
              name="code"
              defaultValue={params.code || ""}
              options={codeOptions}
              placeholder="N commande (BC...)"
            />
            <SearchableFilterInput
              name="doss_erp"
              defaultValue={params.doss_erp || ""}
              options={dossErpOptions}
              placeholder="Doss. ERP"
            />
            <SearchableFilterInput
              name="doss_4d"
              defaultValue={params.doss_4d || ""}
              options={doss4dOptions}
              placeholder="Doss. 4D"
            />
            <fieldset className="rounded-2xl border border-slate-200 px-4 py-2.5">
              <legend className="px-1 text-xs font-semibold text-slate-500">
                Statut (plusieurs possibles)
              </legend>
              <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
                {STATUT_DOSSIER_MP_OPTIONS.map((option) => (
                  <label key={option} className="flex items-center gap-1.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      name="statut"
                      value={option}
                      defaultChecked={statutFilter.includes(option)}
                    />
                    {option}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Date recente depuis
              <input
                type="date"
                name="date_debut"
                defaultValue={params.date_debut || ""}
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-normal normal-case text-slate-900 outline-none"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Date recente jusqu&apos;au
              <input
                type="date"
                name="date_fin"
                defaultValue={params.date_fin || ""}
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-normal normal-case text-slate-900 outline-none"
              />
            </label>
            <div className="flex items-end gap-3">
              <button
                type="submit"
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
              >
                Filtrer
              </button>
              {hasFilters ? (
                <Link
                  href="/stock/matiere-premiere/commande"
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
                >
                  Effacer
                </Link>
              ) : null}
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {error ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : groups.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              {hasFilters ? "Aucun resultat pour ce filtre." : "Aucun import pour le moment."}
            </div>
          ) : (
            <div className="max-h-[75vh] overflow-auto">
              <table className="print-readable-table min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Doss. 4D</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Doss. ERP</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Nb articles</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Qte importee</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Date recente</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Statut</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Date prevue reception</th>
                    {canEdit || canDelete ? (
                      <th className="no-print sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Action</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => {
                    const dossierId = encodeDossierId(group.nDoss4d, group.nDossErp);
                    // Statut final, mis automatiquement par la Reception - le
                    // serveur (updateDossierMpStatutAction) refuse deja toute
                    // modification a ce stade, on evite juste d'afficher un
                    // formulaire qui echouerait.
                    const dossierIsLocked = group.statut === STATUT_DOSSIER_MP_OPTIONS[STATUT_DOSSIER_MP_OPTIONS.length - 1];

                    return (
                      <tr key={dossierId} className="border-t border-slate-100">
                        <td className="px-6 py-4 font-semibold">
                          <Link
                            href={`/stock/matiere-premiere/commande/${dossierId}`}
                            className="text-sky-700 underline"
                          >
                            {group.nDoss4d || "Sans dossier"}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-slate-600">{group.nDossErp || "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{group.nbArticles}</td>
                        <td className="px-6 py-4 text-slate-900">{group.quantiteTotale}</td>
                        <td className="px-6 py-4 text-slate-600">{formatDate(group.dateRecente)}</td>
                        <td className="px-6 py-4">
                          {canEdit && !dossierIsLocked ? (
                            <>
                              {/* Formulaire editable, jamais imprime (voir le
                                  span.print-only juste apres pour la version
                                  texte imprimable). */}
                              <form
                                action={updateDossierMpStatutAction}
                                className="no-print flex flex-wrap items-center gap-2"
                              >
                                <input type="hidden" name="n_doss_4d" value={group.nDoss4d ?? ""} />
                                <input type="hidden" name="n_doss_erp" value={group.nDossErp ?? ""} />
                                {/* Ce formulaire ne touche que le statut, mais l'action ecrit
                                    aussi date_prevue_reception - sans ce champ cache, valider ici
                                    effacait la date deja saisie (elle arrivait "absente" du
                                    formData, donc convertie en null). */}
                                <input
                                  type="hidden"
                                  name="date_prevue_reception"
                                  value={group.datePrevueReception ?? ""}
                                />
                                <select
                                  name="statut"
                                  defaultValue={group.statut}
                                  className={`rounded-full border-none px-3 py-1 text-xs font-semibold outline-none ${statutDossierMpBadgeClass(
                                    group.statut
                                  )}`}
                                >
                                  {STATUT_DOSSIER_MP_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                                <SubmitButton className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-800">
                                  OK
                                </SubmitButton>
                                {/* Date deja enregistree, affichee ici (a cote du statut, pas
                                    seulement dans la colonne Date plus loin) pour confirmer
                                    d'un coup d'oeil, sans chercher, que "OK" a bien sauvegarde
                                    la date sur CE dossier precis - la liste se retrie par date
                                    recente a chaque enregistrement, ce qui deplace les lignes. */}
                                <span className="w-full text-xs text-slate-500">
                                  Date prevue :{" "}
                                  {group.datePrevueReception ? formatDate(group.datePrevueReception) : "non saisie"}
                                </span>
                              </form>
                              <span
                                className={`print-only rounded-full px-3 py-1 text-xs font-semibold ${statutDossierMpBadgeClass(
                                  group.statut
                                )}`}
                              >
                                {group.statut}
                              </span>
                            </>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${statutDossierMpBadgeClass(
                                  group.statut
                                )}`}
                              >
                                {group.statut}
                              </span>
                              <span className="w-full text-xs text-slate-500">
                                Date prevue :{" "}
                                {group.datePrevueReception ? formatDate(group.datePrevueReception) : "non saisie"}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {/* Contrairement au Statut, la date prevue reste modifiable
                              meme apres "Receptionne Rodis" - c'est une info
                              administrative (pas une etape du workflow), et un
                              dossier verrouille AVANT d'avoir eu sa date saisie ne
                              doit jamais rester bloque a "-" pour toujours. */}
                          {canEdit ? (
                            <>
                              <form
                                action={updateDossierMpStatutAction}
                                className="no-print flex items-center gap-2"
                              >
                                <input type="hidden" name="n_doss_4d" value={group.nDoss4d ?? ""} />
                                <input type="hidden" name="n_doss_erp" value={group.nDossErp ?? ""} />
                                <input type="hidden" name="statut" value={group.statut} />
                                <DateJmaFormField
                                  name="date_prevue_reception"
                                  defaultValue={group.datePrevueReception}
                                />
                                <SubmitButton className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-800">
                                  OK
                                </SubmitButton>
                              </form>
                              <span className="print-only text-slate-600">
                                {formatDate(group.datePrevueReception)}
                              </span>
                            </>
                          ) : (
                            <span className="text-slate-600">{formatDate(group.datePrevueReception)}</span>
                          )}
                        </td>
                        {canDelete ? (
                          <td className="no-print px-6 py-4">
                            <form action={deleteDossierImportsAction}>
                              <input type="hidden" name="n_doss_4d" value={group.nDoss4d ?? ""} />
                              <input type="hidden" name="n_doss_erp" value={group.nDossErp ?? ""} />
                              <DeleteIconButton label="Supprimer ce dossier" />
                            </form>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
