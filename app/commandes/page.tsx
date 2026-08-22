import Link from "next/link";
import {
  cancelFifoBatchAction,
  changeCommandeStatusAction,
  creerEcritureVente,
  deleteProformaGroupAction,
  togglePretStockAction,
} from "./actions";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { supabaseServer } from "@/lib/supabase-server";
import {
  canChangeStatusCommandesUser,
  canDeleteCommandesUser,
  canVoirPrixUser,
  canWritePageUser,
  getCurrentStockUser,
} from "@/lib/stock-auth";
import { formatDate } from "@/lib/format-date";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { PretStockToggle } from "./pret-stock-toggle";
import { fetchCoutsParCartonProduitsFinis } from "@/lib/prix-revient";
import { fetchDimensionsProduitsFinis, volumeCartonM3 } from "@/lib/dimensions-produit";

type SearchParams = Promise<{
  q?: string;
  statut?: string;
  avertissement?: string;
}>;

type CommandeListRow = {
  id: number;
  numero_proforma: string;
  client: string;
  statut: string;
  commentaire: string | null;
  mode_chargement: string | null;
  type_tc: string | null;
  created_at: string | null;
};

type CommandeRow = CommandeListRow & {
  lignes_count: number;
  carton_total: number;
  prix_total: number | null;
  prix_incomplet: boolean;
  volume_total: number | null;
  poids_total: number | null;
  dimensions_incomplet: boolean;
};

type ProformaGroup = {
  numeroProforma: string;
  client: string;
  modeChargement: string | null;
  createdAt: string | null;
  rows: CommandeRow[];
  statusCounts: { statut: string; count: number }[];
  openTargetId: number;
  pretStock: boolean;
  pretStockDate: string;
};

function extractTransitionDate(commentaire: string | null | undefined, transitionKey: string) {
  if (!commentaire) return "";

  const parts = commentaire.split("|").map((part) => part.trim());
  const token = parts.find((part) => part.startsWith(`DATE_TRANSITION_${transitionKey}:`));
  return token ? token.replace(`DATE_TRANSITION_${transitionKey}:`, "").trim() : "";
}

// Meme encodage que upsertPretStockComment cote actions.ts - lu ici depuis
// le commentaire du 1er camion de la proforma (togglePretStockAction marque
// toujours tous les camions freres a l'identique).
function extractPretStock(commentaire: string | null | undefined) {
  if (!commentaire) return { checked: false, date: "" };

  const parts = commentaire.split("|").map((part) => part.trim());
  const checked = parts.includes("PRET_STOCK:oui");
  const dateToken = parts.find((part) => part.startsWith("PRET_STOCK_DATE:"));
  const date = dateToken ? dateToken.replace("PRET_STOCK_DATE:", "").trim() : "";
  return { checked, date };
}

function formatStatus(value: string | null) {
  const status = (value || "").toUpperCase();

  if (status === "LIVREE") return "Livree";
  if (status === "BL_TRANSFORME") return "BL transforme";
  if (status === "STAND") return "Stand";
  if (status === "EN_COURS") return "En cours";
  if (status === "FIFO_PARTIEL") return "En cours";
  if (status === "FIFO_CALCULE") return "En cours";
  if (status === "SAISIE_WEB") return "En cours";

  return value || "-";
}

function statusClasses(value: string | null) {
  const status = (value || "").toUpperCase();

  if (status === "LIVREE") {
    return "bg-emerald-50 text-emerald-900";
  }

  if (status === "BL_TRANSFORME") {
    return "bg-green-100 text-green-900";
  }

  if (status === "STAND") {
    return "bg-amber-50 text-amber-900";
  }

  return "bg-sky-50 text-sky-900";
}

// Sibling trucks are stored as "<proforma>-2", "<proforma>-3"... to satisfy
// the unique constraint on numero_proforma - strip that so the user only
// ever sees the plain number.
function getBaseProforma(numeroProforma: string) {
  return numeroProforma.replace(/-\d+$/, "");
}

