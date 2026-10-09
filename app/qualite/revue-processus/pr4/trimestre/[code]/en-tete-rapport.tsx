import Link from "next/link";
import { BackButton } from "@/app/_components/back-button";
import { ConfirmSubmitButton } from "@/app/_components/confirm-submit-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { listerTrimestresPr4, type TrimestrePr4 } from "@/lib/trimestres-pr4";
import { figerRapportAction, rouvrirRapportAction } from "./actions-rapport";
import { jourHeure } from "./bandeau-fiabilite";
import { BoutonDiaporama } from "./diaporama";
import { lireRapportFige } from "./donnees-rapport";

// En-tete de la page d'un trimestre : titre, statut (Brouillon / Valide), trimestres en onglets, boutons Diaporama,
// PowerPoint, Figer / Rouvrir le rapport.
const PAGE = "qualiteRevueProcessus";
const bouton = "rounded-full px-5 py-2 text-sm font-semibold transition";

export async function EnTeteRapport({
  trimestre,
  erreur,
  message,
}: {
  trimestre: TrimestrePr4;
  erreur?: string;
  message?: string;
}) {
  const utilisateur = await getCurrentStockUser();
  const [lecture, peutEcrire, peutRouvrir] = await Promise.all([
    lireRapportFige(trimestre.code),
    canWritePageUser(utilisateur, PAGE),
    canDeletePageUser(utilisateur, PAGE),
  ]);
  const { fige } = lecture;
  const autres = listerTrimestresPr4();

  return (
    <section className="space-y-4 rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">Revue Processus</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{trimestre.libelle}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {trimestre.periode}
            {trimestre.enCours ? " (trimestre en cours)" : ""}
          </p>
          <p className="mt-2">
            {fige ? (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                Validé · chiffres figés le {jourHeure(fige.le)}
                {fige.par ? ` par ${fige.par}` : ""}
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                Brouillon · chiffres en direct
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <BackButton href="/qualite/revue-processus/pr4/trimestre" label="Retour trimestres" />
          <BoutonDiaporama />
          <a
            href={`/qualite/revue-processus/pr4/trimestre/${trimestre.code}/pptx`}
            download
            className={`${bouton} bg-violet-600 text-white hover:bg-violet-500`}
          >
            Exporter en PowerPoint
          </a>
          {peutEcrire && !fige ? (
            <form action={figerRapportAction}>
              <input type="hidden" name="code" value={trimestre.code} />
              <ConfirmSubmitButton
                pendingLabel="Blocage..."
                confirmMessage={`Figer le rapport ${trimestre.libelle} ? Les chiffres ne bougeront plus (page et PowerPoint), même si vous corrigez l'ERP ensuite, jusqu'à ce que vous le rouvriez.`}
                className={`${bouton} border border-emerald-300 bg-emerald-50 text-emerald-800 hover:border-emerald-500 disabled:opacity-60`}
              >
                Figer le rapport
              </ConfirmSubmitButton>
            </form>
          ) : null}
          {peutRouvrir && fige ? (
            <form action={rouvrirRapportAction}>
              <input type="hidden" name="code" value={trimestre.code} />
              <ConfirmSubmitButton
                pendingLabel="Réouverture..."
                confirmMessage={`Rouvrir le rapport ${trimestre.libelle} ? Les chiffres redeviennent ceux de l'ERP en direct.`}
                className={`${bouton} border border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-500 disabled:opacity-60`}
              >
                Rouvrir le rapport
              </ConfirmSubmitButton>
            </form>
          ) : null}
          <RefreshButton />
        </div>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Autres trimestres">
        {autres.map((t) => (
          <Link
            key={t.code}
            href={`/qualite/revue-processus/pr4/trimestre/${t.code}`}
            aria-current={t.code === trimestre.code ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm transition ${
              t.code === trimestre.code
                ? "border-violet-600 bg-violet-600 font-semibold text-white"
                : "border-slate-200 text-slate-700 hover:border-violet-300"
            }`}
          >
            T{t.trimestre} {t.annee}
          </Link>
        ))}
      </div>

      {erreur ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{erreur}</p> : null}
      {message ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{message}</p> : null}
      {peutEcrire && !lecture.disponible ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Pour figer le rapport et saisir la production réalisée d&apos;un mois, exécutez d&apos;abord le SQL{" "}
          <code className="rounded bg-white px-1.5 py-0.5 text-xs">scripts/sql/create_pr4_revue_production_et_figee.sql</code> dans
          Supabase (SQL Editor).
        </p>
      ) : null}
    </section>
  );
}
