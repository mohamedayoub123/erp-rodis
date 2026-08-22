import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SubmitButton } from "@/app/_components/submit-button";
import {
  backfillAchatsMpAction,
  backfillCommandesAction,
  backfillEntreeProductionAction,
  backfillFabricationAction,
  fetchBackfillCounts,
} from "./actions";

// Le rattrapage de plusieurs centaines d'evenements peut prendre plus que la
// limite par defaut d'une fonction Vercel - relevee explicitement (60s,
// maximum autorise sur le plan Hobby).
export const maxDuration = 60;

function SectionBackfill({
  titre,
  description,
  total,
  avecEcriture,
  action,
  labelBouton,
}: {
  titre: string;
  description: string;
  total: number;
  avecEcriture: number;
  action: (formData: FormData) => void | Promise<void>;
  labelBouton: string;
}) {
  const restant = total - avecEcriture;
  return (
    <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <h2 className="text-lg font-bold text-slate-900">{titre}</h2>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      <p className="mt-2 text-sm font-semibold text-slate-800">
        {avecEcriture} / {total} ont deja une ecriture reelle
        {restant > 0 ? ` - ${restant} sans trace exacte disponible pour l'instant` : ""}
      </p>
      {total === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Rien a traiter.</p>
      ) : (
        <form action={action} className="mt-3">
          <SubmitButton
            pendingLabel="Traitement..."
            className="rounded-full bg-amber-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-amber-500"
          >
            {labelBouton}
          </SubmitButton>
        </form>
      )}
    </section>
  );
}

export default async function ComptabiliteBackfillPage() {
  noStore();

  const counts = await fetchBackfillCounts();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">
                Comptabilite
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Reconstituer l&apos;historique
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Cree les ecritures manquantes pour ce qui a deja eu lieu, uniquement quand une trace
                reelle existe (prix reellement connu, lot reellement identifie). Rien n&apos;est jamais
                invente ou approxime : un evenement sans trace reste sans ecriture pour toujours.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/comptabilite" label="Retour Comptabilite" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <SectionBackfill
          titre="Achats MP (reception)"
          description="A partir du prix reellement saisi a la reception de chaque lot - la donnee la plus fiable des 4, jamais une estimation."
          total={counts.achatsMpTotal}
          avecEcriture={counts.achatsMpAvecEcriture}
          action={backfillAchatsMpAction}
          labelBouton="Traiter les receptions MP"
        />

        <SectionBackfill
          titre="Fabrication (vrac)"
          description="A partir des lots MP reellement reserves/consommes pour chaque code (production_mp_reserve) - ignore les codes sans cette tracabilite (production trop ancienne)."
          total={counts.fabricationTotal}
          avecEcriture={counts.fabricationAvecEcriture}
          action={backfillFabricationAction}
          labelBouton="Traiter la Fabrication"
        />

        <SectionBackfill
          titre="Entree production"
          description="A partir des memes lots MP reellement reserves (vrac + conditionnement) - meme principe strict que la Fabrication."
          total={counts.entreeProductionTotal}
          avecEcriture={counts.entreeProductionAvecEcriture}
          action={backfillEntreeProductionAction}
          labelBouton="Traiter l'Entree production"
        />

        <SectionBackfill
          titre="Ventes livrees"
          description="Cout de vente calcule au prix de revient actuel (recette + FEFO), comme au moment de la livraison."
          total={counts.commandesTotal}
          avecEcriture={counts.commandesAvecEcriture}
          action={backfillCommandesAction}
          labelBouton="Traiter les ventes"
        />
      </div>
    </main>
  );
}