// Liste complete (non filtree, non paginee) des valeurs distinctes de
// numero_proforma / client - separee de la requete principale (limit 300,
// filtree par q/statut) pour alimenter le menu de recherche avec toutes les
// commandes existantes.
async function fetchAllDistinctCommandeValues(column: "numero_proforma" | "client") {
  const values = new Set<string>();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("commandes")
      .select(column)
      .range(from, from + pageSize - 1);

    if (error) return { values: [...values], error };

    const chunk = (data ?? []) as Record<string, string | null>[];
    for (const row of chunk) {
      const value = row[column];
      if (value) values.add(value);
    }

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { values: [...values], error: null };
}

// Pour savoir sur quelles commandes montrer "Annuler dispatch" directement
// depuis la liste (sans devoir ouvrir chaque commande) - une commande est
// "dispatchee" des qu'elle a au moins une ligne fifo_resultats.
async function fetchDispatchedCommandeIds(commandeIds: number[]): Promise<Set<number>> {
  const dispatched = new Set<number>();
  if (commandeIds.length === 0) return dispatched;

  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("fifo_resultats")
      .select("commande_id")
      .in("commande_id", commandeIds)
      // Meme correctif d'ordre stable que sur la page detail (voir
      // fetchStockGroupsByArticle) - evite de sauter des lignes entre 2
      // pages sur une table active.
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data as { commande_id: number }[] | null) ?? [];
    for (const row of chunk) dispatched.add(row.commande_id);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return dispatched;
}

