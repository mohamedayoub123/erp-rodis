import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { PhotoTransferOrderForm } from "./photo-form";

// La lecture de la photo par l'IA peut prendre plusieurs secondes
export const maxDuration = 60;

// Transfer Order cree a partir de la photo d'un TO d'un autre systeme. La page ne charge que les
// depots (5 lignes) : les listes d'articles arrivent avec le resultat de la lecture de la photo.
export default async function TransferOrderPhotoPage() {
  noStore();

  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "depots"))) {
    return (
      <main className="px-6 py-10 lg:px-10">
        <section className="mx-auto max-w-3xl rounded-[2rem] border border-red-200 bg-white p-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700">Acces non autorise</p>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
            Cet utilisateur ne peut pas creer de Transfer Order
          </h1>
        </section>
      </main>
    );
  }

  const { data: depotsData } = await supabaseServer.from("depots").select("id, nom").order("nom", { ascending: true });
  const depots = (depotsData ?? []) as { id: number; nom: string }[];

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Entrepot</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Transfer Order depuis une photo</h1>
              <p className="mt-2 text-sm text-slate-600">
                Photo du TO d&apos;un autre systeme : l&apos;ERP lit les articles et les quantites, tu verifies, puis il cree le
                meme Transfer Order avec la photo jointe.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <BackButton href="/depots/transfer-order" label="Retour" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <PhotoTransferOrderForm depots={depots} />
      </div>
    </main>
  );
}
