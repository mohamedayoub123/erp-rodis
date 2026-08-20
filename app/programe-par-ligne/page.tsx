import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canChangerMachineConditionnementUser, getCurrentStockUser } from "@/lib/stock-auth";
import {
  ProgrammeLigneTable,
  type ArticleOption,
  type FabricationMachineOption,
  type LigneRow,
  type PrefillLigne,
} from "./programme-table";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";

// Remplace l'ancienne liste fixe (lib/zone-chaine-list.ts, copiee d'un
// Excel) par les vraies machines Conditionnement - chaque ligne de la
// grille correspond desormais a une machine reelle (zone reelle, plus de
// nom duplique entre zones comme avant avec "CHAINE 4" existant dans 3
// zones), avec son type_produit accepte porte pour interdire un article
// incompatible. lib/zone-chaine-list.ts reste utilise tel quel par
// /ravitailleur-par-ligne (hors de ce lot).
async function fetchConditionnementZoneGroups(): Promise<LigneRow[][]> {
  const rows: { id: number; nom: string; zone: string | null; type_produit: string[] | null }[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("machines")
      .select("id, nom, zone, type_produit")
      .eq("type", "Conditionnement")
      .range(from, from + pageSize - 1);

    if (error) break;
    const chunk =
      (data as { id: number; nom: string; zone: string | null; type_produit: string[] | null }[] | null) ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  const byZone = new Map<string, LigneRow[]>();
  for (const machine of rows) {
    const zone = machine.zone || "-";
    const list = byZone.get(zone) ?? [];
    list.push({
      zone,
      chaine: machine.nom,
      machineId: machine.id,
      typeProduit: machine.type_produit ?? [],
    });
    byZone.set(zone, list);
  }

  return [...byZone.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map(([, group]) => group.sort((a, b) => a.chaine.localeCompare(b.chaine, "fr", { sensitivity: "base" })));
}

// Le champ "zone" des machines de Fabrication ne contient PAS une vraie zone
// physique mais Automatique/Manuel/Semi auto (deja pose par une autre
// session) - utilise ici uniquement pour pre-remplir le Plateforme (M/A) de
// la ligne des qu'une machine Fabrication est choisie, jamais pour filtrer
// par zone.
async function fetchFabricationMachines(): Promise<FabricationMachineOption[]> {
  const rows: FabricationMachineOption[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("machines")
      .select("id, nom, zone, type_produit")
      .eq("type", "Fabrication")
      .range(from, from + pageSize - 1);

    if (error) break;
    const chunk =
      (data as { id: number; nom: string; zone: string | null; type_produit: string[] | null }[] | null) ?? [];
    rows.push(
      ...chunk.map((m) => ({
        id: m.id,
        nom: m.nom,
        categorie: m.zone,
        typeProduit: m.type_produit ?? [],
      }))
    );
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows.sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));
}

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
    .select(
      "zone, chaine, article_id, produit, type_article, qt_carton, vrac_a_fabriquer, plateforme, programe, remarque, machine_fabrication_id"
    )
    .or(`groupe_id.eq.${groupeId},and(groupe_id.is.null,id.eq.${groupeId})`)
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

  const currentUser = await getCurrentStockUser();

  const [articles, prefillLignes, zoneGroups, fabricationMachines, canChangerMachine] = await Promise.all([
    fetchAllArticleOptions(),
    prefillGroupeId ? fetchPrefillLignes(prefillGroupeId) : Promise.resolve([]),
    fetchConditionnementZoneGroups(),
    fetchFabricationMachines(),
    canChangerMachineConditionnementUser(currentUser),
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
              zoneGroups={zoneGroups}
              articles={articles}
              fabricationMachines={fabricationMachines}
              prefillLignes={prefillLignes}
              prefillRemarque={prefillLignes[0]?.remarque || ""}
              canChangerMachine={canChangerMachine}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
