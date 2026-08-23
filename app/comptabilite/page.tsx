import Link from "next/link";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";

const TILES = [
  {
    label: "Balance des comptes",
    href: "/comptabilite/balance",
    icon: "\u{2696}\u{FE0F}",
    description: "Tous les comptes en une fois : total debit/credit et solde - la valeur totale du stock.",
  },
  {
    label: "Journal",
    href: "/comptabilite/journal",
    icon: "\u{1F4D2}",
    description: "Toutes les ecritures generees automatiquement, avec leurs lignes debit/credit.",
  },
  {
    label: "Ecriture comptable",
    href: "/comptabilite/grand-livre",
    icon: "\u{1F4D6}",
    description: "Choisis un compte, vois toutes ses lignes avec le solde cumule.",
  },
  {
    label: "Plan comptable",
    href: "/comptabilite/plan-comptable",
    icon: "\u{1F4CB}",
    description: "Liste des comptes (structure SYSCOHADA) - ajoute ou modifie un compte.",
  },
  {
    label: "Ecriture manuelle",
    href: "/comptabilite/ecriture-manuelle",
    icon: "\u{270D}\u{FE0F}",
    description: "Saisis une ecriture sur n'importe quel compte du plan comptable, pour ce qui n'est pas deja automatique.",
  },
  {
    label: "Paie",
    href: "/comptabilite/paie",
    icon: "\u{1F4B0}",
    description: "Liste des employes - paye un mois pour generer l'ecriture de salaire automatiquement.",
  },
  {
    label: "Charges recurrentes",
    href: "/comptabilite/charges-recurrentes",
    icon: "\u{1F501}",
    description: "Loyer, assurance, abonnements... - regle un mois pour generer l'ecriture automatiquement.",
  },
  {
    label: "Immobilisations",
    href: "/comptabilite/immobilisations",
    icon: "\u{1F3ED}",
    description: "Machines, batiments... - ecriture d'achat automatique, dotation aux amortissements mois par mois.",
  },
  {
    label: "TVA",
    href: "/comptabilite/tva",
    icon: "\u{1F9FE}",
    description: "Declare la TVA collectee/deductible du mois - ecriture de solde generee automatiquement.",
  },
  {
    label: "Clients",
    href: "/clients",
    icon: "\u{1F465}",
    description: "Liste des clients - facture, paye, reste a payer.",
  },
  {
    label: "Fournisseurs",
    href: "/fournisseurs",
    icon: "\u{1F69A}",
    description: "Liste des fournisseurs - achete, paye, reste a payer.",
  },
  {
    label: "Prix de vente",
    href: "/comptabilite/prix-vente",
    icon: "\u{1F3F7}\u{FE0F}",
    description: "Prix de revient et prix de vente (standard + clients speciaux) de chaque produit fini.",
  },
  {
    label: "Bilan",
    href: "/comptabilite/bilan",
    icon: "\u{1F3DB}\u{FE0F}",
    description: "Actif / Passif au format SYSCOHADA - photo du patrimoine a aujourd'hui.",
  },
  {
    label: "Compte de resultat",
    href: "/comptabilite/compte-resultat",
    icon: "\u{1F4C8}",
    description: "Produits / Charges au format SYSCOHADA - resultat net de l'exercice.",
  },
] as const;

export default function ComptabilitePage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Comptabilite
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Ecritures generees automatiquement depuis les vrais evenements (achat/reception MP,
                fabrication, entree production).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/" label="Retour accueil" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {TILES.map((tile) => (
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
