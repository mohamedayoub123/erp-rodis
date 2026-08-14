import Link from "next/link";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { getCurrentStockUser, getPageViewMap } from "@/lib/stock-auth";

type Tile = {
  label: string;
  href: string;
  pageKey: string;
  icon: string;
  description: string;
};

const TILES: Tile[] = [
  {
    label: "Specs Labo (Vrac)",
    href: "/qualite/specs",
    pageKey: "qualiteSpecs",
    icon: "\u{1F9EA}",
    description:
      "Choisis un article vrac : intervalle pH, viscosite, densite, degre alcool, stabilite, couleur.",
  },
  {
    label: "Rapport Test labo",
    href: "/qualite/rapport",
    pageKey: "qualiteRapport",
    icon: "\u{1F4CB}",
    description:
      "Nombre de preparations, auto/semi auto, conforme/non conforme, a detruire, sous derogation.",
  },
  {
    label: "Historique Test labo",
    href: "/qualite/historique-test-labo",
    pageKey: "qualiteHistoriqueTestLabo",
    icon: "\u{1F4DC}",
    description: "Chaque Test labo enregistre, avec toutes les valeurs mesurees (pH, viscosite, couleur...).",
  },
  {
    label: "NC Confidentiel",
    href: "/qualite/nc-confidentiel",
    pageKey: "qualiteNcConfidentiel",
    icon: "\u{1F512}",
    description: "Suivi des Non-Conformites d'audit interne.",
  },
  {
    label: "TAF Confidentiel",
    href: "/qualite/taf-confidentiel",
    pageKey: "qualiteTafConfidentiel",
    icon: "\u{1F512}",
    description: "Suivi des TAF d'audit interne.",
  },
];

export default async function QualitePage() {
  const currentUser = await getCurrentStockUser();
  const pageViewMap = await getPageViewMap(currentUser);
  const visibleTiles = TILES.filter((tile) => pageViewMap[tile.pageKey] ?? false);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f0ff_0%,#faf8ff_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Qualite</h1>
              <p className="mt-2 text-sm text-slate-600">Choisis la page que tu veux ouvrir.</p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/" label="Retour accueil" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {visibleTiles.length === 0 ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            Aucune page pour le moment - dis-moi ce que tu veux ajouter ici.
          </section>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
