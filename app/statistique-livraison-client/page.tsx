import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { lireListeParam } from "@/lib/filtre-multiple";

type SearchParams = Promise<{
  client?: string;
  // plusieurs mois possibles : ?mois=2026-09&mois=2026-10
  mois?: string | string[];
}>;

type CommandeRow = {
  id: number;
  client: string | null;
  statut: string | null;
  commentaire: string | null;
  created_at: string | null;
  commande_lignes: { quantite_demandee: number | null }[] | null;
  fifo_resultats: { quantite_chargee: number | null }[] | null;
};

type ClientStat = {
  client: string;
  cree: number;
  livree: number;
  livreeRapide: number;
  // cartons demandes sur les commandes ecrites, et cartons charges sur celles qui sont livrees
  qtCommandee: number;
  qtLivree: number;
};

const MOIS = ["Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin", "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre"];

function libelleMois(cle: string) {
  const [annee, mois] = cle.split("-");
  return `${MOIS[Number(mois) - 1] ?? mois} ${annee}`;
}

function nombre(valeur: number) {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function extractTransitionDate(commentaire: string | null | undefined, transitionKey: string) {
  if (!commentaire) return "";

  const parts = commentaire.split("|").map((part) => part.trim());
  const token = parts.find((part) => part.startsWith(`DATE_TRANSITION_${transitionKey}:`));
  return token ? token.replace(`DATE_TRANSITION_${transitionKey}:`, "").trim() : "";
}

function daysBetween(fromValue: string, toValue: string) {
  const fromDate = new Date(fromValue);
  const toDate = new Date(toValue);
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
}

async function fetchAllCommandesForStatistiqueLivraisonClient() {
  const rows: CommandeRow[] = [];
  let from = 0;
  const pageSize = 1000;

  // PostgREST plafonne chaque requete a ~1000 lignes quel que soit le
  // nombre demande - sans cette boucle, les commandes au-dela de la
  // 1000e (triees par client) etaient invisibles dans les stats.
  // Les quantites (lignes de la commande = demande, fifo_resultats = charge)
  // viennent dans la meme requete : les lignes imbriquees ne sont pas
  // plafonnees, seules les commandes le sont.
  while (true) {
    const { data, error } = await supabaseServer
      .from("commandes")
      .select("id, client, statut, commentaire, created_at, commande_lignes(quantite_demandee), fifo_resultats(quantite_chargee)")
      .order("client", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) return { data: rows, error };

    const chunk = (data as unknown as CommandeRow[] | null) ?? [];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { data: rows, error: null };
}

export default async function StatistiqueLivraisonClientPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const clientQuery = (params.client || "").trim();
  const moisChoisis = lireListeParam(params.mois).filter((cle) => /^\d{4}-\d{2}$/.test(cle));
  const moisChoisisSet = new Set(moisChoisis);

  const { data, error } = await fetchAllCommandesForStatistiqueLivraisonClient();

  const allCommandes = (data as CommandeRow[] | null) ?? [];

  // Mois proposes : tous ceux ou une commande a ete ecrite (du plus ancien au plus recent), plus ceux deja coches
  const moisOptions = [
    ...new Set([
      ...allCommandes.map((commande) => String(commande.created_at || "").slice(0, 7)).filter((cle) => /^\d{4}-\d{2}$/.test(cle)),
      ...moisChoisis,
    ]),
  ].sort();

  const commandes = allCommandes.filter((commande) => {
    if (clientQuery && !String(commande.client || "").toLowerCase().includes(clientQuery.toLowerCase())) {
      return false;
    }
    if (moisChoisisSet.size > 0 && !moisChoisisSet.has(String(commande.created_at || "").slice(0, 7))) {
      return false;
    }
    return true;
  });

  const statsByClient = new Map<string, ClientStat>();

  function getClientStat(client: string) {
    const current = statsByClient.get(client) ?? {
      client,
      cree: 0,
      livree: 0,
      livreeRapide: 0,
      qtCommandee: 0,
      qtLivree: 0,
    };
    statsByClient.set(client, current);
    return current;
  }

  for (const commande of commandes) {
    const client = String(commande.client || "").trim() || "Sans nom";
    const stat = getClientStat(client);
    stat.cree += 1;
    stat.qtCommandee += (commande.commande_lignes ?? []).reduce((somme, ligne) => somme + Number(ligne.quantite_demandee ?? 0), 0);

    const statut = String(commande.statut || "").toUpperCase();
    if (statut !== "LIVREE") continue;

    stat.livree += 1;
    stat.qtLivree += (commande.fifo_resultats ?? []).reduce((somme, ligne) => somme + Number(ligne.quantite_chargee ?? 0), 0);

    const standDate = extractTransitionDate(commande.commentaire, "STAND_ENCOURS");
    const blDate = extractTransitionDate(commande.commentaire, "ENCOURS_BLTRANSFORME");

    if (standDate && blDate) {
      const jours = daysBetween(standDate, blDate);
      if (jours >= 0 && jours < 10) {
        stat.livreeRapide += 1;
      }
    }
  }

  const clients = [...statsByClient.values()].sort((a, b) => b.cree - a.cree);
  const total = clients.reduce(
    (somme, client) => ({
      cree: somme.cree + client.cree,
      livree: somme.livree + client.livree,
      livreeRapide: somme.livreeRapide + client.livreeRapide,
      qtCommandee: somme.qtCommandee + client.qtCommandee,
      qtLivree: somme.qtLivree + client.qtLivree,
    }),
    { cree: 0, livree: 0, livreeRapide: 0, qtCommandee: 0, qtLivree: 0 }
  );
  const clientOptions = [
    ...new Set(allCommandes.map((commande) => String(commande.client || "").trim()).filter(Boolean)),
  ].map((label, index) => ({ id: index, label }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f9ff_0%,#fbfdff_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-fuchsia-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Statistique livraison client
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Commandes ecrites, livrees et livrees rapidement (moins de 10 jours hors stand), par
                client, avec la quantite commandee et la quantite livree. Coche un ou plusieurs mois : tout est calcule sur les commandes ecrites
                dans ces mois (quantite livree = ce qui a ete charge sur celles qui sont livrees).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/statistique" label="Retour" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[2fr_auto_auto]">
              <SearchableFilterInput
                name="client"
                defaultValue={clientQuery}
                options={clientOptions}
                placeholder="Filtrer par client..."
              />
              <button
                type="submit"
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Filtrer
              </button>
              <Link
                href="/statistique-livraison-client"
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Effacer
              </Link>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-slate-700">
                Mois <span className="font-normal text-slate-500">(coche un ou plusieurs mois, puis Filtrer - rien de coche = tous les mois)</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {moisOptions.map((cle) => (
                  <label
                    key={cle}
                    className="flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 has-[:checked]:border-sky-300 has-[:checked]:bg-sky-50 has-[:checked]:font-semibold has-[:checked]:text-sky-900"
                  >
                    <input type="checkbox" name="mois" value={cle} defaultChecked={moisChoisisSet.has(cle)} className="h-4 w-4" />
                    {libelleMois(cle)}
                  </label>
                ))}
              </div>
            </fieldset>
          </form>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {error ? (
            <div className="p-6">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : clients.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">Aucune commande trouvee.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Client</th>
                    <th className="px-4 py-3 font-semibold">Commandes ecrites</th>
                    <th className="px-4 py-3 font-semibold">Commandes livrees</th>
                    <th className="px-4 py-3 font-semibold">Livrees en moins de 10j (hors stand)</th>
                    <th className="px-4 py-3 font-semibold">Livrees / ecrites</th>
                    <th className="px-4 py-3 text-right font-semibold">Qt commandee</th>
                    <th className="px-4 py-3 text-right font-semibold">Qt livree</th>
                    <th className="px-4 py-3 text-right font-semibold">Qt livree / commandee</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => {
                    const ratio =
                      client.cree > 0 ? Math.round((client.livree / client.cree) * 100) : null;
                    const ratioQt =
                      client.qtCommandee > 0 ? Math.round((client.qtLivree / client.qtCommandee) * 100) : null;

                    return (
                      <tr key={client.client} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-semibold text-slate-900">{client.client}</td>
                        <td className="px-4 py-3 text-slate-900">{client.cree}</td>
                        <td className="px-4 py-3 font-semibold text-emerald-700">{client.livree}</td>
                        <td className="px-4 py-3 text-slate-900">{client.livreeRapide}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {ratio === null ? "-" : `${ratio}%`}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-900">{nombre(client.qtCommandee)}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-700">{nombre(client.qtLivree)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                          {ratioQt === null ? "-" : `${ratioQt}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-900">
                    <td className="px-4 py-3">Total{moisChoisis.length > 0 ? ` (${moisChoisis.length} mois)` : ""}</td>
                    <td className="px-4 py-3">{total.cree}</td>
                    <td className="px-4 py-3 text-emerald-700">{total.livree}</td>
                    <td className="px-4 py-3">{total.livreeRapide}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {total.cree > 0 ? `${Math.round((total.livree / total.cree) * 100)}%` : "-"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{nombre(total.qtCommandee)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{nombre(total.qtLivree)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {total.qtCommandee > 0 ? `${Math.round((total.qtLivree / total.qtCommandee) * 100)}%` : "-"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
