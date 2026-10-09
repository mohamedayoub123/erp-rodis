import Link from "next/link";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { listerTrimestresPr4, type TrimestrePr4 } from "@/lib/trimestres-pr4";
import { BoutonDiaporama } from "./diaporama";

// En-tete de la page d'un trimestre : titre, trimestres en onglets, boutons Diaporama et PowerPoint.
export async function EnTeteRapport({ trimestre }: { trimestre: TrimestrePr4 }) {
  const utilisateur = await getCurrentStockUser();
  const peutEcrire = await canWritePageUser(utilisateur, "qualiteRevueProcessus");
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
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <BackButton href="/qualite/revue-processus/pr4/trimestre" label="Retour trimestres" />
          <BoutonDiaporama />
          <a
            href={`/qualite/revue-processus/pr4/trimestre/${trimestre.code}/pptx`}
            download
            className="rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-violet-500"
          >
            Exporter en PowerPoint
          </a>
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

      {peutEcrire ? (
        <p className="text-xs text-slate-500">
          Pour saisir la production réalisée d&apos;un mois (graphique KPI), le SQL{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5">scripts/sql/create_pr4_production_realisee.sql</code> doit avoir été
          exécuté dans Supabase.
        </p>
      ) : null}
    </section>
  );
}
