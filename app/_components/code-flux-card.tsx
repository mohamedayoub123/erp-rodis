import Link from "next/link";
import type {
  CodeFlux,
  CodeFluxEtape,
  CodeFluxMpSource,
  CodeFluxStageEntry,
  CodeFluxStatut,
  CodeFluxTestLabo,
} from "@/lib/production-code-flux";
import { formatDate } from "@/lib/format-date";
import { morceauxLivraison } from "@/lib/livraison-libelle";

// ---------------------------------------------------------------- couleurs
// Une couleur par rubrique du parcours, reprise telle quelle dans la legende de la page : le titre, le trait a gauche
// et les pastilles d'une meme rubrique ont toujours la meme couleur. Les classes sont ecrites en entier (jamais
// construites) pour que Tailwind les trouve.
type Couleur = "sky" | "indigo" | "amber" | "orange" | "slate" | "fuchsia" | "emerald" | "blue" | "cyan" | "teal";

type StyleCouleur = {
  accent: string;
  entete: string;
  titre: string;
  texte: string;
  puce: string;
  fond: string;
  bordure: string;
  bande: string;
  barre: string;
  pastille: string;
  lien: string;
};

const STYLES: Record<Couleur, StyleCouleur> = {
  sky: {
    accent: "border-l-sky-500",
    entete: "bg-sky-50",
    titre: "text-sky-900",
    texte: "text-sky-700",
    puce: "bg-sky-500",
    fond: "bg-sky-50",
    bordure: "border-sky-200",
    bande: "bg-sky-600 text-white",
    barre: "bg-sky-500",
    pastille: "bg-sky-100 text-sky-900",
    lien: "bg-sky-100 text-sky-800 hover:bg-sky-200",
  },
  indigo: {
    accent: "border-l-indigo-500",
    entete: "bg-indigo-50",
    titre: "text-indigo-900",
    texte: "text-indigo-700",
    puce: "bg-indigo-500",
    fond: "bg-indigo-50",
    bordure: "border-indigo-200",
    bande: "bg-indigo-600 text-white",
    barre: "bg-indigo-500",
    pastille: "bg-indigo-100 text-indigo-900",
    lien: "bg-indigo-100 text-indigo-800 hover:bg-indigo-200",
  },
  amber: {
    accent: "border-l-amber-500",
    entete: "bg-amber-50",
    titre: "text-amber-900",
    texte: "text-amber-700",
    puce: "bg-amber-500",
    fond: "bg-amber-50",
    bordure: "border-amber-200",
    bande: "bg-amber-600 text-white",
    barre: "bg-amber-500",
    pastille: "bg-amber-100 text-amber-900",
    lien: "bg-amber-100 text-amber-800 hover:bg-amber-200",
  },
  orange: {
    accent: "border-l-orange-500",
    entete: "bg-orange-50",
    titre: "text-orange-900",
    texte: "text-orange-700",
    puce: "bg-orange-500",
    fond: "bg-orange-50",
    bordure: "border-orange-200",
    bande: "bg-orange-600 text-white",
    barre: "bg-orange-500",
    pastille: "bg-orange-100 text-orange-900",
    lien: "bg-orange-100 text-orange-800 hover:bg-orange-200",
  },
  slate: {
    accent: "border-l-slate-500",
    entete: "bg-slate-100",
    titre: "text-slate-900",
    texte: "text-slate-700",
    puce: "bg-slate-500",
    fond: "bg-slate-50",
    bordure: "border-slate-200",
    bande: "bg-slate-700 text-white",
    barre: "bg-slate-500",
    pastille: "bg-slate-100 text-slate-800",
    lien: "bg-slate-100 text-slate-800 hover:bg-slate-200",
  },
  fuchsia: {
    accent: "border-l-fuchsia-500",
    entete: "bg-fuchsia-50",
    titre: "text-fuchsia-900",
    texte: "text-fuchsia-700",
    puce: "bg-fuchsia-500",
    fond: "bg-fuchsia-50",
    bordure: "border-fuchsia-200",
    bande: "bg-fuchsia-600 text-white",
    barre: "bg-fuchsia-500",
    pastille: "bg-fuchsia-100 text-fuchsia-900",
    lien: "bg-fuchsia-100 text-fuchsia-800 hover:bg-fuchsia-200",
  },
  emerald: {
    accent: "border-l-emerald-500",
    entete: "bg-emerald-50",
    titre: "text-emerald-900",
    texte: "text-emerald-700",
    puce: "bg-emerald-500",
    fond: "bg-emerald-50",
    bordure: "border-emerald-200",
    bande: "bg-emerald-600 text-white",
    barre: "bg-emerald-500",
    pastille: "bg-emerald-100 text-emerald-900",
    lien: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200",
  },
  blue: {
    accent: "border-l-blue-500",
    entete: "bg-blue-50",
    titre: "text-blue-900",
    texte: "text-blue-700",
    puce: "bg-blue-500",
    fond: "bg-blue-50",
    bordure: "border-blue-200",
    bande: "bg-blue-600 text-white",
    barre: "bg-blue-500",
    pastille: "bg-blue-100 text-blue-900",
    lien: "bg-blue-100 text-blue-800 hover:bg-blue-200",
  },
  cyan: {
    accent: "border-l-cyan-500",
    entete: "bg-cyan-50",
    titre: "text-cyan-900",
    texte: "text-cyan-700",
    puce: "bg-cyan-500",
    fond: "bg-cyan-50",
    bordure: "border-cyan-200",
    bande: "bg-cyan-600 text-white",
    barre: "bg-cyan-500",
    pastille: "bg-cyan-100 text-cyan-900",
    lien: "bg-cyan-100 text-cyan-800 hover:bg-cyan-200",
  },
  teal: {
    accent: "border-l-teal-500",
    entete: "bg-teal-50",
    titre: "text-teal-900",
    texte: "text-teal-700",
    puce: "bg-teal-500",
    fond: "bg-teal-50",
    bordure: "border-teal-200",
    bande: "bg-teal-600 text-white",
    barre: "bg-teal-500",
    pastille: "bg-teal-100 text-teal-900",
    lien: "bg-teal-100 text-teal-800 hover:bg-teal-200",
  },
};

