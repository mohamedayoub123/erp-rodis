import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { getCurrentStockUser, getPageViewMap } from "@/lib/stock-auth";

// Page "Eau" : regroupe les deux pages du traitement de l'eau. Chaque tuile
// n'apparait que si l'utilisateur a le droit de voir la page correspondante.
const TILES = [
  {
    label: "Prix des consommables",
    href: "/cout/prix-litre-eau",
    pageKey: "coutEau",
    icon: "\u{1F4A7}",
    description:
      "Prix d'une unite de chaque consommable (filtres 10/5/1 micron, produit test TH, produits test chlore A/B/C, produit chlore, sodium sulphite, UV, membrane, sel, electricite), enregistres mois par mois.",
  },
  {
    label: "Consommation par mois",
    href: "/cout/consommation-eau",
    pageKey: "coutEauConso",
    icon: "\u{1F9EA}",
    description: "Ce qui a ete consomme chaque mois sur la Ligne 1 et la Ligne 2.",
  },
  {
    label: "Prix 1 litre",
    href: "/cout/prix-1-litre",
    pageKey: "coutEauPrixLitre",
    icon: "\u{1F4B0}",
    description: "Cout d'un litre d'eau du mois choisi : consommables + electricite, divises par les litres du mois.",
  },
] as const;

export default async function EauHubPage() {
  noStore();
  const currentUser = await getCurrentStockUser();
  const pageViewMap = await getPageViewMap(currentUser);
  const visibleTiles = TILES.filter((tile) => pageViewMap[tile.pageKey] ?? false);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#eaf6fb_0%,#f5fbfd_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Eau</h1>
              <p className="mt-2 text-sm text-slate-600">
                Traitement de l&apos;eau : les prix des consommables, la consommation de chaque mois et le prix d&apos;un litre.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/cout" label="Retour Cout" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {visibleTiles.length === 0 ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            Aucune page accessible pour le moment.
          </section>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2">
            {visibleTiles.map((tile) => (
              <Link
                key={tile.href}
                href={tile.href}
                className="group flex flex-col gap-3 rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_44px_rgba(15,23,42,0.12)]"
              >
                <span className="text-4xl" aria-hidden="true">
                  {tile.icon}
                </span>
                <span className="text-lg font-bold text-slate-900">{tile.label}</span>
                <span className="text-sm text-slate-600">{tile.description}</span>
              </Link>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
