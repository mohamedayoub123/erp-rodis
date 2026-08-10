import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { fetchWebMouvementSourceRows } from "../../shared";
import { EntreeProductionBoard, type EntreeDateGroup, type EntreeDateGroupLigne } from "./entree-production-board";

type EmballageEntryRow = {
  id: number;
  programme_ligne_id: number;
  code: string;
  quantite: number;
  date_jour: string;
  created_at: string;
};

type LigneInfo = {
  id: number;
  produit: string | null;
  numero_lot: string | null;
  article_id: number | null;
};

type RapportInfo = {
  programme_ligne_id: number;
  date_fabrication_conditionnement: string | null;
  date_peremption: string | null;
};

type DateGroupLigne = EntreeDateGroupLigne;

type DateGroup = {
  date: string;
  datesEntree: string[];
  previewNumber: number;
  lignes: DateGroupLigne[];
  lignesByKey: Map<string, DateGroupLigne>;
};

async function fetchPendingEmballageEntries(): Promise<EmballageEntryRow[]> {
  const rows: EmballageEntryRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("production_emballage_entries")
      .select("id, programme_ligne_id, code, quantite, date_jour, created_at")
      .eq("transfere_stock", false)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as EmballageEntryRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchLignesInfo(ligneIds: number[]): Promise<Map<number, LigneInfo>> {
  const map = new Map<number, LigneInfo>();
  if (ligneIds.length === 0) return map;

  const { data } = await supabaseServer
    .from("programme_lignes")
    .select("id, produit, numero_lot, article_id")
    .in("id", ligneIds);

  for (const row of (data as LigneInfo[] | null) ?? []) {
    map.set(row.id, row);
  }

  return map;
}

// Le rapport Conditionnement porte deja "date de fabrication" et "date de
// peremption" saisies a la main - reutilisees ici comme valeurs par defaut
// (modifiables) au lieu de les redemander depuis zero.
async function fetchRapportsInfo(ligneIds: number[]): Promise<Map<number, RapportInfo>> {
  const map = new Map<number, RapportInfo>();
  if (ligneIds.length === 0) return map;

  const { data } = await supabaseServer
    .from("production_rapports")
    .select("programme_ligne_id, date_fabrication_conditionnement, date_peremption")
    .in("programme_ligne_id", ligneIds);

  for (const row of (data as RapportInfo[] | null) ?? []) {
    map.set(row.programme_ligne_id, row);
  }

  return map;
}

async function countExistingEntreeProductionGroups(): Promise<number> {
  const rows = await fetchWebMouvementSourceRows();
  const groupIds = new Set(
    rows.filter((row) => row.source_import === "web:entree-production").map((row) => row.mouvement_groupe_id)
  );
  return groupIds.size;
}

// Options pour ExtraLignesField ("Ajouter une ligne" a la main sur un
// groupe) - meme table que le reste de l'appli pour un article produit fini.
async function fetchArticleOptions(): Promise<{ id: number; label: string }[]> {
  const options: { id: number; label: string }[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, nom_article")
      .order("nom_article", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as { id: number; nom_article: string }[];
    options.push(...chunk.map((row) => ({ id: row.id, label: row.nom_article })));

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return options;
}

export default async function EntreeProductionPage() {
  noStore();

  const [pendingEntries, existingCount, articleOptions] = await Promise.all([
    fetchPendingEmballageEntries(),
    countExistingEntreeProductionGroups(),
    fetchArticleOptions(),
  ]);

  const ligneIds = [...new Set(pendingEntries.map((entry) => entry.programme_ligne_id))];
  const [ligneById, rapportById] = await Promise.all([
    fetchLignesInfo(ligneIds),
    fetchRapportsInfo(ligneIds),
  ]);

  const groupsByDate = new Map<string, DateGroup>();

  for (const entry of pendingEntries) {
    const ligne = ligneById.get(entry.programme_ligne_id);
    const rapport = rapportById.get(entry.programme_ligne_id);
    // Regroupe par date de SAISIE (created_at, le jour reel ou l'emballage a
    // ete entre) et non par date_jour (la date programme, saisie a la main
    // sur le formulaire Emballage et parfois differente du jour reel) -
    // sinon des entrees faites le meme jour pour des programmes de dates
    // differentes se retrouvaient a tort dans des lots "Entree Production"
    // separes.
    const date = String(entry.created_at).slice(0, 10);

    let group = groupsByDate.get(date);
    if (!group) {
      group = { date, datesEntree: [], previewNumber: 0, lignes: [], lignesByKey: new Map() };
      groupsByDate.set(date, group);
    }

    // "Date d'entrer" = date_jour, la date saisie a la main sur le
    // formulaire Emballage pour CETTE production (peut differer du jour
    // reel de validation ci-dessus, ex: emballage fait hier, valide ici
    // aujourd'hui) - affichee en resume dans l'entete du groupe.
    const entryDate = String(entry.date_jour).slice(0, 10);
    if (entryDate && !group.datesEntree.includes(entryDate)) {
      group.datesEntree.push(entryDate);
    }

    // Chaque entree Emballage porte desormais son propre code precis (voir
    // le suivi par code de Suivi Production) - une ligne decoupee en
    // plusieurs lots ("AA1, AA2, AA3") ne doit donc PAS afficher/transferer
    // les 3 codes combines sur chaque entree, seulement celui de CETTE
    // entree. Repli sur le numero_lot combine seulement pour une vieille
    // entree jamais resaisie depuis ce changement ET une ligne qui n'a
    // jamais ete decoupee en plusieurs codes (aucune ambiguite dans ce cas).
    const ligneCodes = (ligne?.numero_lot || "").split(",").map((c) => c.trim()).filter(Boolean);
    const resolvedCode = entry.code || (ligneCodes.length <= 1 ? ligne?.numero_lot || "" : "");

    // Plusieurs entrees emballage (des saisies "Entrer" separees) peuvent
    // porter le meme article + code dans la meme date de saisie - fusionne
    // en une seule ligne avec la quantite totale, au lieu d'une ligne par
    // saisie individuelle (qui aurait aussi cree plusieurs lots_stock
    // separes avec le meme code une fois validee).
    const mergeKey = `${ligne?.article_id ?? "none"}::${resolvedCode || "none"}`;
    const existingLigne = group.lignesByKey.get(mergeKey);

    if (existingLigne) {
      existingLigne.entryIds.push(entry.id);
      existingLigne.quantite += Number(entry.quantite);
    } else {
      const nouvelleLigne: DateGroupLigne = {
        entryIds: [entry.id],
        produit: ligne?.produit || "-",
        numeroLot: resolvedCode || "-",
        quantite: Number(entry.quantite),
        // Par defaut, la date de fabrication proposee est la date d'entree
        // (date_jour, saisie a la main sur le formulaire Emballage) - pas la
        // date du rapport Conditionnement, qui peut dater d'avant l'emballage
        // reel. Reste modifiable a l'ecran avant de valider.
        dateFabrication: entryDate,
        datePeremption: rapport?.date_peremption || "",
        // Le code peut manquer (ligne decoupee en plusieurs lots, entree pas
        // encore resaisie depuis l'ajout du suivi par code) mais reste
        // modifiable a l'ecran juste avant de valider - seul l'article
        // (jamais modifiable ici) bloque vraiment la validation.
        hasArticle: Boolean(ligne?.article_id),
      };
      group.lignesByKey.set(mergeKey, nouvelleLigne);
      group.lignes.push(nouvelleLigne);
    }
  }

  const dateGroups = [...groupsByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  dateGroups.forEach((group, index) => {
    group.previewNumber = existingCount + index + 1;
    group.datesEntree.sort();
  });

  const groupsForClient: EntreeDateGroup[] = dateGroups.map((group) => ({
    date: group.date,
    datesEntree: group.datesEntree,
    previewNumber: group.previewNumber,
    lignes: group.lignes,
  }));

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
                Entree Production
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Lignes pretes depuis Suivi Production (Emballage), regroupees par date. Quantite et
                dates sont modifiables avant de valider.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/mouvements/produit-fini" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <EntreeProductionBoard dateGroups={groupsForClient} articleOptions={articleOptions} />
      </div>
    </main>
  );
}
