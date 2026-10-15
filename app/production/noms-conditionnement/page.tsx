import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canViewPageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SubmitButton } from "@/app/_components/submit-button";
import {
  CLE_PAGE_NOMS_CONDITIONNEMENT,
  LIBELLE_TYPE_NOM,
  TYPES_NOM_CONDITIONNEMENT,
  nettoyerNom,
  type TypeNomConditionnement,
} from "@/lib/noms-conditionnement";
import { ajouterNomConditionnementAction, supprimerNomConditionnementAction } from "./actions";

type LigneNom = { id: number; type: TypeNomConditionnement; nom: string };

type SearchParams = Promise<{ erreur?: string; ok?: string }>;

const LIMITE_SUGGESTIONS = 40;

// Noms deja tapes a la main dans les saisies Conditionnement (chef de zone / chef de ligne), avec le nombre de saisies - sert a
// proposer de les ajouter d'un clic aux listes plutot que de tout retaper.
async function lireNomsDejaSaisis(): Promise<Record<TypeNomConditionnement, Map<string, { nom: string; nb: number }>>> {
  const resultat: Record<TypeNomConditionnement, Map<string, { nom: string; nb: number }>> = {
    chef_zone: new Map(),
    chef_ligne: new Map(),
  };
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabaseServer
      .from("production_carton_entries")
      .select("chef_zone, chef_ligne")
      .order("id", { ascending: true })
      .range(debut, debut + 999);
    if (error) break;
    const page = (data ?? []) as { chef_zone: string | null; chef_ligne: string | null }[];
    for (const ligne of page) {
      for (const type of TYPES_NOM_CONDITIONNEMENT) {
        const nom = nettoyerNom(String(ligne[type] ?? ""));
        if (!nom) continue;
        const cle = nom.toLowerCase();
        const courant = resultat[type].get(cle);
        if (courant) courant.nb += 1;
        else resultat[type].set(cle, { nom, nb: 1 });
      }
    }
    if (page.length < 1000) break;
  }
  return resultat;
}

export default async function NomsConditionnementPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const { erreur, ok } = await searchParams;

  const utilisateur = await getCurrentStockUser();
  if (!(await canViewPageUser(utilisateur, CLE_PAGE_NOMS_CONDITIONNEMENT))) {
    redirect("/production/suivi");
  }
  const peutModifier = await canWritePageUser(utilisateur, CLE_PAGE_NOMS_CONDITIONNEMENT);

  const { data, error } = await supabaseServer
    .from("conditionnement_noms")
    .select("id, type, nom")
    .order("nom", { ascending: true })
    .limit(2000);
  const tableDisponible = !error;
  const lignes = (data ?? []) as LigneNom[];

  const dejaSaisis = tableDisponible && peutModifier ? await lireNomsDejaSaisis() : null;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Noms Conditionnement</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Les noms des chefs de zone et des chefs de ligne. Ils apparaissent en liste de choix dans Entrer, Entrer par ligne
                et la fiche + du Conditionnement : on ne peut choisir que dans la liste. Tant qu&apos;une liste est vide, la saisie
                reste libre.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <BackButton href="/production/suivi/dashboard" label="Retour dashboard" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {erreur ? (
          <div className="rounded-[1.75rem] border border-red-200 bg-red-50 px-6 py-4 text-sm font-semibold text-red-700">{erreur}</div>
        ) : null}
        {ok ? (
          <div className="rounded-[1.75rem] border border-emerald-200 bg-emerald-50 px-6 py-4 text-sm font-semibold text-emerald-800">{ok}</div>
        ) : null}
        {!tableDisponible ? (
          <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50 px-6 py-4 text-sm font-semibold text-amber-900">
            La table des noms n&apos;existe pas encore : lance le SQL <span className="font-mono">create_conditionnement_noms.sql</span>{" "}
            dans Supabase (SQL Editor). En attendant, la saisie du chef de zone et du chef de ligne reste libre.
          </div>
        ) : null}

        <div className="grid gap-6 md:grid-cols-2">
          {TYPES_NOM_CONDITIONNEMENT.map((type) => {
            const noms = lignes.filter((ligne) => ligne.type === type);
            const connus = new Set(noms.map((ligne) => ligne.nom.toLowerCase()));
            const suggestions = dejaSaisis
              ? [...dejaSaisis[type].values()]
                  .filter((suggestion) => !connus.has(suggestion.nom.toLowerCase()))
                  .sort((a, b) => b.nb - a.nb)
              : [];

            return (
              <section
                key={type}
                className="space-y-4 rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]"
              >
                <h2 className="text-lg font-bold text-slate-900">
                  {LIBELLE_TYPE_NOM[type]} <span className="text-sm font-semibold text-slate-400">({noms.length})</span>
                </h2>

                {noms.length === 0 ? (
                  <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    Aucun nom pour le moment : la saisie reste libre dans les fiches.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-100">
                    {noms.map((ligne) => (
                      <li key={ligne.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                        <span className="font-medium text-slate-800">{ligne.nom}</span>
                        {peutModifier ? (
                          <form action={supprimerNomConditionnementAction}>
                            <input type="hidden" name="id" value={ligne.id} />
                            <SubmitButton
                              pendingLabel="..."
                              className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                            >
                              Retirer
                            </SubmitButton>
                          </form>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}

                {peutModifier && tableDisponible ? (
                  <form action={ajouterNomConditionnementAction} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="type" value={type} />
                    <label className="grid min-w-[12rem] flex-1 gap-1 text-xs font-semibold text-slate-500">
                      Ajouter un nom
                      <input
                        type="text"
                        name="nom"
                        required
                        maxLength={60}
                        autoComplete="off"
                        className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-normal text-slate-900 outline-none"
                      />
                    </label>
                    <SubmitButton
                      pendingLabel="Ajout..."
                      className="rounded-full bg-sky-700 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-800"
                    >
                      Ajouter
                    </SubmitButton>
                  </form>
                ) : null}

                {suggestions.length > 0 ? (
                  <div>
                    <p className="mb-2 text-xs font-semibold text-slate-500">
                      Deja saisis dans les fiches (pas encore dans la liste) - clique pour ajouter :
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.slice(0, LIMITE_SUGGESTIONS).map((suggestion) => (
                        <form key={suggestion.nom} action={ajouterNomConditionnementAction}>
                          <input type="hidden" name="type" value={type} />
                          <input type="hidden" name="nom" value={suggestion.nom} />
                          <SubmitButton
                            pendingLabel="..."
                            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-sky-50"
                          >
                            + {suggestion.nom} <span className="font-normal text-slate-400">({suggestion.nb})</span>
                          </SubmitButton>
                        </form>
                      ))}
                    </div>
                    {suggestions.length > LIMITE_SUGGESTIONS ? (
                      <p className="mt-2 text-xs text-slate-400">
                        + {suggestions.length - LIMITE_SUGGESTIONS} autres noms moins utilises (souvent des fautes de frappe).
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
