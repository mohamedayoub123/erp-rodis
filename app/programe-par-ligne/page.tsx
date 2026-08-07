import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { ProgrammeLigneTable, type ArticleOption, type PrefillLigne } from "./programme-table";
import { ZONE_GROUPS } from "@/lib/zone-chaine-list";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";

async function fetchAllArticleOptions(): Promise<ArticleOption[]> {
  const rows: ArticleOption[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, nom_article, type_article, contenance, piece_par_carton, max_vrac_auto, vrac_max_manuel")
      .order("nom_article", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as {
      id: number;
      nom_article: string;
      type_article: string | null;
      contenance: number | null;
      piece_par_carton: number | null;
      max_vrac_auto: number | null;
      vrac_max_manuel: number | null;
    }[];
    rows.push(
      ...chunk.map((article) => ({
        id: article.id,
        label: article.nom_article,
        type: article.type_article || "",
        contenance: article.contenance,
        piecePerCarton: article.piece_par_carton,
        maxVracAuto: article.max_vrac_auto,
        vracMaxManuel: article.vrac_max_manuel,
      }))
    );

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

// Rempli automatiquement la grille a partir d'un programme de l'historique
// (bouton "Charger" sur Historique programme) - evite de retaper a la main
// pour repartir d'un ancien programme comme base, tout en gardant la
// possibilite de le modifier avant Save (contrairement a "Relancer" qui
// enregistre direct).
async function fetchPrefillLignes(groupeId: number): Promise<PrefillLigne[]> {
  const { data } = await supabaseServer
    .from("programme_lignes")
    .select("zone, chaine, article_id, produit, type_article, qt_carton, vrac_a_fabriquer, plateforme, programe, remarque")
    .eq("groupe_id", groupeId)
    .order("id", { ascending: true });

  return (data ?? []) as PrefillLigne[];
}

type SearchParams = Promise<{ groupe_id?: string }>;

export default async function ProgrameParLignePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const params = await searchParams;
  const prefillGroupeId = Number(params.groupe_id || "0") || null;

  const [articles, prefillLignes] = await Promise.all([
    fetchAllArticleOptions(),
    prefillGroupeId ? fetchPrefillLignes(prefillGroupeId) : Promise.resolve([]),
  ]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Programme par ligne
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <BackButton href="/production" label="Retour production" />
              <RefreshButton />
              <Link
                href="/ravitailleur-par-ligne"
                className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700"
              >
                Ravitailleur par ligne
              </Link>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="overflow-x-auto">
            <ProgrammeLigneTable
              zoneGroups={ZONE_GROUPS}
              articles={articles}
              prefillLignes={prefillLignes}
              prefillRemarque={prefillLignes[0]?.remarque || ""}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
