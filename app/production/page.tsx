import Link from "next/link";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { getCurrentStockUser, getPageViewMap } from "@/lib/stock-auth";

const TILES = [
  {
    label: "Planning Production",
    href: "/production/suivi",
    pageKey: "productionSuiviHub",
    icon: "\u{1F4CB}",
    description: "Suis l'avancement reel par ligne : vrac termine, cartons produits jour par jour.",
  },
  {
    label: "Suivi Production",
    href: "/production/suivi-production",
    pageKey: "productionSuiviProductionListe",
    icon: "\u{1F4CA}",
    description: "Rapports de poste : equipe, dechets, arrets, cadence, poids reel.",
  },
  {
    label: "Programme par ligne",
    href: "/programe-par-ligne",
    pageKey: "programeParLigne",
    icon: "\u{1F5D3}\u{FE0F}",
    description: "Planning du jour par zone/chaine : produit, qt carton, vrac a fabriquer, plateforme.",
  },
  {
    label: "Historique programme",
    href: "/historique-programme",
    pageKey: "historiqueProgramme",
    icon: "\u{1F4DC}",
    description: "Retrouve les programmes deja enregistres (MB1, MB2...).",
  },
  {
    label: "Ravitailleur par ligne",
    href: "/ravitailleur-par-ligne",
    pageKey: "ravitailleurParLigne",
    icon: "\u{1F9CD}",
    description: "Assigne la personne qui approvisionne chaque zone/chaine.",
  },
  {
    label: "Historique Programme Dispatcher",
    href: "/historique-programme-dispatcher",
    pageKey: "historiqueProgrammeDispatcher",
    icon: "\u{1F4D1}",
    description: "Retrouve les enregistrements pris depuis Programme Dispatcher (PD1, PD2...).",
  },
  {
    label: "Code par article",
    href: "/code-par-article",
    pageKey: "codeParArticle",
    icon: "\u{1F3F7}\u{FE0F}",
    description: "Code auto et code manuel de chaque article, modifiables directement ici.",
  },
  {
    label: "Rapport",
    href: "/production/rapport",
    pageKey: "productionRapportHub",
    icon: "\u{1F4C4}",
    description: "Tous les rapports de production.",
  },
  {
    label: "Machines",
    href: "/production/machines",
    pageKey: "machines",
    icon: "\u{2699}\u{FE0F}",
    description: "Liste des machines de production : zone, type, capacite.",
  },
] as const;

export default async function ProductionPage() {
  const currentUser = await getCurrentStockUser();
  const pageViewMap = await getPageViewMap(currentUser);
  const visibleTiles = TILES.filter((tile) => pageViewMap[tile.pageKey] ?? false);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Production
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/" label="Retour accueil" />
              <RefreshButton />
            </div>
          </div>
        </section>

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
      </div>
    </main>
  );
}
