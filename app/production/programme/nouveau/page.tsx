import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ProgrammeFormulaire } from "../programme-formulaire";
import { createProgrammeAction } from "../actions";

type ArticleRow = {
  id: number;
  nom_article: string;
  vrac_article_id: number | null;
  contenance: number | null;
  piece_par_carton: number | null;
};

type MachineRow = { id: number; nom: string; type: string | null };

type MachineProduitRow = {
  machine_id: number;
  article_id: number;
  capacite: number | null;
  capacite_min: number | null;
  capacite_max: number | null;
  temps_minutes: number | null;
};

async function fetchAllArticles() {
  const rows: ArticleRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, nom_article, vrac_article_id, contenance, piece_par_carton")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    rows.push(...((data ?? []) as ArticleRow[]));

    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

async function fetchAllMachines() {
  const rows: MachineRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("machines")
      .select("id, nom, type")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    rows.push(...((data ?? []) as MachineRow[]));

    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

async function fetchAllMachineProduits() {
  const rows: MachineProduitRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("machine_produits")
      .select("machine_id, article_id, capacite, capacite_min, capacite_max, temps_minutes")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    rows.push(...((data ?? []) as MachineProduitRow[]));

    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

export default async function NouveauProgrammePage() {
  noStore();

  const [
    { rows: articles, error: articlesError },
    { rows: machines, error: machinesError },
    { rows: machineProduits, error: machineProduitsError },
  ] = await Promise.all([fetchAllArticles(), fetchAllMachines(), fetchAllMachineProduits()]);

  const error = articlesError || machinesError || machineProduitsError;

  const articleById = new Map(articles.map((article) => [article.id, article]));

  const articleOptions = articles
    .filter((article) => article.vrac_article_id === null || article.vrac_article_id !== article.id)
    .map((article) => ({
      id: article.id,
      label: article.nom_article,
      vracArticleId: article.vrac_article_id,
      vracLabel: article.vrac_article_id ? articleById.get(article.vrac_article_id)?.nom_article ?? null : null,
      contenance: article.contenance,
      piecePartCarton: article.piece_par_carton,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));

  const machinesFabrication = machines
    .filter((machine) => machine.type === "Fabrication")
    .map((machine) => ({ id: machine.id, label: machine.nom }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
  const machinesConditionnement = machines
    .filter((machine) => machine.type === "Conditionnement")
    .map((machine) => ({ id: machine.id, label: machine.nom }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));

  const capaciteParMachineArticle: Record<
    string,
    { capacite: number | null; capaciteMin: number | null; capaciteMax: number | null; tempsMinutes: number | null }
  > = {};
  for (const row of machineProduits) {
    capaciteParMachineArticle[`${row.machine_id}-${row.article_id}`] = {
      capacite: row.capacite,
      capaciteMin: row.capacite_min,
      capaciteMax: row.capacite_max,
      tempsMinutes: row.temps_minutes,
    };
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              Programme
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Nouveau programme
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Ajoute autant d&apos;articles que necessaire, une ligne par article. Pour chaque
              ligne : machines Fabrication/Conditionnement et duree prevue, puis
              &quot;Calculer&quot; pour remplir qt carton/vrac automatiquement a partir de la
              capacite des machines (page Machines) - tout reste modifiable a la main.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/production/programme" label="Retour" />
            <RefreshButton />
          </div>
        </div>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {error ? (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error.message}
            </p>
          ) : (
            <form action={createProgrammeAction} className="grid gap-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-semibold text-slate-500">
                  Date
                  <input
                    type="date"
                    name="date_jour"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-500">
                  Remarque
                  <input
                    type="text"
                    name="remarque"
                    placeholder="Optionnel"
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                  />
                </label>
              </div>

              <ProgrammeFormulaire
                articles={articleOptions}
                machinesFabrication={machinesFabrication}
                machinesConditionnement={machinesConditionnement}
                capaciteParMachineArticle={capaciteParMachineArticle}
              />

              <div>
                <button
                  type="submit"
                  className="rounded-full bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-500"
                >
                  Enregistrer le programme
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
