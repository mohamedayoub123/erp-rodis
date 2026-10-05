import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canViewPageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { normaliserConfig } from "@/lib/cout-eau";
import { CoutEauForm } from "./cout-eau-form";

export default async function PrixLitreEauPage() {
  noStore();

  const currentUser = await getCurrentStockUser();

  // Controle cote serveur AVANT de lire les prix : la barriere d'acces de la mise
  // en page masque la page a l'ecran, mais ne doit pas etre la seule protection
  // pour des donnees de cout.
  if (!(await canViewPageUser(currentUser, "coutEau"))) {
    return (
      <main className="px-6 py-10 lg:px-10">
        <section className="mx-auto max-w-3xl rounded-[2rem] border border-red-200 bg-white p-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700">Acces non autorise</p>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
            Cette page n&apos;est pas ouverte pour {currentUser ?? "ce compte"}
          </h1>
        </section>
      </main>
    );
  }

  const canEdit = await canWritePageUser(currentUser, "coutEau");

  const { data, error } = await supabaseServer
    .from("cout_eau_config")
    .select("donnees, updated_by, updated_at")
    .eq("id", 1)
    .maybeSingle();

  const stocke = data as { donnees: unknown; updated_by: string | null; updated_at: string | null } | null;
  const config = normaliserConfig(stocke?.donnees);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#eaf6fb_0%,#f5fbfd_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Prix du litre d&apos;eau</h1>
              <p className="mt-2 text-sm text-slate-600">
                Saisis le prix de chaque element du traitement de l&apos;eau (filtres, produits, UV, membrane, sel,
                electricite) : le prix de revient d&apos;1 litre d&apos;eau se calcule tout seul.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/cout" label="Retour Cout" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {error ? (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            Les prix enregistres n&apos;ont pas pu etre lus ({error.message}). Si c&apos;est la premiere
            utilisation, le script SQL de ce module doit etre execute dans Supabase.
          </p>
        ) : null}

        <CoutEauForm
          initial={config}
          canEdit={canEdit}
          derniereModification={
            stocke?.updated_at ? { par: stocke.updated_by, le: stocke.updated_at } : null
          }
        />
      </div>
    </main>
  );
}