// Legende de la page "Flux par Code" : une pastille par rubrique, de la couleur de la rubrique dans la carte
export const LEGENDE_FLUX: { label: string; classe: string }[] = [
  { label: "Avancement", classe: STYLES.sky.pastille },
  { label: "Programme (PL) et dispatch (PD)", classe: STYLES.indigo.pastille },
  { label: "Matiere premiere", classe: STYLES.amber.pastille },
  { label: "Articles de conditionnement", classe: STYLES.orange.pastille },
  { label: "Fabrication", classe: STYLES.blue.pastille },
  { label: "Conditionnement", classe: STYLES.cyan.pastille },
  { label: "Emballage", classe: STYLES.teal.pastille },
  { label: "Test labo", classe: STYLES.fuchsia.pastille },
  { label: "Produit fini et livraisons", classe: STYLES.emerald.pastille },
];

// ---------------------------------------------------------------- petits composants
function Section({
  titre,
  detail,
  couleur,
  insecable,
  children,
}: {
  titre: string;
  detail?: string;
  couleur: Couleur;
  // rubrique courte : jamais coupee entre 2 pages du PDF (les longues, comme la production, peuvent l'etre)
  insecable?: boolean;
  children: React.ReactNode;
}) {
  const s = STYLES[couleur];
  // <div role="region"> et non <section> : a l'impression (PDF), les regles globales de l'ERP aplatissent les <section>
  // (plus de bordure ni de marge) et cachent les <header> - les couleurs de la rubrique disparaitraient.
  return (
    <div
      role="region"
      aria-label={titre}
      className={`overflow-hidden rounded-2xl border border-l-8 border-slate-200 bg-white shadow-sm print:shadow-none ${
        insecable ? "print:break-inside-avoid" : ""
      } ${s.accent}`}
    >
      {/* print:break-after-avoid : le titre d'une rubrique ne reste jamais seul en bas d'une page du PDF */}
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4 print:break-after-avoid ${s.entete}`}>
        <span className={`h-4 w-4 shrink-0 rounded-full ${s.puce}`} />
        <h3 className={`text-2xl font-black tracking-tight ${s.titre}`}>{titre}</h3>
        {detail ? <span className="text-base font-semibold text-slate-500">{detail}</span> : null}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

function Pastille({ couleur, children }: { couleur: Couleur; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-base font-bold ${STYLES[couleur].pastille}`}>
      {children}
    </span>
  );
}

