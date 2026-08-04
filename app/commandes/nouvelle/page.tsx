import { CommandLinesBuilder } from "../command-lines-builder";
import { createManualCommandeAction } from "../actions";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";

async function fetchAllArticlesForNouvelleCommande() {
  const rows: { id: number; nom_article: string }[] = [];
  let from = 0;
  const pageSize = 1000;

  // PostgREST plafonne chaque requete a ~1000 lignes quel que soit le
  // .limit() demande - sans cette boucle, les articles au-dela du 1000e
  // (tries par nom) etaient invisibles dans le formulaire.
  while (true) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, nom_article")
      .order("nom_article", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data as { id: number; nom_article: string }[] | null) ?? [];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchAllClientsForNouvelleCommande() {
  const rows: { nom_client: string }[] = [];
  let from = 0;
  const pageSize = 1000;

  // Meme plafond PostgREST a ~1000 lignes - sans cette boucle, les clients
  // au-dela du 1000e (tries par nom) etaient invisibles dans le datalist.
  while (true) {
    const { data, error } = await supabaseServer
      .from("clients")
      .select("nom_client")
      .order("nom_client", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data as { nom_client: string }[] | null) ?? [];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

export default async function NouvelleCommandePage() {
  const currentStockUser = await getCurrentStockUser();
  const canWriteCommandes = await canWritePageUser(currentStockUser, "commandesNouvelle");

  const [articlesData, clientsData] = await Promise.all([
    fetchAllArticlesForNouvelleCommande(),
    fetchAllClientsForNouvelleCommande(),
  ]);

  const articleOptions = articlesData.map((article) => ({
    value: String(article.id),
    label: article.nom_article,
  }));

  const clientOptions = clientsData.map((client) => client.nom_client);

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
                Ajouter une commande
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/commandes" label="Retour aux commandes" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {canWriteCommandes ? (
          <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <p className="text-sm text-slate-600">
              Ecris la proforma, le client, choisis le statut, puis ajoute les lignes.
            </p>

            <form
              id="nouvelle-commande-form"
              action={createManualCommandeAction}
              className="mt-5 grid gap-4"
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <input
                  type="text"
                  name="numero_proforma"
                  placeholder="Numero proforma"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                  required
                />
                <input
                  type="text"
                  name="client"
                  list="client-options"
                  placeholder="Nom du client"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                  required
                />
                <datalist id="client-options">
                  {clientOptions.map((client) => (
                    <option key={client} value={client} />
                  ))}
                </datalist>
                <select
                  name="statut"
                  defaultValue="EN_COURS"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                >
                  <option value="EN_COURS">En cours</option>
                  <option value="STAND">Stand</option>
                  <option value="BL_TRANSFORME">BL transforme</option>
                </select>
                <select
                  name="mode_chargement"
                  defaultValue="CAMION"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                >
                  <option value="CAMION">Camion</option>
                  <option value="CONTINAIR">Continair</option>
                  <option value="TC">TC</option>
                  <option value="TC20">TC20</option>
                  <option value="TC40">TC40</option>
                </select>
                <label className="grid gap-1 text-xs font-semibold text-slate-600">
                  Nb de camion
                  <input
                    type="number"
                    name="nombre_camion"
                    min="1"
                    step="1"
                    defaultValue="1"
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    required
                  />
                </label>
              </div>

              <p className="text-xs text-slate-500">
                La quantite de chaque ligne est par camion/conteneur : elle sera multipliee par ce nombre.
              </p>
            </form>

            {/* En dehors du <form> expres : un composant client avec son
                propre etat imbrique dans un <form action={serverAction}>
                ne devenait pas interactif sur cette route (voir debug
                session). Le champ cache et le bouton restent lies au
                formulaire via l'attribut form=. */}
            <CommandLinesBuilder articles={articleOptions} formId="nouvelle-commande-form" />

            <p className="mt-4 text-sm text-slate-500">
              {clientOptions.length === 0
                ? "Aucun client enregistre pour le moment - tu peux quand meme ecrire un nom de client."
                : "Choisis un client existant dans la liste ou ecris un nouveau nom."}
            </p>

            <div className="mt-4">
              <button
                type="submit"
                form="nouvelle-commande-form"
                className="rounded-full bg-sky-700 px-5 py-3 text-sm font-semibold text-white"
              >
                Enregistrer commande
              </button>
            </div>
          </section>
        ) : (
          <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-600">
              Lecture seule : creation de commande cachee pour cet utilisateur.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
