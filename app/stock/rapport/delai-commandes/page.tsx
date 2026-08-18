import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";

const DELAI_LIMITE_JOURS = 10;

type CommandeRow = {
  id: number;
  numero_proforma: string | null;
  client: string | null;
  statut: string | null;
  commentaire: string | null;
  created_at: string | null;
};

type MonthStat = {
  monthKey: string;
  camions: number;
  dansLesTemps: number;
  depasse: number;
  sansDonnee: number;
};

type CommandeEnAttente = {
  id: number;
  numeroProforma: string;
  client: string;
  dateEnCours: string;
  jours: number;
  qtCarton: number;
};

// Meme encodage que STATUT_DATE_ dans app/commandes/actions.ts
// (upsertStatusDateComment) - date a laquelle la commande est ENTREE dans ce
// statut (pas la date de creation).
function extractStatusDate(commentaire: string | null | undefined, statusKey: string) {
  if (!commentaire) return "";

  const parts = commentaire.split("|").map((part) => part.trim());
  const token = parts.find((part) => part.startsWith(`STATUT_DATE_${statusKey}:`));
  return token ? token.replace(`STATUT_DATE_${statusKey}:`, "").trim() : "";
}

// Meme encodage que PRET_STOCK_DATE dans app/commandes/actions.ts
// (upsertPretStockComment, case "Pret en stock" sur la liste des commandes).
function extractPretStockDate(commentaire: string | null | undefined) {
  if (!commentaire) return "";

  const parts = commentaire.split("|").map((part) => part.trim());
  if (!parts.includes("PRET_STOCK:oui")) return "";
  const token = parts.find((part) => part.startsWith("PRET_STOCK_DATE:"));
  return token ? token.replace("PRET_STOCK_DATE:", "").trim() : "";
}

function getMonthKey(value: string | null) {
  if (!value) return "";
  return value.slice(0, 7);
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  if (!year || !month) return monthKey;

  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(date);
}

// Meme regroupement que statutBucket dans app/commandes/actions.ts : les
// statuts "techniques" (FIFO_PARTIEL/FIFO_CALCULE/SAISIE_WEB) comptent comme
// "En cours" partout ailleurs dans l'appli (voir aussi formatStatus) - sans
// ca, ces commandes disparaissaient du rapport au lieu d'etre comptees en
// cours.
function statutBucket(value: string | null | undefined) {
  const v = (value || "").toUpperCase();
  return v === "STAND" || v === "BL_TRANSFORME" || v === "LIVREE" ? v : "EN_COURS";
}

function daysBetween(fromValue: string, toValue: string) {
  const fromDate = new Date(`${fromValue.slice(0, 10)}T00:00:00`);
  const toDate = new Date(`${toValue.slice(0, 10)}T00:00:00`);
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
}

async function fetchAllCommandesForDelaiReport() {
  const rows: CommandeRow[] = [];
  let from = 0;
  const pageSize = 1000;

  // Meme correctif de pagination que Statistique livraison - PostgREST
  // plafonne chaque requete a ~1000 lignes.
  while (true) {
    const { data, error } = await supabaseServer
      .from("commandes")
      .select("id, numero_proforma, client, statut, commentaire, created_at")
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) return { data: rows, error };

    const chunk = (data as CommandeRow[] | null) ?? [];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { data: rows, error: null };
}

async function fetchCartonTotalByCommande(commandeIds: number[]) {
  const totals = new Map<number, number>();
  if (commandeIds.length === 0) return totals;

  const { data } = await supabaseServer
    .from("commande_lignes")
    .select("commande_id, quantite_demandee")
    .in("commande_id", commandeIds);

  for (const row of (data as { commande_id: number; quantite_demandee: number | null }[] | null) ?? []) {
    totals.set(row.commande_id, (totals.get(row.commande_id) ?? 0) + Number(row.quantite_demandee ?? 0));
  }

  return totals;
}

