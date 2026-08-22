import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";
import { fetchEcrituresParSourceType, fetchMontantParEcriture } from "../page";
import { PaiementsFournisseur } from "../paiements-fournisseur";

type FournisseurRow = {
  id: number;
  nom_fournisseur: string;
  pays: string | null;
};

type LotRow = {
  id: number;
  numero_lot: string | null;
  article_id: number | null;
  qte_entree: number | null;
  prix_unitaire: number | null;
  devise: string | null;
  date_reception: string | null;
  date_jour: string | null;
  n_doss_erp: string | null;
  n_doss_4d: string | null;
};

type DossierGroup = {
  key: string;
  nDossErp: string | null;
  nDoss4d: string | null;
  date: string | null;
  articleIds: Set<number>;
  lotIds: number[];
};

type FournisseurPaiementRow = {
  id: number;
  montant: number;
  compteCode: string;
  datePaiement: string;
  reference: string | null;
};

function formatFcfa(value: number) {
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FCFA`;
}

function dossierLabel(nDossErp: string | null, nDoss4d: string | null) {
  if (nDossErp && nDoss4d) return `${nDossErp} (ERP) / ${nDoss4d} (4D)`;
  if (nDossErp) return nDossErp;
  if (nDoss4d) return nDoss4d;
  return "Sans dossier";
}

export default async function FournisseurDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const fournisseurId = Number(id);

  const { data: fournisseurData } = await supabaseServer
    .from("fournisseurs")
    .select("id, nom_fournisseur, pays")
    .eq("id", fournisseurId)
    .maybeSingle();

  const fournisseur = (fournisseurData as FournisseurRow | null) ?? null;

  if (!fournisseur) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
        <div className="mx-auto w-full space-y-6">
          <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <p className="text-sm font-medium text-slate-600">Fournisseur introuvable.</p>
            <div className="mt-4">
              <BackButton href="/fournisseurs" label="Retour aux fournisseurs" />
            </div>
          </section>
        </div>
      </main>
    );
  }

  const currentStockUser = await getCurrentStockUser();
  const canEditFournisseurs = await canWritePageUser(currentStockUser, "fournisseurs");

  // lots_stock_matiere_premiere.fournisseur est un texte libre (pas une FK) -
  // meme convention que fetchLotFournisseurMap dans app/fournisseurs/page.tsx.
  // qte_entree > 0 pour ne garder que les vraies receptions (pas les sorties/
  // corrections qui partagent la meme table).
  const { data: lotsData } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .select(
      "id, numero_lot, article_id, qte_entree, prix_unitaire, devise, date_reception, date_jour, n_doss_erp, n_doss_4d"
    )
    .eq("fournisseur", fournisseur.nom_fournisseur)
    .gt("qte_entree", 0);

  const lots = (lotsData as LotRow[] | null) ?? [];
  const lotIds = lots.map((lot) => lot.id);

  // Achete (401000 credit, source mp_achat) par lot - meme pattern que
  // fetchAcheteParFournisseur dans app/fournisseurs/page.tsx, filtre ensuite
  // aux lots de ce fournisseur uniquement.
  const ecritures = await fetchEcrituresParSourceType("mp_achat");
  const creditByEcriture = await fetchMontantParEcriture(
    ecritures.map((ecriture) => ecriture.id),
    "401000",
    "credit"
  );

  const acheteByLotId = new Map<number, number>();
  for (const ecriture of ecritures) {
    const montant = creditByEcriture.get(ecriture.id);
    if (!montant) continue;
    const lotId = Number(ecriture.source_id);
    if (!Number.isFinite(lotId)) continue;
    acheteByLotId.set(lotId, (acheteByLotId.get(lotId) ?? 0) + montant);
  }

  const articleIds = [...new Set(lots.map((lot) => lot.article_id).filter((v): v is number => Boolean(v)))];
  const articleNameById = new Map<number, string>();
  if (articleIds.length > 0) {
    const { data: articlesData } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("id, nom_article")
      .in("id", articleIds);

    for (const article of (articlesData as { id: number; nom_article: string | null }[] | null) ?? []) {
      if (article.nom_article) articleNameById.set(article.id, article.nom_article);
    }
  }

  // Regroupe par dossier import : cle = n_doss_erp, sinon n_doss_4d, sinon un
  // seul bucket "sans dossier" commun - un dossier peut couvrir plusieurs
  // articles/lots a la fois (demande explicite : pas une ligne par lot).
  const groupsByKey = new Map<string, DossierGroup>();
  for (const lot of lots) {
    const key = lot.n_doss_erp || lot.n_doss_4d || "__SANS_DOSSIER__";
    const group = groupsByKey.get(key) ?? {
      key,
      nDossErp: lot.n_doss_erp,
      nDoss4d: lot.n_doss_4d,
      date: null,
      articleIds: new Set<number>(),
      lotIds: [],
    };

    const lotDate = lot.date_reception || lot.date_jour;
    if (lotDate && (!group.date || lotDate > group.date)) {
      group.date = lotDate;
    }
    if (lot.article_id) group.articleIds.add(lot.article_id);
    group.lotIds.push(lot.id);

    groupsByKey.set(key, group);
  }

  const dossiers = [...groupsByKey.values()]
    .map((group) => ({
      key: group.key,
      label: dossierLabel(group.nDossErp, group.nDoss4d),
      date: group.date,
      articles: [...group.articleIds]
        .map((articleId) => articleNameById.get(articleId))
        .filter((name): name is string => Boolean(name))
        .join(", "),
      montant: group.lotIds.reduce((sum, lotId) => sum + (acheteByLotId.get(lotId) ?? 0), 0),
    }))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const totalAchete = lotIds.reduce((sum, lotId) => sum + (acheteByLotId.get(lotId) ?? 0), 0);

  // Les paiements sont suivis au niveau du fournisseur uniquement (pas de FK
  // vers un dossier precis) - un seul resume paye/reste pour tout le
  // fournisseur, gere par le meme composant que la liste des fournisseurs.
  const { data: paiementsData } = await supabaseServer
    .from("fournisseur_paiements")
    .select("id, montant, compte_code, date_paiement, reference")
    .eq("fournisseur_id", fournisseur.id)
    .order("date_paiement", { ascending: false });

  const paiements: FournisseurPaiementRow[] = (
    (paiementsData as
      | { id: number; montant: number; compte_code: string; date_paiement: string; reference: string | null }[]
      | null) ?? []
  ).map((paiement) => ({
    id: paiement.id,
    montant: Number(paiement.montant ?? 0),
    compteCode: paiement.compte_code,
    datePaiement: paiement.date_paiement,
    reference: paiement.reference,
  }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                {fournisseur.nom_fournisseur}
              </h1>
              <p className="mt-2 text-sm text-slate-600">Pays : {fournisseur.pays || "-"}</p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/fournisseurs" label="Retour aux fournisseurs" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <h2 className="text-xl font-bold text-slate-900">Paiements</h2>
          <p className="mt-1 text-sm text-slate-500">
            Paiements faits a ce fournisseur (Banque ou Caisse), tous dossiers confondus.
          </p>

          <PaiementsFournisseur
            fournisseurId={fournisseur.id}
            paiements={paiements}
            montantAchete={totalAchete}
            canEdit={canEditFournisseurs}
          />
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-xl font-bold text-slate-900">Dossiers import de ce fournisseur</h2>
          </div>

          {dossiers.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">Aucune reception enregistree pour ce fournisseur.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Dossier</th>
                    <th className="px-6 py-4 font-semibold">Date</th>
                    <th className="px-6 py-4 font-semibold">Article(s)</th>
                    <th className="px-6 py-4 font-semibold">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {dossiers.map((dossier) => (
                    <tr key={dossier.key} className="border-t border-slate-100 align-top">
                      <td className="px-6 py-4 font-medium text-slate-900">{dossier.label}</td>
                      <td className="px-6 py-4 text-slate-600">{formatDate(dossier.date)}</td>
                      <td className="px-6 py-4 text-slate-600">{dossier.articles || "-"}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        {dossier.montant > 0 ? formatFcfa(dossier.montant) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="border-t border-slate-100 px-6 py-4 text-xs text-slate-500">
            Les paiements sont suivis par fournisseur, pas par dossier.
          </p>
        </section>
      </div>
    </main>
  );
}
