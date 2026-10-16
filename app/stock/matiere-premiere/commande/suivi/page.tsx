import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { canViewPageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { formatDate, formatDateTime } from "@/lib/format-date";
import {
  CLE_PAGE_SUIVI_CONTENEURS,
  LIBELLE_PHASE,
  URL_PAGE_IMPORT_MP,
  URL_PAGE_SUIVI_CONTENEURS,
  classePhase,
  diagnosticCleApi,
  suiviConfigure,
  type EtatSuivi,
} from "@/lib/suivi-conteneur";
import { cleDossier, lireLignesSuivi, type LigneSuivi } from "@/lib/suivi-conteneur-db";
import { decodeDossierId } from "../dossier-id";
import { enregistrerConteneursDossierAction, supprimerConteneurSuiviAction } from "./actions";
import { ActualisationAuto } from "./actualisation-auto";
import { CarteConteneurs, type MarqueurConteneur } from "./carte-conteneurs";

type SearchParams = Promise<{ dossier?: string; erreur?: string; ok?: string; avertissement?: string }>;

const CHAMP = "rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-normal text-slate-900 outline-none";

function libelleDossier(ligne: LigneSuivi): string {
  const parties = [ligne.n_doss_4d, ligne.n_doss_erp].filter(Boolean);
  return parties.length > 0 ? parties.join(" / ") : "Sans dossier";
}

// Ecart entre l'arrivee prevue actuelle et la premiere date annoncee, en jours (positif = retard).
function ecartEtaJours(etat: EtatSuivi): number | null {
  if (!etat.eta || !etat.etaInitiale) return null;
  const jours = Math.round((new Date(etat.eta).getTime() - new Date(etat.etaInitiale).getTime()) / 86_400_000);
  return Number.isFinite(jours) && jours !== 0 ? jours : null;
}

export default async function SuiviConteneursPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;

  const utilisateur = await getCurrentStockUser();
  if (!(await canViewPageUser(utilisateur, CLE_PAGE_SUIVI_CONTENEURS))) {
    redirect(URL_PAGE_IMPORT_MP);
  }
  const peutModifier = await canWritePageUser(utilisateur, "commandeMp");

  const { lignes: toutes, tableDisponible } = await lireLignesSuivi();
  const dossierFiltre = params.dossier ? decodeDossierId(params.dossier) : null;
  const cleFiltre = dossierFiltre ? cleDossier(dossierFiltre.nDoss4d, dossierFiltre.nDossErp) : null;
  const lignes = cleFiltre ? toutes.filter((ligne) => cleDossier(ligne.n_doss_4d, ligne.n_doss_erp) === cleFiltre) : toutes;

  const configure = suiviConfigure();
  const idsAffiches = lignes.map((ligne) => ligne.id);
  // Le service de suivi refuse la cle : on decrit la cle enregistree (longueur, defauts de copie), jamais sa valeur
  const diagnosticCle = lignes.some((ligne) => ligne.message?.startsWith("Cle API refusee")) ? diagnosticCleApi() : null;
  const enAttente = lignes.some((ligne) => !ligne.etat);

  const marqueurs: MarqueurConteneur[] = lignes
    .filter((ligne) => ligne.etat)
    .map((ligne) => ({
      id: ligne.id,
      conteneur: ligne.numero_conteneur,
      dossier: libelleDossier(ligne),
      phase: (ligne.etat as EtatSuivi).phase,
      navire: (ligne.etat as EtatSuivi).navire,
      pol: (ligne.etat as EtatSuivi).pol,
      pod: (ligne.etat as EtatSuivi).pod,
      atd: (ligne.etat as EtatSuivi).atd,
      eta: (ligne.etat as EtatSuivi).eta,
      ata: (ligne.etat as EtatSuivi).ata,
    }));
  const carteUtile = marqueurs.some(
    (m) => m.pol && m.pol.lat !== null && m.pol.lon !== null && m.pod && m.pod.lat !== null && m.pod.lon !== null
  );

  const urlRetour = `${URL_PAGE_SUIVI_CONTENEURS}${params.dossier ? `?dossier=${encodeURIComponent(params.dossier)}` : ""}`;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Suivi conteneurs</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Ecris le dossier et le numero du conteneur : le navire, le port d&apos;arrivee et la date d&apos;arrivee prevue se
                mettent a jour tout seuls. Le meme numero se saisit aussi directement sur la liste Import MP.
              </p>
            </div>
            <div className="no-print flex flex-wrap items-center gap-3">
              <BackButton href={URL_PAGE_IMPORT_MP} label="Retour Import MP" />
              <RefreshButton />
              {configure && lignes.length > 0 ? <ActualisationAuto ids={idsAffiches} enAttente={enAttente} avecBouton /> : null}
            </div>
          </div>
        </section>

        {params.erreur ? (
          <div className="rounded-[1.75rem] border border-red-200 bg-red-50 px-6 py-4 text-sm font-semibold text-red-700">{params.erreur}</div>
        ) : null}
        {params.ok ? (
          <div className="rounded-[1.75rem] border border-emerald-200 bg-emerald-50 px-6 py-4 text-sm font-semibold text-emerald-800">{params.ok}</div>
        ) : null}
        {params.avertissement ? (
          <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50 px-6 py-4 text-sm font-semibold text-amber-900">{params.avertissement}</div>
        ) : null}
        {!tableDisponible ? (
          <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50 px-6 py-4 text-sm font-semibold text-amber-900">
            La table du suivi n&apos;existe pas encore : lance le SQL <span className="font-mono">create_suivi_conteneurs_import.sql</span>{" "}
            dans Supabase (SQL Editor).
          </div>
        ) : null}
        {tableDisponible && !configure ? (
          <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50 px-6 py-4 text-sm font-semibold text-amber-900">
            Le suivi automatique n&apos;est pas encore active : la cle du service de suivi (<span className="font-mono">TERMINAL49_API_KEY</span>) n&apos;est
            pas configuree. Les numeros de conteneur sont enregistres, le suivi demarrera des que la cle sera ajoutee.
          </div>
        ) : null}

        {diagnosticCle ? (
          <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-900">
            <p className="font-semibold">Le service de suivi refuse la cle API.</p>
            <p className="mt-1">{diagnosticCle}</p>
            <p className="mt-1">
              Cree une nouvelle cle sur app.terminal49.com/developers/api-keys (cle API, pas une cle &quot;publishable&quot;), copie-la avec le
              bouton de copie, puis remplace la valeur de TERMINAL49_API_KEY dans Vercel (Settings, Environment Variables) et redeploie.
            </p>
          </div>
        ) : null}

        {peutModifier && tableDisponible ? (
          <section className="no-print rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="mb-3 text-lg font-bold text-slate-900">Suivre un conteneur</h2>
            <form action={enregistrerConteneursDossierAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <input type="hidden" name="retour" value={urlRetour} />
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Doss. 4D
                <input type="text" name="n_doss_4d" defaultValue={dossierFiltre?.nDoss4d ?? ""} autoComplete="off" className={CHAMP} />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Doss. ERP
                <input type="text" name="n_doss_erp" defaultValue={dossierFiltre?.nDossErp ?? ""} autoComplete="off" className={CHAMP} />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                N° conteneur (plusieurs possibles)
                <input type="text" name="numeros" required placeholder="MSCU1234567" autoComplete="off" className={`${CHAMP} uppercase`} />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                N° BL / booking (si tu l&apos;as)
                <input type="text" name="numero_bl" autoComplete="off" className={`${CHAMP} uppercase`} />
              </label>
              <div className="flex items-end">
                <SubmitButton
                  pendingLabel="Envoi..."
                  className="rounded-full bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-800"
                >
                  Suivre
                </SubmitButton>
              </div>
            </form>
            <p className="mt-2 text-xs text-slate-500">
              Le numero BL / booking est facultatif, mais plusieurs compagnies maritimes ne retrouvent pas un conteneur avec son seul
              numero : si le suivi reste introuvable, ajoute-le.
            </p>
          </section>
        ) : null}

        {cleFiltre ? (
          <p className="text-sm text-slate-600">
            Dossier {dossierFiltre?.nDoss4d || dossierFiltre?.nDossErp || "sans nom"} uniquement -{" "}
            <Link href={URL_PAGE_SUIVI_CONTENEURS} className="font-semibold text-sky-700 underline">
              afficher tous les conteneurs
            </Link>
          </p>
        ) : null}

        {lignes.length === 0 ? (
          <div className="rounded-[1.75rem] border border-black/5 bg-white px-6 py-8 text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            Aucun conteneur suivi pour le moment.
          </div>
        ) : (
          <>
            {carteUtile ? (
              <section className="rounded-[1.75rem] border border-black/5 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <CarteConteneurs marqueurs={marqueurs} />
                <p className="mt-2 text-xs text-slate-500">
                  Points : port de depart (noir) et port d&apos;arrivee (bleu). La position du navire est une <strong>estimation</strong> (depart
                  reel puis arrivee prevue le long de la route la plus courte) ; pour sa position exacte, utilise le lien « Suivre le navire
                  en direct » du conteneur.
                </p>
              </section>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {lignes.map((ligne) => {
                const etat = ligne.etat;
                const ecart = etat ? ecartEtaJours(etat) : null;
                return (
                  <article
                    key={ligne.id}
                    className="space-y-3 rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-lg font-black tracking-wide text-slate-900">{ligne.numero_conteneur}</p>
                        <p className="text-sm text-slate-600">
                          Dossier {libelleDossier(ligne)}
                          {ligne.numero_bl ? ` - BL ${ligne.numero_bl}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {etat ? (
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${classePhase(etat.phase)}`}>
                            {LIBELLE_PHASE[etat.phase]}
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                            {configure ? "Recherche en cours" : "En attente de la cle"}
                          </span>
                        )}
                        {peutModifier ? (
                          <form action={supprimerConteneurSuiviAction} className="no-print">
                            <input type="hidden" name="id" value={ligne.id} />
                            <input type="hidden" name="retour" value={urlRetour} />
                            <SubmitButton
                              pendingLabel="..."
                              className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                            >
                              Retirer
                            </SubmitButton>
                          </form>
                        ) : null}
                      </div>
                    </div>

                    {etat ? (
                      <>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                          <div>
                            <dt className="text-xs font-semibold text-slate-500">Compagnie</dt>
                            <dd className="text-slate-900">{etat.compagnie || "-"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold text-slate-500">Navire</dt>
                            <dd className="text-slate-900">
                              {etat.navire || "-"}
                              {etat.voyage ? <span className="text-slate-500"> (voyage {etat.voyage})</span> : null}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold text-slate-500">Trajet</dt>
                            <dd className="text-slate-900">
                              {etat.pol?.nom || "?"} &rarr; {etat.pod?.nom || "?"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold text-slate-500">Arrivee {etat.ata ? "reelle" : "prevue"}</dt>
                            <dd className="font-semibold text-slate-900">
                              {formatDate(etat.ata ?? etat.eta)}
                              {!etat.ata && ecart !== null ? (
                                <span className={`ml-2 text-xs font-semibold ${ecart > 0 ? "text-red-600" : "text-emerald-700"}`}>
                                  {ecart > 0 ? `+${ecart}` : ecart} jour(s) par rapport a la date initiale
                                </span>
                              ) : null}
                            </dd>
                          </div>
                        </dl>

                        <ol className="space-y-1.5 border-t border-slate-100 pt-3">
                          {etat.evenements.map((evenement) => (
                            <li key={evenement.code} className="flex items-center gap-2 text-sm">
                              <span
                                className={`inline-block h-3 w-3 shrink-0 rounded-full ${
                                  evenement.prevu ? "border-2 border-slate-300 bg-white" : "bg-emerald-600"
                                }`}
                              />
                              <span className={evenement.prevu ? "text-slate-500" : "font-medium text-slate-900"}>{evenement.libelle}</span>
                              <span className="ml-auto text-xs text-slate-500">
                                {evenement.date ? `${formatDate(evenement.date)}${evenement.prevu ? " (prevu)" : ""}` : "-"}
                              </span>
                            </li>
                          ))}
                        </ol>

                        {etat.imo ? (
                          <a
                            href={`https://www.marinetraffic.com/en/ais/details/ships/imo:${encodeURIComponent(etat.imo)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block text-sm font-semibold text-sky-700 underline"
                          >
                            Suivre le navire en direct
                          </a>
                        ) : null}
                      </>
                    ) : null}

                    {ligne.message ? (
                      <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">{ligne.message}</p>
                    ) : null}
                    <p className="text-xs text-slate-400">
                      {ligne.derniere_maj ? `Mis a jour le ${formatDateTime(ligne.derniere_maj)}` : "Pas encore interroge"}
                    </p>
                  </article>
                );
              })}
            </div>
          </>
        )}

      </div>
    </main>
  );
}