export default async function RapportDelaiCommandesPage() {
  const { data, error } = await fetchAllCommandesForDelaiReport();
  const commandes = (data as CommandeRow[] | null) ?? [];
  const todayIso = new Date().toISOString().slice(0, 10);

  const statsByMonth = new Map<string, MonthStat>();
  function getMonthStat(monthKey: string) {
    const current = statsByMonth.get(monthKey) ?? {
      monthKey,
      camions: 0,
      dansLesTemps: 0,
      depasse: 0,
      sansDonnee: 0,
    };
    statsByMonth.set(monthKey, current);
    return current;
  }

  const enAttenteIds: number[] = [];
  const enAttenteBase: { id: number; numeroProforma: string; client: string; dateEnCours: string; jours: number }[] = [];

  for (const commande of commandes) {
    const statut = String(commande.statut || "").toUpperCase();
    const bucket = statutBucket(statut);
    if (bucket === "STAND") continue;

    const monthKey = getMonthKey(commande.created_at);
    if (!monthKey) continue;

    const monthStat = getMonthStat(monthKey);
    monthStat.camions += 1;

    // Repli sur la date de creation quand STATUT_DATE_EN_COURS n'a jamais
    // ete enregistre (ex: commande creee directement en BL/Livree, sans
    // etre passee par un changement de statut qui aurait pose ce marqueur)
    // - une commande a toujours une date de creation, donc plus jamais de
    // "sans donnee" pour ce cas.
    const dateEnCours =
      extractStatusDate(commande.commentaire, "EN_COURS") || (commande.created_at || "").slice(0, 10);
    const datePret = extractPretStockDate(commande.commentaire);

    if (!dateEnCours) {
      monthStat.sansDonnee += 1;
      continue;
    }

    // Pas encore marquee "pret" : on compare a AUJOURD'HUI plutot que de
    // laisser en "sans donnee" - vrai pour n'importe quel statut (BL
    // transforme et Livree compris), pas seulement En cours.
    const referenceFin = datePret || todayIso;
    const jours = daysBetween(dateEnCours, referenceFin);
    const depasse = jours > DELAI_LIMITE_JOURS;

    if (depasse) monthStat.depasse += 1;
    else monthStat.dansLesTemps += 1;

    // Liste actionnable ci-dessous : seulement les commandes ENCORE en
    // cours, pas encore marquees pretes, et deja en retard - avec leur
    // quantite (demande explicite : voir combien de carton est en attente).
    if (!datePret && bucket === "EN_COURS" && depasse) {
      enAttenteIds.push(commande.id);
      enAttenteBase.push({
        id: commande.id,
        numeroProforma: commande.numero_proforma || "-",
        client: commande.client || "-",
        dateEnCours,
        jours,
      });
    }
  }

  const cartonTotalById = await fetchCartonTotalByCommande(enAttenteIds);
  const commandesEnAttente: CommandeEnAttente[] = enAttenteBase
    .map((row) => ({ ...row, qtCarton: cartonTotalById.get(row.id) ?? 0 }))
    .sort((a, b) => b.jours - a.jours);

  const months = [...statsByMonth.values()].sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#eef5f0_0%,#f8fbf8_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Delai commande -&gt; pret
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Camions (en cours / BL transforme / livre) commandes chaque mois, et delai entre
                l&apos;entree en cours et le marquage &quot;pret en stock&quot; sur la liste des
                commandes. Seuil : {DELAI_LIMITE_JOURS} jours.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/stock/rapport" label="Retour rapport PF" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-lg font-bold text-slate-900">Par mois</h2>
          </div>

          {error ? (
            <div className="p-6">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : months.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">Aucune commande trouvee.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Mois</th>
                    <th className="px-4 py-3 font-semibold">Camions</th>
                    <th className="px-4 py-3 font-semibold">Dans les {DELAI_LIMITE_JOURS}j</th>
                    <th className="px-4 py-3 font-semibold">Depasse {DELAI_LIMITE_JOURS}j</th>
                    <th className="px-4 py-3 font-semibold">Sans donnee</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((month) => (
                    <tr key={month.monthKey} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-semibold capitalize text-slate-900">
                        {formatMonthLabel(month.monthKey)}
                      </td>
                      <td className="px-4 py-3 text-slate-900">{month.camions}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-700">{month.dansLesTemps}</td>
                      <td className="px-4 py-3 font-semibold text-red-600">
                        {month.depasse > 0 ? month.depasse : "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{month.sansDonnee > 0 ? month.sansDonnee : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-lg font-bold text-slate-900">
              En attente depuis plus de {DELAI_LIMITE_JOURS} jours (pas encore marque pret)
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Commandes toujours &quot;en cours&quot;, avec la quantite de carton qui attend.
            </p>
          </div>

          {commandesEnAttente.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">Aucune commande en retard actuellement.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Proforma</th>
                    <th className="px-4 py-3 font-semibold">Client</th>
                    <th className="px-4 py-3 font-semibold">Date en cours</th>
                    <th className="px-4 py-3 font-semibold">Jours ecoules</th>
                    <th className="px-4 py-3 font-semibold">Qt carton</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {commandesEnAttente.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-semibold text-slate-900">{row.numeroProforma}</td>
                      <td className="px-4 py-3 text-slate-700">{row.client}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(row.dateEnCours)}</td>
                      <td className="px-4 py-3 font-semibold text-red-600">{row.jours} j</td>
                      <td className="px-4 py-3 text-slate-900">{row.qtCarton}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/commandes/${row.id}`}
                          className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Ouvrir
                        </Link>
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
