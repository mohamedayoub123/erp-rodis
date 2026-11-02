import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { createArticleMpAction } from "../actions";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { conditionnementMpDisponible, contenanceMpDisponible } from "@/lib/contenance-mp";
import { ChampsContenance } from "@/app/_components/champs-contenance";

// Categories et sous familles deja utilisees : proposees quand on tape, pour ecrire exactement comme les autres articles (un
// article plastique ne ressort dans Statistique Article Plastique (E3) que si sa categorie est "ARTICLE DE CONDITIONNEMENT PLASTIQUE")
async function lireCategoriesEtSousFamilles(): Promise<{ categories: string[]; sousFamilles: string[] }> {
  const categories = new Set<string>();
  const sousFamilles = new Set<string>();
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("categorie, sous_famille")
      .order("id", { ascending: true })
      .range(debut, debut + 999);
    if (error) break;
    const page = (data ?? []) as { categorie: string | null; sous_famille: string | null }[];
    for (const ligne of page) {
      if (ligne.categorie?.trim()) categories.add(ligne.categorie.trim());
      if (ligne.sous_famille?.trim()) sousFamilles.add(ligne.sous_famille.trim());
    }
    if (page.length < 1000) break;
  }
  const trier = (valeurs: Set<string>) => [...valeurs].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  return { categories: trier(categories), sousFamilles: trier(sousFamilles) };
}

export default async function NouvelArticleMpPage() {
  const [currentStockUser, depotsResult, { categories, sousFamilles }] = await Promise.all([
    getCurrentStockUser(),
    supabaseServer.from("depots").select("id, nom").order("nom", { ascending: true }),
    lireCategoriesEtSousFamilles(),
  ]);
  const canWriteArticles = await canWritePageUser(currentStockUser, "articlesMatierePremiereNouvelle");
  const [avecContenance, avecType] = await Promise.all([contenanceMpDisponible(), conditionnementMpDisponible()]);
  const depots = ((depotsResult.data ?? []) as { id: number; nom: string }[]).map((d) => ({
    id: d.id,
    label: d.nom,
  }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Ajouter article MP
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/articles/matiere-premiere" label="Retour" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {!canWriteArticles ? (
            <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-600">
              Lecture seule : ajout d&apos;article cache pour cet utilisateur.
            </p>
          ) : (
            <form action={createArticleMpAction} className="grid gap-4">
              <input
                type="text"
                name="nom_article"
                placeholder="Nom article"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                required
              />
              <input
                type="text"
                name="categorie"
                list="categories-mp"
                placeholder="Categorie (ARTICLE DE CONDITIONNEMENT PLASTIQUE pour un article plastique : il sera dans E3)"
                autoComplete="off"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
              />
              <datalist id="categories-mp">
                {categories.map((categorie) => (
                  <option key={categorie} value={categorie} />
                ))}
              </datalist>
              <input
                type="text"
                name="sous_famille"
                list="sous-familles-mp"
                placeholder="Sous Famille"
                autoComplete="off"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
              />
              <datalist id="sous-familles-mp">
                {sousFamilles.map((sousFamille) => (
                  <option key={sousFamille} value={sousFamille} />
                ))}
              </datalist>
              <input
                type="text"
                name="unite"
                placeholder="Unite"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
              />
              {avecContenance ? (
                <ChampsContenance
                  avecType={avecType}
                  classeChamp="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                />
              ) : null}
              <input
                type="text"
                name="gamme"
                placeholder="Gamme"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
              />
              <input
                type="text"
                name="gamme_statistique"
                placeholder="Gamme Statistique"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
              />
              <input
                type="text"
                name="utilisation"
                placeholder="Utilisation"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  type="number"
                  step="0.01"
                  name="min_stock"
                  placeholder="Stock min"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                />
                <input
                  type="number"
                  step="0.01"
                  name="max_stock"
                  placeholder="Stock max"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                />
              </div>
              <select
                name="depot_id"
                defaultValue=""
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
              >
                <option value="">Sans depot</option>
                {depots.map((depot) => (
                  <option key={depot.id} value={depot.id}>
                    {depot.label}
                  </option>
                ))}
              </select>

              <div>
                <SubmitButton
                  pendingLabel="Enregistrement..."
                  className="rounded-full bg-amber-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-500"
                >
                  Enregistrer article
                </SubmitButton>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
