import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { upsertNumeroCompteurAction, deleteNumeroCompteurAction } from "../actions";

type CompteurDb = { audit: string; annee: number; prochain_numero: number; updated_at: string };

async function fetchCompteurs(): Promise<CompteurDb[]> {
  const { data } = await supabaseServer
    .from("qualite_numero_compteurs")
    .select("audit, annee, prochain_numero, updated_at")
    .order("annee", { ascending: false })
    .order("audit", { ascending: true });
  return (data ?? []) as CompteurDb[];
}

// Dernier numero de sequence REELLEMENT trouve dans qualite_nc_confidentiel
// pour chaque (audit, annee) - juste une reference affichee a cote du
// compteur regle a la main, pour aider a savoir quelle valeur donner (jamais
// utilise pour ecrire quoi que ce soit).
async function fetchDerniersNumerosUtilises(): Promise<Map<string, number>> {
  const rows: { numero: string | null }[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseServer
      .from("qualite_nc_confidentiel")
      .select("numero")
      .range(from, from + pageSize - 1);
    if (error) break;
    rows.push(...((data ?? []) as { numero: string | null }[]));
    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }

  const maxByKey = new Map<string, number>();
  for (const row of rows) {
    const m = String(row.numero || "").match(/^AI-(\d+)-(\d{4})-NC-(\d+)$/);
    if (!m) continue;
    const key = `${m[1]}::${m[2]}`;
    const seq = Number(m[3]);
    maxByKey.set(key, Math.max(maxByKey.get(key) ?? 0, seq));
  }
  return maxByKey;
}

export default async function NumeroCompteursPage() {
  noStore();
  const currentUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentUser, "qualiteNcConfidentiel");
  if (!canWrite) {
    redirect("/qualite/nc-confidentiel");
  }

  const [compteurs, derniersNumeros] = await Promise.all([fetchCompteurs(), fetchDerniersNumerosUtilises()]);

  const inputClass = "rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none";

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f0ff_0%,#faf8ff_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Compteurs de numero</h1>
              <p className="mt-2 text-sm text-slate-600">
                Pour chaque Audit et Annee, regle le prochain numero de sequence (AI-audit-annee-NC-sequence)
                - le numero reste toujours saisi/corrige a la main dans NC Confidentiel, ceci est juste un
                repere.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/qualite/nc-confidentiel" label="Retour NC Confidentiel" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Audit</th>
                  <th className="px-4 py-3 font-semibold">Annee</th>
                  <th className="px-4 py-3 font-semibold">Dernier numero utilise</th>
                  <th className="px-4 py-3 font-semibold">Prochain numero</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {compteurs.map((c) => {
                  const dernier = derniersNumeros.get(`${c.audit}::${c.annee}`) ?? null;
                  return (
                    <tr key={`${c.audit}-${c.annee}`} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">{c.audit}</td>
                      <td className="px-4 py-3 text-slate-700">{c.annee}</td>
                      <td className="px-4 py-3 text-slate-500">{dernier ?? "-"}</td>
                      <td className="px-4 py-3">
                        <form action={upsertNumeroCompteurAction} className="flex items-center gap-2">
                          <input type="hidden" name="audit" value={c.audit} />
                          <input type="hidden" name="annee" value={c.annee} />
                          <input
                            type="number"
                            name="prochain_numero"
                            defaultValue={c.prochain_numero}
                            className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
                          />
                          <SubmitButton
                            pendingLabel="..."
                            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:border-slate-400"
                          >
                            Enregistrer
                          </SubmitButton>
                        </form>
                      </td>
                      <td className="px-4 py-3">
                        <form action={deleteNumeroCompteurAction}>
                          <input type="hidden" name="audit" value={c.audit} />
                          <input type="hidden" name="annee" value={c.annee} />
                          <DeleteIconButton label={`Supprimer le compteur ${c.audit} / ${c.annee}`} />
                        </form>
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-slate-100 bg-violet-50/40">
                  <td colSpan={5} className="px-4 py-4">
                    <form
                      action={upsertNumeroCompteurAction}
                      className="flex flex-wrap items-end gap-3"
                    >
                      <label className="grid gap-1 text-xs font-semibold text-slate-500">
                        Audit
                        <input type="text" name="audit" placeholder="Ex: 1" className={inputClass} required />
                      </label>
                      <label className="grid gap-1 text-xs font-semibold text-slate-500">
                        Annee
                        <input type="number" name="annee" placeholder="Ex: 2026" className={inputClass} required />
                      </label>
                      <label className="grid gap-1 text-xs font-semibold text-slate-500">
                        Prochain numero
                        <input
                          type="number"
                          name="prochain_numero"
                          placeholder="Ex: 34"
                          className={inputClass}
                          required
                        />
                      </label>
                      <SubmitButton
                        pendingLabel="..."
                        className="rounded-full bg-violet-700 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-600"
                      >
                        + Ajouter un compteur
                      </SubmitButton>
                    </form>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