// Toutes les lignes de commande pour ces commandes (pagine par 1000 -
// Supabase plafonne silencieusement une requete sans .range() a 1000
// lignes, ce qui faisait disparaitre Lignes/Total carton/Prix/Volume/Poids
// sur des commandes entieres des que le total de lignes depassait 1000).
async function fetchAllCommandeLignes(
  commandeIds: number[]
): Promise<{ commande_id: number; article_id: number | null; quantite_demandee: number | null }[]> {
  const rows: { commande_id: number; article_id: number | null; quantite_demandee: number | null }[] = [];
  if (commandeIds.length === 0) return rows;

  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("commande_lignes")
      .select("commande_id, article_id, quantite_demandee")
      .in("commande_id", commandeIds)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk =
      (data as { commande_id: number; article_id: number | null; quantite_demandee: number | null }[] | null) ?? [];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

export default async function CommandesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const currentStockUser = await getCurrentStockUser();
  const canWriteCommandes = await canWritePageUser(currentStockUser, "commandesNouvelle");
  // Meme permission que le bouton "Annuler batch" de la page detail
  // (requireCommandesEditAccess verifie "commandesDetail", pas
  // "commandesNouvelle" utilise juste au-dessus pour "Ajouter commande").
  const canEditCommandeDetail = await canWritePageUser(currentStockUser, "commandesDetail");
  const canDeleteCommandes = await canDeleteCommandesUser(currentStockUser);
  const canChangeStatusCommandes = await canChangeStatusCommandesUser(currentStockUser);
  const canVoirPrix = await canVoirPrixUser(currentStockUser);
  const params = await searchParams;
  const q = (params.q || "").trim();
  const statut = (params.statut || "").trim().toUpperCase();
  const avertissement = params.avertissement || "";

  let commandesQuery = supabaseServer
    .from("commandes")
    .select("id, numero_proforma, client, statut, commentaire, mode_chargement, type_tc, created_at")
    .order("id", { ascending: false });

  if (q) {
    commandesQuery = commandesQuery.or(`numero_proforma.ilike.%${q}%,client.ilike.%${q}%`);
  }

  if (statut) {
    commandesQuery = commandesQuery.eq("statut", statut);
  }

  const [{ data, error }, { values: proformaValues }, { values: clientValues }] = await Promise.all([
    commandesQuery.limit(300),
    fetchAllDistinctCommandeValues("numero_proforma"),
    fetchAllDistinctCommandeValues("client"),
  ]);
  const searchOptions = [...new Set([...proformaValues, ...clientValues])].map((label, index) => ({
    id: index,
    label,
  }));
  const commandeListRows = (data as CommandeListRow[] | null) ?? [];
  const commandeIds = commandeListRows.map((commande) => commande.id);

  // Auto-guerison silencieuse - aucun bouton, aucune page a part : parmi les
  // commandes LIVREE affichees ici, celles qui ont deja un resultat FIFO
  // (donc une vraie sortie de stock) mais aucune ecriture Vente recreent la
  // leur toutes seules a chaque chargement de cette liste. Couvre le cas ou
  // meme les 3 tentatives de deliverCommandeAction ont echoue - la commande
  // ne reste jamais durablement sans ecriture tant que quelqu'un revoit
  // cette liste.
  const livreeIds = commandeListRows.filter((c) => (c.statut || "").toUpperCase() === "LIVREE").map((c) => c.id);
  if (livreeIds.length > 0) {
    const [{ data: fifoPresenceData }, { data: ecrituresExistantesData }] = await Promise.all([
      supabaseServer.from("fifo_resultats").select("commande_id").in("commande_id", livreeIds),
      supabaseServer
        .from("ecritures_comptables")
        .select("source_id")
        .eq("source_type", "commande_vente")
        .in("source_id", livreeIds.map(String)),
    ]);
    const aVraimentLivre = new Set(
      ((fifoPresenceData ?? []) as { commande_id: number | null }[]).map((r) => r.commande_id).filter(Boolean)
    );
    const dejaFacture = new Set(((ecrituresExistantesData ?? []) as { source_id: string }[]).map((r) => r.source_id));
    const aGuerir = livreeIds.filter((id) => aVraimentLivre.has(id) && !dejaFacture.has(String(id)));
    if (aGuerir.length > 0) {
      await Promise.all(
        aGuerir.map((id) =>
          creerEcritureVente(id, currentStockUser).catch((err) =>
            console.error(`Auto-guerison vente echouee (${id}):`, err)
          )
        )
      );
    }
  }

  // La liste affiche compte de lignes + total carton + prix total par
  // commande - il faut donc aussi l'article_id de chaque ligne (pas juste
  // quantite_demandee) pour chiffrer le prix (cout par carton, voir
  // lib/prix-revient.ts) par article commande.
  const [lignesRows, dispatchedCommandeIds] = await Promise.all([
    fetchAllCommandeLignes(commandeIds),
    fetchDispatchedCommandeIds(commandeIds),
  ]);

  const articleIdsPourLignes = lignesRows.map((row) => row.article_id).filter((id): id is number => id !== null);
  // Le cout de revient (FEFO + recette, reellement couteux - voir le meme
  // correctif sur /comptabilite/prix-vente) n'alimente QUE la colonne "Prix",
  // deja masquee sans canVoirPrix - jamais calcule pour rien quand personne
  // ne peut de toute facon la voir.
  const [coutsParCarton, dimensionsParArticle] = await Promise.all([
    canVoirPrix ? fetchCoutsParCartonProduitsFinis(articleIdsPourLignes) : Promise.resolve(new Map()),
    fetchDimensionsProduitsFinis(articleIdsPourLignes),
  ]);

  const lignesCountByCommande = new Map<number, number>();
  const cartonTotalByCommande = new Map<number, number>();
  const prixTotalByCommande = new Map<number, number>();
  const prixIncompletByCommande = new Map<number, boolean>();
  const volumeTotalByCommande = new Map<number, number>();
  const poidsTotalByCommande = new Map<number, number>();
  const dimensionsIncompletByCommande = new Map<number, boolean>();
  for (const row of lignesRows) {
    lignesCountByCommande.set(
      row.commande_id,
      (lignesCountByCommande.get(row.commande_id) ?? 0) + 1
    );
    cartonTotalByCommande.set(
      row.commande_id,
      (cartonTotalByCommande.get(row.commande_id) ?? 0) + Number(row.quantite_demandee ?? 0)
    );

    const coutInfo = row.article_id !== null ? coutsParCarton.get(row.article_id) : undefined;
    if (coutInfo?.coutParCarton !== null && coutInfo?.coutParCarton !== undefined) {
      prixTotalByCommande.set(
        row.commande_id,
        (prixTotalByCommande.get(row.commande_id) ?? 0) + Number(row.quantite_demandee ?? 0) * coutInfo.coutParCarton
      );
    } else {
      prixIncompletByCommande.set(row.commande_id, true);
    }

    const dim = row.article_id !== null ? dimensionsParArticle.get(row.article_id) : undefined;
    const volumeCarton = volumeCartonM3(dim);
    if (volumeCarton !== null) {
      volumeTotalByCommande.set(
        row.commande_id,
        (volumeTotalByCommande.get(row.commande_id) ?? 0) + Number(row.quantite_demandee ?? 0) * volumeCarton
      );
    } else {
      dimensionsIncompletByCommande.set(row.commande_id, true);
    }
    if (dim?.poidsBrut !== null && dim?.poidsBrut !== undefined) {
      poidsTotalByCommande.set(
        row.commande_id,
        (poidsTotalByCommande.get(row.commande_id) ?? 0) + Number(row.quantite_demandee ?? 0) * dim.poidsBrut
      );
    } else {
      dimensionsIncompletByCommande.set(row.commande_id, true);
    }
  }

  const commandes: CommandeRow[] = commandeListRows.map((commande) => ({
    ...commande,
    lignes_count: lignesCountByCommande.get(commande.id) ?? 0,
    carton_total: cartonTotalByCommande.get(commande.id) ?? 0,
    prix_total: prixTotalByCommande.has(commande.id) ? (prixTotalByCommande.get(commande.id) as number) : null,
    prix_incomplet: prixIncompletByCommande.get(commande.id) ?? false,
    volume_total: volumeTotalByCommande.has(commande.id) ? (volumeTotalByCommande.get(commande.id) as number) : null,
    poids_total: poidsTotalByCommande.has(commande.id) ? (poidsTotalByCommande.get(commande.id) as number) : null,
    dimensions_incomplet: dimensionsIncompletByCommande.get(commande.id) ?? false,
  }));

  // One truck/container = one commande row (see createManualCommandeAction),
  // all sharing the same numero_proforma - group them back into a single
  // list row so the list reads as "1 order" while each truck still keeps
  // its own status and can be delivered independently.
  const groupsByProforma = new Map<string, CommandeRow[]>();
  for (const commande of commandes) {
    const baseProforma = getBaseProforma(commande.numero_proforma);
    const group = groupsByProforma.get(baseProforma) ?? [];
    group.push(commande);
    groupsByProforma.set(baseProforma, group);
  }

  const proformaGroups: ProformaGroup[] = [...groupsByProforma.entries()].map(
    ([numeroProforma, rows]) => {
      const statusOrder = ["EN_COURS", "STAND", "BL_TRANSFORME", "LIVREE"];
      const countsByStatus = new Map<string, number>();
      for (const row of rows) {
        const key = row.statut || "EN_COURS";
        countsByStatus.set(key, (countsByStatus.get(key) ?? 0) + 1);
      }
      const statusCounts = [...countsByStatus.entries()]
        .sort((a, b) => statusOrder.indexOf(a[0]) - statusOrder.indexOf(b[0]))
        .map(([statut, count]) => ({ statut, count }));

      const openTarget = rows.find((row) => row.statut !== "LIVREE") ?? rows[0];
      const createdAt = rows.reduce<string | null>((earliest, row) => {
        if (!row.created_at) return earliest;
        if (!earliest) return row.created_at;
        return row.created_at < earliest ? row.created_at : earliest;
      }, null);
      const pretStockInfo = extractPretStock(rows[0]?.commentaire);

      return {
        numeroProforma,
        client: rows[0].client,
        modeChargement: rows[0].mode_chargement,
        createdAt,
        rows,
        statusCounts,
        openTargetId: openTarget.id,
        pretStock: pretStockInfo.checked,
        pretStockDate: pretStockInfo.date,
      };
    }
  );

  proformaGroups.sort((a, b) => Math.max(...b.rows.map((r) => r.id)) - Math.max(...a.rows.map((r) => r.id)));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#eef6ff_0%,#f8fbff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Commandes
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Liste simple des commandes avec date d&apos;enregistrement et statut.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <BackButton href="/" label="Retour accueil" />
              <RefreshButton />
              {canWriteCommandes ? (
                <Link
                  href="/commandes/nouvelle"
                  className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white"
                >
                  Ajouter commande
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        {avertissement ? (
          <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50 px-6 py-4 text-sm font-semibold text-amber-800">
            {avertissement}
          </section>
        ) : null}

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <form className="grid gap-3 md:grid-cols-[2fr_1fr_auto_auto]">
            <SearchableFilterInput
              name="q"
              defaultValue={q}
              options={searchOptions}
              placeholder="Chercher proforma ou client..."
            />
            <select
              name="statut"
              defaultValue={statut}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            >
              <option value="">Tous statuts</option>
              <option value="EN_COURS">En cours</option>
              <option value="STAND">Stand</option>
              <option value="BL_TRANSFORME">BL transforme</option>
              <option value="LIVREE">Livree</option>
            </select>
            <button
              type="submit"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            >
              Filtrer
            </button>
            <Link
              href="/commandes"
              className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
            >
              Effacer
            </Link>
          </form>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-xl font-bold text-slate-900">Liste des commandes</h2>
          </div>

          {error ? (
            <div className="p-6">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : proformaGroups.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">Aucune commande trouvee.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-left text-sm">
                <colgroup>
                  <col style={{ width: "100px" }} />
                  <col style={{ width: "90px" }} />
                  <col style={{ width: "200px" }} />
                  <col style={{ width: "360px" }} />
                  <col style={{ width: "340px" }} />
                  <col style={{ width: "90px" }} />
                  <col style={{ width: "110px" }} />
                  <col style={{ width: "70px" }} />
                  <col style={{ width: "110px" }} />
                  <col style={{ width: "150px" }} />
                  {canVoirPrix ? <col style={{ width: "110px" }} /> : null}
                  <col style={{ width: "120px" }} />
                  <col style={{ width: "170px" }} />
                </colgroup>
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Proforma</th>
                    <th className="px-4 py-3 font-semibold">Client</th>
                    <th className="px-4 py-3 font-semibold">Statut</th>
                    <th className="px-4 py-3 font-semibold">Dates</th>
                    <th className="px-4 py-3 font-semibold">Nb camion</th>
                    <th className="px-4 py-3 font-semibold">Type camion</th>
                    <th className="px-4 py-3 font-semibold">Lignes</th>
                    <th className="px-4 py-3 font-semibold">Total carton</th>
                    {canVoirPrix ? <th className="px-4 py-3 font-semibold">Prix total</th> : null}
                    <th className="px-4 py-3 font-semibold">Volume (m3)</th>
                    <th className="px-4 py-3 font-semibold">Poids brut (kg)</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {proformaGroups.map((group) => (
                    <tr key={group.numeroProforma} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-600">{formatDate(group.createdAt)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/commandes/${group.openTargetId}`}
                            className="truncate hover:text-sky-700"
                          >
                            {group.numeroProforma}
                          </Link>
                          {canChangeStatusCommandes ? (
                            <PretStockToggle
                              numeroProforma={group.numeroProforma}
                              checked={group.pretStock}
                              date={group.pretStockDate}
                              action={togglePretStockAction}
                            />
                          ) : group.pretStock ? (
                            <span
                              className="text-[10px] font-semibold text-emerald-700"
                              title={`Pret en stock depuis le ${formatDate(group.pretStockDate)}`}
                            >
                              ✓ stock
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <Link
                          href={`/commandes?q=${encodeURIComponent(group.client)}`}
                          className="block truncate hover:text-sky-700"
                          title={group.client}
                        >
                          {group.client}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-2">
                          {group.rows.map((row) => (
                            <div key={row.id} className="flex flex-nowrap items-center gap-2">
                              <span
                                className={`w-[128px] shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-left text-xs font-semibold ${statusClasses(
                                  row.statut
                                )}`}
                              >
                                {formatStatus(row.statut)}
                              </span>
                              {canChangeStatusCommandes && (row.statut || "").toUpperCase() !== "LIVREE" ? (
                                (() => {
                                  const rowStatut = (row.statut || "EN_COURS").toUpperCase();
                                  const knownStatuts = ["EN_COURS", "STAND", "BL_TRANSFORME", "LIVREE"];
                                  return (
                                    <form
                                      action={changeCommandeStatusAction}
                                      className="flex flex-nowrap items-center gap-2"
                                    >
                                      <input type="hidden" name="commande_id" value={row.id} />
                                      <select
                                        name="statut"
                                        defaultValue={knownStatuts.includes(rowStatut) ? rowStatut : "EN_COURS"}
                                        className="w-[140px] shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 outline-none"
                                      >
                                        <option value="EN_COURS">En cours</option>
                                        <option value="STAND">Stand</option>
                                        <option value="BL_TRANSFORME">BL transforme</option>
                                        <option value="LIVREE">Livree</option>
                                      </select>
                                      <SubmitButton className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                                        OK
                                      </SubmitButton>
                                    </form>
                                  );
                                })()
                              ) : null}
                              {canEditCommandeDetail &&
                              (row.statut || "").toUpperCase() !== "LIVREE" &&
                              dispatchedCommandeIds.has(row.id) ? (
                                <form action={cancelFifoBatchAction}>
                                  <input type="hidden" name="commande_id" value={row.id} />
                                  <SubmitButton
                                    pendingLabel="Annulation..."
                                    className="shrink-0 rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-semibold text-red-800"
                                  >
                                    Annuler dispatch
                                  </SubmitButton>
                                </form>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div className="flex flex-col gap-2">
                          {group.rows.map((row) => {
                            const standDate = extractTransitionDate(row.commentaire, "STAND_ENCOURS");
                            const blDate = extractTransitionDate(row.commentaire, "ENCOURS_BLTRANSFORME");
                            const livreeDate = extractTransitionDate(row.commentaire, "ENCOURS_LIVREE");

                            return (
                              <div key={row.id} className="flex flex-nowrap gap-3 whitespace-nowrap text-xs leading-5">
                                <span>
                                  <span className="text-slate-400">En cours:</span> {formatDate(standDate || null)}
                                </span>
                                <span>
                                  <span className="text-slate-400">BL:</span> {formatDate(blDate || null)}
                                </span>
                                <span>
                                  <span className="text-slate-400">Livre:</span> {formatDate(livreeDate || null)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {group.rows.length > 1
                          ? group.rows.length
                          : Number(group.rows[0]?.type_tc) || group.rows[0]?.type_tc || "-"}
                      </td>
                      <td className="truncate px-4 py-3 text-slate-600">
                        {group.modeChargement || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div className="flex flex-col gap-2">
                          {group.rows.map((row) => (
                            <div key={row.id} className="whitespace-nowrap">
                              {row.lignes_count}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        <div className="flex flex-col gap-2">
                          {group.rows.map((row) => (
                            <div key={row.id} className="whitespace-nowrap">
                              {row.carton_total}
                            </div>
                          ))}
                        </div>
                      </td>
                      {canVoirPrix ? (
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          <div className="flex flex-col gap-2">
                            {group.rows.map((row) => (
                              <div key={row.id} className="whitespace-nowrap">
                                {row.prix_total !== null
                                  ? `${row.prix_total.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FCFA`
                                  : "-"}
                                {row.prix_incomplet ? (
                                  <span className="ml-1 text-xs font-normal text-amber-700">(partiel)</span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </td>
                      ) : null}
                      <td className="px-4 py-3 text-slate-700">
                        <div className="flex flex-col gap-2">
                          {group.rows.map((row) => (
                            <div key={row.id} className="whitespace-nowrap">
                              {row.volume_total !== null
                                ? row.volume_total.toLocaleString("fr-FR", { maximumFractionDigits: 3 })
                                : "-"}
                              {row.dimensions_incomplet ? (
                                <span className="ml-1 text-xs font-normal text-amber-700">(partiel)</span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <div className="flex flex-col gap-2">
                          {group.rows.map((row) => (
                            <div key={row.id} className="whitespace-nowrap">
                              {row.poids_total !== null
                                ? row.poids_total.toLocaleString("fr-FR", { maximumFractionDigits: 1 })
                                : "-"}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/commandes/${group.openTargetId}`}
                            className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            Ouvrir
                          </Link>
                          {canDeleteCommandes ? (
                            <form action={deleteProformaGroupAction}>
                              <input type="hidden" name="numero_proforma" value={group.numeroProforma} />
                              <DeleteIconButton
                                confirmMessage={`Supprimer toute la commande ${group.numeroProforma} (${group.client}) ? Ca efface les ${group.rows.length} camion${group.rows.length > 1 ? "s" : ""} et tout ce qui a deja ete despatche dessus. Cette action est definitive.`}
                              />
                            </form>
                          ) : null}
                        </div>
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
