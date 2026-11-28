import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import {
  SQL_MACHINES_IDENTIQUES,
  machinesIdentiquesDisponible,
  membresDuGroupe,
  type MachineGroupe,
} from "@/lib/machines-identiques";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { deleteMachineProduitAction, updateMachinesIdentiquesAction } from "../actions";
import { AddProduitForm } from "./add-produit-form";
import { MachineMinMaxForm } from "../min-max-form";

type MachineRow = {
  id: number;
  nom: string;
  zone: string | null;
  type: string | null;
  capacite_min: number | null;
  capacite_max: number | null;
};

type MachineProduitRow = {
  id: number;
  article_id: number;
  temps_minutes: number | null;
  capacite: number | null;
  capacite_min: number | null;
  capacite_max: number | null;
};

async function fetchAllArticleOptions(): Promise<{ id: number; label: string }[]> {
  const rows: { id: number; label: string }[] = [];
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
    rows.push(...chunk.map((article) => ({ id: article.id, label: article.nom_article })));

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function formatNombre(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("fr-FR");
}

export default async function MachineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  noStore();
  const { id } = await params;
  const machineId = Number(id);

  if (!machineId) {
    notFound();
  }

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "machines");
  const canDelete = await canDeletePageUser(currentUser, "machines");

  // Machines identiques : lues seulement une fois le SQL execute (colonne groupe_identique_id)
  const identiquesDisponible = await machinesIdentiquesDisponible();

  const [{ data: machineData }, { data: produitsData }, articles, { data: toutesData }] = await Promise.all([
    supabaseServer
      .from("machines")
      .select("id, nom, zone, type, capacite_min, capacite_max")
      .eq("id", machineId)
      .maybeSingle(),
    supabaseServer
      .from("machine_produits")
      .select("id, article_id, temps_minutes, capacite, capacite_min, capacite_max")
      .eq("machine_id", machineId),
    fetchAllArticleOptions(),
    identiquesDisponible
      ? supabaseServer
          .from("machines")
          .select("id, nom, zone, type, groupe_identique_id")
          .order("zone", { ascending: true, nullsFirst: false })
          .order("nom", { ascending: true })
      : Promise.resolve({ data: null }),
  ]);

  const machine = machineData as MachineRow | null;

  if (!machine) {
    notFound();
  }

  const toutesMachines = (toutesData ?? []) as unknown as (MachineGroupe & { nom: string; zone: string | null })[];
  const identiquesIds = identiquesDisponible ? membresDuGroupe(toutesMachines, machine.id) : [];
  const identiques = toutesMachines.filter((autre) => identiquesIds.includes(autre.id));
  // Seules les machines du meme type peuvent etre identiques (Fabrication / Conditionnement / Embalage n'ont pas les memes champs)
  const candidates = toutesMachines.filter((autre) => autre.id !== machine.id && autre.type === machine.type);

  const produits = (produitsData ?? []) as MachineProduitRow[];
  const articleLabelById = new Map(articles.map((article) => [article.id, article.label]));
  const usedArticleIds = new Set(produits.map((produit) => produit.article_id));
  const availableArticles = articles.filter((article) => !usedArticleIds.has(article.id));
  const isFabrication = machine.type === "Fabrication";

  const produitsSorted = [...produits].sort((a, b) => {
    const labelA = articleLabelById.get(a.article_id) || "";
    const labelB = articleLabelById.get(b.article_id) || "";
    return labelA.localeCompare(labelB, "fr");
  });

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{machine.nom}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {machine.zone ? `Zone : ${machine.zone}` : "Zone : -"}
                {machine.type ? ` - Type : ${machine.type}` : ""}
              </p>
              {identiques.length > 0 ? (
                <p className="mt-1 text-sm text-slate-600">
                  Machines identiques :{" "}
                  {identiques.map((autre, index) => (
                    <span key={autre.id}>
                      {index > 0 ? ", " : ""}
                      <Link href={`/production/machines/${autre.id}`} className="font-semibold text-sky-700 hover:underline">
                        {autre.nom}
                      </Link>
                    </span>
                  ))}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <BackButton href="/production/machines" label="Retour Equipements" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {isFabrication ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-semibold text-sky-700">Min / Max d&apos;un batch (kg)</p>
            <p className="mt-1 text-sm text-slate-600">
              Valables pour tous les produits de {machine.nom} : Programme par ligne les prend pour les batchs, les alertes et le
              decoupage des codes au Dispatch. Laisse les 2 cases vides pour garder le Min / Max ecrit produit par produit plus bas.
            </p>
            <div className="mt-3">
              {canEdit ? (
                <MachineMinMaxForm
                  machineId={machine.id}
                  machineNom={machine.nom}
                  min={machine.capacite_min}
                  max={machine.capacite_max}
                />
              ) : (
                <p className="text-sm text-slate-800">
                  Min : {formatNombre(machine.capacite_min)} kg - Max : {formatNombre(machine.capacite_max)} kg
                </p>
              )}
            </div>
          </section>
        ) : null}

        {canEdit && identiquesDisponible ? (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="px-5 pt-4 text-sm font-semibold text-sky-700">Machines identiques</p>
            <p className="px-5 pt-1 text-sm text-slate-600">
              Coche les machines identiques a {machine.nom} : les produits (quantites min/max, temps, capacite) de ces machines sont mis en
              commun, puis tout produit ajoute ou retire sur l&apos;une est ajoute ou retire sur les autres. Si un produit existe deja avec
              d&apos;autres valeurs, il prend les valeurs de {machine.nom}.
              {isFabrication ? " Le Min / Max d'un batch (kg) est aussi partage." : null}
            </p>
            <form action={updateMachinesIdentiquesAction} className="grid gap-4 p-5">
              <input type="hidden" name="machine_id" value={machine.id} />
              {candidates.length === 0 ? (
                <p className="text-sm text-slate-500">Aucune autre machine du meme type ({machine.type || "sans type"}).</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {candidates.map((autre) => (
                    <label
                      key={autre.id}
                      className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 has-[:checked]:border-sky-600 has-[:checked]:bg-sky-50"
                    >
                      <input
                        type="checkbox"
                        name="identique_id"
                        value={autre.id}
                        defaultChecked={identiquesIds.includes(autre.id)}
                        className="h-4 w-4"
                      />
                      {autre.nom}
                      {autre.zone ? <span className="text-xs text-slate-500">({autre.zone})</span> : null}
                    </label>
                  ))}
                </div>
              )}
              <div>
                <SubmitButton
                  pendingLabel="Enregistrement..."
                  className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Enregistrer les machines identiques
                </SubmitButton>
              </div>
            </form>
          </section>
        ) : null}

        {canEdit && !identiquesDisponible ? (
          <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            Machines identiques : pas encore active. Lance le SQL <span className="font-semibold">{SQL_MACHINES_IDENTIQUES}</span> dans Supabase
            pour l&apos;activer.
          </section>
        ) : null}

        {canEdit ? (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="px-5 pt-4 text-sm font-semibold text-sky-700">Ajouter un produit</p>
            <AddProduitForm machineId={machine.id} machineType={machine.type} articles={availableArticles} />
          </section>
        ) : null}

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {produitsSorted.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              Aucun produit associe a cette machine pour le moment.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Produit</th>
                    {isFabrication ? (
                      <>
                        <th className="px-6 py-4 font-semibold">Min (kg)</th>
                        <th className="px-6 py-4 font-semibold">Max (kg)</th>
                        <th className="px-6 py-4 font-semibold">Temps (minutes)</th>
                      </>
                    ) : (
                      <th className="px-6 py-4 font-semibold">Capacite</th>
                    )}
                    {canDelete ? <th className="px-6 py-4 font-semibold">Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {produitsSorted.map((produit) => (
                    <tr key={produit.id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        {articleLabelById.get(produit.article_id) || "-"}
                      </td>
                      {isFabrication ? (
                        <>
                          <td className="px-6 py-4 text-slate-600">{formatNombre(produit.capacite_min)}</td>
                          <td className="px-6 py-4 text-slate-600">{formatNombre(produit.capacite_max)}</td>
                          <td className="px-6 py-4 text-slate-600">{formatNombre(produit.temps_minutes)}</td>
                        </>
                      ) : (
                        <td className="px-6 py-4 text-slate-600">{formatNombre(produit.capacite)}</td>
                      )}
                      {canDelete ? (
                        <td className="px-6 py-4">
                          <form action={deleteMachineProduitAction}>
                            <input type="hidden" name="id" value={produit.id} />
                            <input type="hidden" name="machine_id" value={machine.id} />
                            <DeleteIconButton
                              label={`Retirer ${articleLabelById.get(produit.article_id) || "ce produit"}`}
                              confirmMessage={
                                identiques.length > 0
                                  ? `Retirer ${articleLabelById.get(produit.article_id) || "ce produit"} de ${machine.nom} ET de ses machines identiques (${identiques.map((autre) => autre.nom).join(", ")}) ? Cette action est definitive.`
                                  : undefined
                              }
                            />
                          </form>
                        </td>
                      ) : null}
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
