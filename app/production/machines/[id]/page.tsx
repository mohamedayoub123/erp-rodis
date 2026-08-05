import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { deleteMachineProduitAction } from "../actions";
import { AddProduitForm } from "./add-produit-form";

type MachineRow = {
  id: number;
  nom: string;
  zone: string | null;
  type: string | null;
  capacite: number | null;
  capacite_min: number | null;
  capacite_max: number | null;
};

type MachineProduitRow = {
  id: number;
  article_id: number;
  temps_minutes: number | null;
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

function formatNombre(value: number | null) {
  if (value === null) return "-";
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

  const [{ data: machineData }, { data: produitsData }, articles] = await Promise.all([
    supabaseServer
      .from("machines")
      .select("id, nom, zone, type, capacite, capacite_min, capacite_max")
      .eq("id", machineId)
      .maybeSingle(),
    supabaseServer
      .from("machine_produits")
      .select("id, article_id, temps_minutes")
      .eq("machine_id", machineId),
    fetchAllArticleOptions(),
  ]);

  const machine = machineData as MachineRow | null;

  if (!machine) {
    notFound();
  }

  const produits = (produitsData ?? []) as MachineProduitRow[];
  const articleLabelById = new Map(articles.map((article) => [article.id, article.label]));
  const usedArticleIds = new Set(produits.map((produit) => produit.article_id));
  const availableArticles = articles.filter((article) => !usedArticleIds.has(article.id));

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
                {machine.capacite !== null ? ` - Capacite : ${formatNombre(machine.capacite)}` : ""}
                {machine.capacite_min !== null ? ` - Min : ${formatNombre(machine.capacite_min)}` : ""}
                {machine.capacite_max !== null ? ` - Max : ${formatNombre(machine.capacite_max)}` : ""}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <BackButton href="/production/machines" label="Retour Machines" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {canEdit ? (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="px-5 pt-4 text-sm font-semibold text-sky-700">Ajouter un produit</p>
            <AddProduitForm machineId={machine.id} articles={availableArticles} />
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
                    <th className="px-6 py-4 font-semibold">Temps (minutes)</th>
                    {canDelete ? <th className="px-6 py-4 font-semibold">Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {produitsSorted.map((produit) => (
                    <tr key={produit.id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        {articleLabelById.get(produit.article_id) || "-"}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{formatNombre(produit.temps_minutes)}</td>
                      {canDelete ? (
                        <td className="px-6 py-4">
                          <form action={deleteMachineProduitAction}>
                            <input type="hidden" name="id" value={produit.id} />
                            <input type="hidden" name="machine_id" value={machine.id} />
                            <DeleteIconButton
                              label={`Retirer ${articleLabelById.get(produit.article_id) || "ce produit"}`}
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