function LienPastille({ href, couleur, children }: { href: string; couleur: Couleur; children: React.ReactNode }) {
  return (
    <Link href={href} className={`inline-flex items-center rounded-full px-4 py-1.5 text-base font-bold transition ${STYLES[couleur].lien}`}>
      {children}
    </Link>
  );
}

function Vide({ children = "-" }: { children?: React.ReactNode }) {
  return <p className="text-lg font-semibold text-slate-400">{children}</p>;
}

// Meme libelle que Historique Test Labo/Rapport Test Labo (app/qualite/...)
// - jamais partage en dur, duplique ici volontairement (meme convention que
// les autres rapports de cette app).
function dispositionQualiteLabel(value: string | null) {
  if (value === "a_recuperer") return "A recuperer";
  if (value === "a_detruire") return "A detruire";
  if (value === "non_conforme") return "Non conforme";
  return "Conforme";
}

function classeDisposition(value: string | null) {
  if (value === "a_recuperer") return "bg-amber-100 text-amber-900";
  if (value === "a_detruire" || value === "non_conforme") return "bg-red-100 text-red-800";
  return "bg-emerald-100 text-emerald-900";
}

function fieldOrDash(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function DetailField({ label, value }: { label: string; value: string | number | null | undefined }) {
  const texte = fieldOrDash(value);
  return (
    <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50 px-4 py-3 print:break-inside-avoid">
      <p className="text-xs font-bold uppercase tracking-wide text-fuchsia-700">{label}</p>
      <p className={`mt-1 text-xl font-black ${texte === "-" ? "text-slate-300" : "text-slate-900"}`}>{texte}</p>
    </div>
  );
}

function TestLaboSection({ testLabo }: { testLabo: CodeFluxTestLabo | null }) {
  const infos = testLabo
    ? [
        testLabo.nomLabo ? testLabo.nomLabo : null,
        testLabo.utilisateur ? `saisi par ${testLabo.utilisateur}` : null,
        testLabo.datePriseEchantillon
          ? `echantillon pris le ${formatDate(testLabo.datePriseEchantillon)}`
          : testLabo.dateSaisie
            ? `saisi le ${formatDate(testLabo.dateSaisie)}`
            : null,
      ].filter((info): info is string => Boolean(info))
    : [];
  return (
    <Section titre="Test labo" couleur="fuchsia" insecable>
      {testLabo ? (
        <div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className={`rounded-3xl px-5 py-2 text-xl font-black ${classeDisposition(testLabo.dispositionQualite)}`}>
              {dispositionQualiteLabel(testLabo.dispositionQualite)}
              {testLabo.sousDerogation ? " (sous derogation)" : ""}
            </span>
            {infos.length > 0 ? <p className="text-lg font-semibold text-slate-600">{infos.join(" - ")}</p> : null}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 print:grid-cols-4">
            <DetailField label="pH" value={testLabo.ph} />
            <DetailField label="Densite" value={testLabo.densite} />
            <DetailField label="Viscosite" value={testLabo.viscosite} />
            <DetailField label="Degre alcool" value={testLabo.degreAlcool} />
            <DetailField label="Stabilite" value={testLabo.stabilite} />
            <DetailField label="Couleur" value={testLabo.couleur} />
            <DetailField label="Odeur" value={testLabo.odeur} />
            <DetailField label="Texture" value={testLabo.texture} />
            <DetailField label="Taux humidite" value={testLabo.tauxHumidite} />
            <DetailField label="Pression atm." value={testLabo.pressionAtmospherique} />
            <DetailField label="Temperature" value={testLabo.temperatureTest} />
            {testLabo.motifDerogation ? (
              <div className="col-span-full">
                <DetailField label="Motif derogation" value={testLabo.motifDerogation} />
              </div>
            ) : null}
            {testLabo.remarque ? (
              <div className="col-span-full">
                <DetailField label="Remarque" value={testLabo.remarque} />
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <Vide>Pas encore de Test labo saisi pour ce code.</Vide>
      )}
    </Section>
  );
}

function MpSourceItem({ mp, couleur }: { mp: CodeFluxMpSource; couleur: "amber" | "orange" }) {
  const s = STYLES[couleur];
  return (
    <div className={`rounded-2xl border p-4 print:break-inside-avoid ${s.bordure} ${s.fond}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-xl font-black text-slate-900">{mp.articleNom}</p>
        <p className={`text-3xl font-black tabular-nums ${s.texte}`}>{mp.quantiteReservee.toLocaleString("fr-FR")}</p>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {mp.numeroLot ? <Pastille couleur={couleur}>lot {mp.numeroLot}</Pastille> : null}
        <Pastille couleur="slate">depot {mp.depotNom}</Pastille>
        {mp.datePeremption ? <Pastille couleur="amber">expire le {formatDate(mp.datePeremption)}</Pastille> : null}
      </div>
      {mp.tos.length === 0 ? (
        <p className="mt-3 text-base text-slate-600">
          Aucun Transfer Order valide retrouve pour ce lot/depot (stock peut-etre plus ancien que le suivi TO/TI).
        </p>
      ) : (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
          {mp.tos.length > 1 ? (
            <p className="mb-2 text-base text-slate-500">
              {mp.tos.length} Transfer Order ont reellement livre ce lot a ce depot (numero de lot reutilise sur
              plusieurs livraisons) :
            </p>
          ) : null}
          <ul className="space-y-2">
            {mp.tos.map((to) => (
              <li key={to.href} className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <LienPastille href={to.href} couleur="sky">
                  {to.label}
                </LienPastille>
                {to.tis.length > 0 ? (
                  <>
                    <span className="text-sm font-bold uppercase tracking-wide text-slate-400">Transfer Invoice</span>
                    {to.tis.map((ti) => (
                      <LienPastille key={ti.href} href={ti.href} couleur="emerald">
                        {ti.label}
                      </LienPastille>
                    ))}
                  </>
                ) : (
                  <span className="text-base font-bold text-amber-700">pas encore de Transfer Invoice valide</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const NON_RENSEIGNE = "non renseigne";

function fieldValue(value: string | null) {
  return value || NON_RENSEIGNE;
}

// Champs pertinents PAR ETAPE (jamais tous en meme temps - voir
// production-code-flux.ts) - toujours affiches, meme vides ("non
// renseigne"), pour que l'absence d'info soit visible plutot que
// silencieusement masquee (demande explicite de l'utilisateur).
type StageFieldKey = keyof Pick<
  CodeFluxStageEntry,
  "machine" | "operateur" | "preparateur" | "chefLigne" | "chefZone" | "ravitailleur" | "tireur" | "scotcheuse"
>;
const STAGE_FIELDS: Record<"fabrication" | "conditionnement" | "emballage", { key: StageFieldKey; label: string }[]> = {
  fabrication: [
    { key: "machine", label: "Machine" },
    { key: "operateur", label: "Operateur" },
    { key: "preparateur", label: "Preparateur" },
  ],
  conditionnement: [
    { key: "machine", label: "Machine" },
    { key: "operateur", label: "Operateur" },
    { key: "chefLigne", label: "Chef de ligne" },
    { key: "chefZone", label: "Chef de zone" },
    { key: "ravitailleur", label: "Ravitailleur" },
    { key: "tireur", label: "Tireur" },
  ],
  emballage: [
    { key: "machine", label: "Machine" },
    { key: "operateur", label: "Operateur" },
    { key: "chefZone", label: "Chef de zone" },
    { key: "scotcheuse", label: "Scotcheuse" },
  ],
};

// Une couleur par etape de production, la meme dans l'avancement et dans la liste des saisies
const COULEUR_ETAPE: Record<keyof typeof STAGE_FIELDS, Couleur> = {
  fabrication: "blue",
  conditionnement: "cyan",
  emballage: "teal",
};

function StageEntries({
  title,
  stage,
  entries,
  dateFormatter,
}: {
  title: string;
  stage: keyof typeof STAGE_FIELDS;
  entries: CodeFluxStageEntry[];
  dateFormatter: (value: string | null) => string;
}) {
  const total = entries.reduce((sum, e) => sum + e.quantite, 0);
  const fields = STAGE_FIELDS[stage];
  const s = STYLES[COULEUR_ETAPE[stage]];
  return (
    <div className={`overflow-hidden rounded-2xl border bg-white ${s.bordure}`}>
      <div className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 ${s.bande}`}>
        <p className="text-xl font-black">{title}</p>
        <p className="text-3xl font-black tabular-nums">{total.toLocaleString("fr-FR")}</p>
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-4 text-base font-semibold text-slate-400">Rien de saisi.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {entries.map((e, i) => (
            <li key={i} className="px-4 py-4 print:break-inside-avoid">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-2xl font-black tabular-nums text-slate-900">{e.quantite.toLocaleString("fr-FR")}</span>
                <span className={`text-base font-bold ${e.dateJour ? "text-slate-600" : "text-slate-400"}`}>
                  {e.dateJour ? dateFormatter(e.dateJour) : NON_RENSEIGNE}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 print:grid-cols-1">
                {fields.map(({ key, label }) => (
                  <div key={key}>
                    <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</dt>
                    <dd className={`text-base font-bold ${e[key] ? "text-slate-800" : "text-slate-300"}`}>
                      {fieldValue(e[key])}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Carte d'affichage du flux complet d'un code de dispatch (PL, PD, TO
// d'origine de la matiere, entree stock du produit fini, sortie/proforma si
// deja livre) - partagee entre le Rapport "Flux par Code", la page PL
// (Historique programme) et la page PD (Historique Programme Dispatcher),
// pour ne jamais desynchroniser 3 affichages du meme calcul.
function classeStatut(statut: CodeFluxStatut | "Pas commence" | "En cours" | "Termine") {
  if (statut === "Termine") return "bg-emerald-100 text-emerald-800";
  if (statut === "Termine manuel") return "bg-violet-100 text-violet-800";
  if (statut === "En cours") return "bg-amber-100 text-amber-800";
  return "bg-slate-200 text-slate-600";
}

function formaterNombre(valeur: number) {
  return (Math.round(valeur * 100) / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

// Une etape de l'avancement : fait / prevu, ce qu'il reste, et son etat - visible meme si "Fin programme" n'a pas ete clique.
function EtapeAvancement({
  titre,
  etape,
  unite,
  resteLibelle,
  couleur,
}: {
  titre: string;
  etape: CodeFluxEtape;
  unite: string;
  resteLibelle: string;
  couleur: Couleur;
}) {
  const s = STYLES[couleur];
  const pourcentage =
    etape.prevu !== null && etape.prevu > 0 ? Math.min(100, Math.round((etape.fait / etape.prevu) * 100)) : null;
  const reste =
    etape.reste === null
      ? { texte: "Pas de quantite prevue", classe: "text-slate-500" }
      : etape.reste > 0
        ? { texte: `${resteLibelle} : ${formaterNombre(etape.reste)} ${unite}`, classe: "text-amber-700" }
        : etape.reste < 0
          ? { texte: `Surplus : ${formaterNombre(-etape.reste)} ${unite}`, classe: "text-violet-700" }
          : { texte: "Complet", classe: "text-emerald-700" };
  return (
    <div className={`rounded-2xl border p-3 sm:p-4 print:break-inside-avoid ${s.bordure} ${s.fond}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className={`min-w-0 text-base font-black uppercase [overflow-wrap:anywhere] sm:text-lg sm:tracking-wide ${s.titre}`}>{titre}</p>
        <span className={`shrink-0 rounded-full px-3 py-1 text-base font-black ${classeStatut(etape.statut)}`}>{etape.statut}</span>
      </div>
      <p className="mt-3 text-5xl font-black tabular-nums text-slate-900">
        {formaterNombre(etape.fait)}
        <span className="text-xl font-bold text-slate-500"> {unite}</span>
      </p>
      <p className="mt-1 text-lg font-bold text-slate-500">
        prevu : {etape.prevu !== null ? formaterNombre(etape.prevu) : "-"}
      </p>
      {pourcentage !== null ? (
        <div className="mt-3 flex items-center gap-3">
          <div className="h-4 flex-1 overflow-hidden rounded-full bg-white ring-1 ring-slate-200">
            <div className={`h-full rounded-full ${s.barre}`} style={{ width: `${pourcentage}%` }} />
          </div>
          <span className={`w-14 text-right text-lg font-black tabular-nums ${s.texte}`}>{pourcentage} %</span>
        </div>
      ) : null}
      <p className={`mt-3 text-lg font-bold ${reste.classe}`}>{reste.texte}</p>
    </div>
  );
}

// Une livraison : "Livre" + numero de sortie cliquable + quantite, puis date / client / proforma / BL en pastilles
function CarteLivraison({ sortie }: { sortie: CodeFlux["sorties"][number] }) {
  const morceaux = morceauxLivraison(sortie);
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 print:break-inside-avoid">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-black text-slate-900">Livre</span>
          <LienPastille href={sortie.href} couleur="sky">
            {sortie.label}
          </LienPastille>
        </div>
        <p className="text-3xl font-black tabular-nums text-emerald-700">{sortie.quantite.toLocaleString("fr-FR")}</p>
      </div>
      {morceaux.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {morceaux.map((morceau) => (
            <Pastille key={morceau} couleur="slate">
              {morceau}
            </Pastille>
          ))}
        </div>
      ) : null}
    </li>
  );
}

function Repere({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 print:break-inside-avoid">
      <p className="text-sm font-black uppercase tracking-wide text-indigo-700">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function CodeFluxCard({ flux }: { flux: CodeFlux }) {
  const mpMatieres = flux.mpSources.filter((mp) => !mp.estConditionnement);
  const mpConditionnement = flux.mpSources.filter((mp) => mp.estConditionnement);
  return (
    <article className="overflow-hidden rounded-[1.75rem] border border-sky-100 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.10)] [-webkit-print-color-adjust:exact] [print-color-adjust:exact] print:shadow-none print:[zoom:0.75]">
      <div className="bg-[linear-gradient(135deg,#0f172a_0%,#1e3a8a_55%,#0369a1_100%)] px-6 py-6 text-white">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-sky-200">Code de dispatch</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="text-4xl font-black tracking-tight sm:text-5xl">{flux.code}</h2>
          <span className={`rounded-full px-4 py-1.5 text-lg font-black ${classeStatut(flux.avancement.statut)}`}>
            {flux.avancement.statut}
          </span>
        </div>
        {flux.produit || flux.datePeremption ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {flux.produit ? <p className="text-2xl font-bold text-sky-50">{flux.produit}</p> : null}
            {flux.datePeremption ? (
              <span className="rounded-full bg-amber-300 px-4 py-1.5 text-base font-black text-amber-950">
                expire le {formatDate(flux.datePeremption)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="space-y-6 bg-slate-50/70 p-3 sm:p-6 print:space-y-4">
        <Section titre="Avancement" couleur="sky" insecable>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 print:grid-cols-3">
            <EtapeAvancement
              titre="Fabrication (vrac)"
              etape={flux.avancement.vrac}
              unite="kg"
              resteLibelle="Reste a fabriquer"
              couleur="blue"
            />
            <EtapeAvancement
              titre="Conditionnement (cartons)"
              etape={flux.avancement.conditionnement}
              unite="cartons"
              resteLibelle="Reste a conditionner"
              couleur="cyan"
            />
            <EtapeAvancement
              titre="Emballage (cartons)"
              etape={flux.avancement.emballage}
              unite="cartons"
              resteLibelle="Reste a emballer"
              couleur="teal"
            />
          </div>
        </Section>

        <Section titre="Programme et dispatch" couleur="indigo" insecable>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 print:grid-cols-3">
            <Repere label="MB">
              {flux.mb ? (
                <p className="text-2xl font-black text-slate-900 [overflow-wrap:anywhere] sm:text-3xl">{flux.mb}</p>
              ) : (
                <Vide />
              )}
            </Repere>
            <Repere label="Programme (PL)">
              {flux.pl ? (
                <LienPastille href={flux.pl.href} couleur="indigo">
                  {flux.pl.label}
                </LienPastille>
              ) : (
                <Vide />
              )}
            </Repere>
            <Repere label="Dispatch (PD)">
              {flux.pds.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {flux.pds.map((pd) => (
                    <LienPastille key={pd.href} href={pd.href} couleur="indigo">
                      {pd.label}
                    </LienPastille>
                  ))}
                </div>
              ) : (
                <Vide />
              )}
            </Repere>
          </div>
        </Section>

        <Section titre="Matiere premiere consommee" detail="TO/TI d'origine" couleur="amber">
          {mpMatieres.length === 0 ? (
            <Vide>Aucune reservation MP tracee pour ce code.</Vide>
          ) : (
            <div className="space-y-3">
              {mpMatieres.map((mp, i) => (
                <MpSourceItem key={`${mp.articleNom}-${mp.numeroLot}-${i}`} mp={mp} couleur="amber" />
              ))}
            </div>
          )}
        </Section>

        <Section titre="Articles de conditionnement consommes" detail="TO/TI d'origine" couleur="orange">
          {mpConditionnement.length === 0 ? (
            <Vide>Aucune reservation d&apos;article de conditionnement tracee pour ce code.</Vide>
          ) : (
            <div className="space-y-3">
              {mpConditionnement.map((mp, i) => (
                <MpSourceItem key={`${mp.articleNom}-${mp.numeroLot}-${i}`} mp={mp} couleur="orange" />
              ))}
            </div>
          )}
        </Section>

        <Section titre="Production" detail="ce qui a ete fabrique, conditionne et emballe" couleur="slate">
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3 print:grid-cols-3">
            <StageEntries
              title="Fabrication"
              stage="fabrication"
              entries={flux.production.fabrication}
              dateFormatter={formatDate}
            />
            <StageEntries
              title="Conditionnement"
              stage="conditionnement"
              entries={flux.production.conditionnement}
              dateFormatter={formatDate}
            />
            <StageEntries
              title="Emballage"
              stage="emballage"
              entries={flux.production.emballage}
              dateFormatter={formatDate}
            />
          </div>
        </Section>

        <TestLaboSection testLabo={flux.testLabo} />

        {/* peu de livraisons : la rubrique tient dans une page du PDF, elle ne se coupe pas (sinon le titre "Livraisons"
            restait seul en bas d'une page) ; une longue liste, elle, peut passer sur la page suivante */}
        <Section
          titre="Produit fini"
          detail="entree en stock et livraisons"
          couleur="emerald"
          insecable={flux.sorties.length <= 6}
        >
          {flux.entreeProduction.entree ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                  href={flux.entreeProduction.href}
                  className="rounded-full bg-emerald-600 px-5 py-2 text-lg font-black text-white transition hover:bg-emerald-700"
                >
                  entre en stock ({flux.entreeProduction.label})
                </Link>
                <p className="text-4xl font-black tabular-nums text-emerald-800">
                  {flux.entreeProduction.quantite.toLocaleString("fr-FR")}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {flux.entreeProduction.chambre ? (
                  <Pastille couleur="emerald">chambre {flux.entreeProduction.chambre}</Pastille>
                ) : null}
                {flux.entreeProduction.dateFabrication ? (
                  <Pastille couleur="emerald">fabrique le {formatDate(flux.entreeProduction.dateFabrication)}</Pastille>
                ) : null}
                {flux.entreeProduction.stockRestant > 0 ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-600 px-4 py-1 text-base font-black text-white">
                    {flux.entreeProduction.stockRestant.toLocaleString("fr-FR")} restant en stock
                  </span>
                ) : (
                  <Pastille couleur="slate">tout livre, rien en stock</Pastille>
                )}
              </div>
            </div>
          ) : (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-lg font-bold text-amber-800">
              pas encore entre en stock
            </p>
          )}

          {flux.sorties.length > 0 ? (
            <div className="mt-5">
              {/* le titre est lie a la PREMIERE carte dans un bloc insecable : il ne reste jamais seul en bas d'une page du PDF */}
              <div className="print:break-inside-avoid">
                <p className="text-base font-black uppercase tracking-wide text-emerald-800">Livraisons</p>
                <ul className="mt-2">
                  <CarteLivraison sortie={flux.sorties[0]} />
                </ul>
              </div>
              {flux.sorties.length > 1 ? (
                <ul className="mt-3 space-y-3">
                  {flux.sorties.slice(1).map((s, i) => (
                    <CarteLivraison key={`${s.label}-${i + 1}`} sortie={s} />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </Section>
      </div>
    </article>
  );
}
