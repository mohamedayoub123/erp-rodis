import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ExportExcelButton } from "@/app/_components/export-excel-button";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { Pr4ManuelForm } from "./manuel-form";
import { MANUEL_FIELDS } from "./fields";
import { chargerMoisPr4, fmt, fmtPct } from "./calculs";

const EXPORT_COLUMNS = [
  { label: "Mois", key: "moisLabel" },
  { label: "1 - Nb carton fabrique", key: "cartonFabrique" },
  { label: "2 - Carton commande", key: "cartonCommande" },
  { label: "2 - % programme fait dans les temps (cible 98%)", key: "pctProgrammeLabel" },
  { label: "3 - % capacite machines conditionnement", key: "capaciteLabel" },
  { label: "5/6 - Preparations Test Labo", key: "preparations" },
  { label: "5 - % non conforme detruit (cible < 0,5%)", key: "pctADetruireLabel" },
  { label: "6 - % sous derogation (cible < 10%)", key: "pctSousDerogationLabel" },
  { label: "7 - Vrac commande (kg)", key: "vracFabriqueKgLabel" },
  { label: "7 - Carton fabrique (kg)", key: "cartonFabriqueKgLabel" },
  { label: "7 - % ecart balance matiere (cible -0,5% a +0,5%)", key: "pctEcartLabel" },
  { label: "8 - Temps arret (min)", key: "arretMinutes" },
  { label: "8 - Temps travail (min)", key: "travailMinutes" },
  { label: "8 - % taux arret (cible < 5%)", key: "pctArretLabel" },
  { label: "10 - Pieces fabriquees", key: "piecesLabel" },
  { label: "10 - Dechets (pieces)", key: "dechetLabel" },
  { label: "10 - % dechets (cible < 1%)", key: "pctDechetsLabel" },
  { label: "13 - Prix de revient 1 carton (FCFA)", key: "prixCartonLabel" },
  { label: "4 - % heures supplementaires (cible 2%)", key: "heuresSupplementairesLabel" },
  { label: "9 - Nb formation a faire", key: "formationAFaire" },
  { label: "9 - Nb formation realisee", key: "formationRealisee" },
  { label: "9 - % formation realisee (cible 90%)", key: "pctFormationLabel" },
  { label: "11 - Qt retournee non conforme", key: "qtRetourneeNc" },
  { label: "11 - % reclamation NC (cible < 0,2%)", key: "pctReclamationNcLabel" },
  { label: "12 - Qt commande", key: "qtCommandeLivraison" },
  { label: "12 - Qt livree a temps", key: "qtLivreeATemps" },
  { label: "12 - % delai livraison (cible 90%)", key: "pctLivraisonLabel" },
];

export default async function Pr4Page() {
  noStore();

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "qualiteRevueProcessus");

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - 4 + i);

  const { monthRows, manuel, currentMoisKey } = await chargerMoisPr4();

  // ExportExcelButton attend des valeurs scalaires - isManuel (objet) n'a
  // pas sa place dans l'export, seules les colonnes listees dans
  // EXPORT_COLUMNS comptent de toute facon.
  const exportRows = monthRows.map(({ isManuel: _isManuel, ...row }) => row);

  // Valeurs ACTUELLEMENT affichees (auto ou deja manuel) par mois, pour
  // pre-remplir le formulaire "Saisir un mois ancien" au lieu de le montrer
  // vide - demande explicite : voir ce qui a deja ete calcule pour pouvoir
  // le garder tel quel ou le corriger, plutot que de saisir a l'aveugle.
  const computedByMonth: Record<string, Partial<Record<(typeof MANUEL_FIELDS)[number]["key"], number>>> = {};
  for (const row of monthRows) {
    computedByMonth[row.mois] = {
      carton_commande: row.cartonCommande,
      carton_fabrique: row.cartonFabrique,
      capacite_pct: row.capacite ?? undefined,
      test_labo_preparations: row.preparations,
      test_labo_a_detruire: row.aDetruireCount,
      test_labo_sous_derogation: row.sousDerogationCount,
      vrac_fabrique_kg: row.vracFabriqueKg,
      carton_fabrique_kg: row.cartonFabriqueKgBalance,
      arret_minutes: row.arretMinutes,
      travail_minutes: row.travailMinutes,
      pieces_fabriquees: row.pieces,
      dechet_pieces: row.dechet,
      prix_carton: row.prixCarton ?? undefined,
      heures_supplementaires_pct: row.heuresSupplementairesPct ?? undefined,
      formation_a_faire: row.formationAFaire,
      formation_realisee: row.formationRealisee,
      qt_retournee_nc: row.qtRetourneeNc,
      qt_commande_livraison: row.qtCommandeLivraison,
      qt_livree_a_temps: row.qtLivreeATemps,
    };
  }

  // Meme mise en forme que le fichier Excel : indicateurs en ligne (avec
  // #/cible/methode empiles en sous-lignes numerateur-denominateur-%), mois
  // en colonne du plus recent au plus ancien (aout 2026 en premier) - meme
  // sens que monthRows lui-meme et que la Vue trimestrielle plus bas.
  type MonthRow = (typeof monthRows)[number];

  type ManuelKey = keyof MonthRow["isManuel"];

  const INDICATEUR_ROWS: {
    numero: string;
    label: string;
    cible: string;
    rowBg: string;
    rowBgSolid: string;
    manuelKey?: ManuelKey;
    // Valeur numerique "phare" de l'indicateur (derniere sous-ligne) et si
    // elle se formate en % - utilise par la Vue trimestrielle plus bas pour
    // moyenner sur 3 mois sans dependre des chaines deja formatees.
    headlineValue: (r: MonthRow) => number | null;
    isPercent: boolean;
    subRows: { label: string; getValue: (r: MonthRow) => string }[];
  }[] = [
    {
      numero: "1",
      label: "Evolution production par rapport a N-1",
      cible: "-",
      rowBg: "bg-blue-50/60",
      rowBgSolid: "bg-blue-50",
      manuelKey: "carton",
      headlineValue: (r) => r.cartonFabrique,
      isPercent: false,
      subRows: [{ label: "Totale carton fabrique", getValue: (r) => fmt(r.cartonFabrique) }],
    },
    {
      numero: "2",
      label: "Ordre de production acheves dans les temps",
      cible: "98%",
      rowBg: "bg-orange-50/60",
      rowBgSolid: "bg-orange-50",
      headlineValue: (r) => r.pctProgramme,
      isPercent: true,
      subRows: [
        { label: "Totale programme donne par carton", getValue: (r) => fmt(r.cartonCommande) },
        { label: "% fabrique par rapport a programme", getValue: (r) => r.pctProgrammeLabel },
      ],
    },
    {
      numero: "3",
      label: "Taux d'utilisation moyen capacite de production",
      cible: "-",
      rowBg: "bg-teal-50/60",
      rowBgSolid: "bg-teal-50",
      manuelKey: "capacite",
      headlineValue: (r) => r.capacite,
      isPercent: true,
      subRows: [{ label: "% capacite machines conditionnement", getValue: (r) => r.capaciteLabel }],
    },
    {
      numero: "4",
      label: "Taux d'heures supplementaires par personne",
      cible: "2%",
      rowBg: "bg-amber-50/60",
      rowBgSolid: "bg-amber-50",
      manuelKey: "heuresSup",
      headlineValue: (r) => r.heuresSupplementairesPct,
      isPercent: true,
      subRows: [{ label: "% heure supplementaire", getValue: (r) => r.heuresSupplementairesLabel }],
    },
    {
      numero: "5",
      label: "Taux de fabrication non-conforme",
      cible: "< 0,5%",
      rowBg: "bg-pink-50/60",
      rowBgSolid: "bg-pink-50",
      manuelKey: "testLabo",
      headlineValue: (r) => r.pctADetruire,
      isPercent: true,
      subRows: [
        { label: "Totale preparation", getValue: (r) => fmt(r.preparations) },
        { label: "Totale preparation non conforme (a detruire)", getValue: (r) => fmt(r.aDetruireCount) },
        { label: "% de non conforme", getValue: (r) => r.pctADetruireLabel },
      ],
    },
    {
      numero: "6",
      label: "Taux de derogation",
      cible: "< 10%",
      rowBg: "bg-lime-50/60",
      rowBgSolid: "bg-lime-50",
      manuelKey: "testLabo",
      headlineValue: (r) => r.pctSousDerogation,
      isPercent: true,
      subRows: [
        { label: "Totale preparation", getValue: (r) => fmt(r.preparations) },
        { label: "Totale preparation en derogation", getValue: (r) => fmt(r.sousDerogationCount) },
        { label: "% de derogation", getValue: (r) => r.pctSousDerogationLabel },
      ],
    },
    {
      numero: "7",
      label: "Balance matiere",
      cible: "-0,5% < X < +0,5%",
      rowBg: "bg-purple-50/60",
      rowBgSolid: "bg-purple-50",
      manuelKey: "balance",
      headlineValue: (r) => r.pctEcart,
      isPercent: true,
      subRows: [
        { label: "Totale vrac commande (kg)", getValue: (r) => r.vracFabriqueKgLabel },
        { label: "Carton fabrique converti (kg)", getValue: (r) => r.cartonFabriqueKgLabel },
        { label: "% d'ecart (tire - commande)", getValue: (r) => r.pctEcartLabel },
      ],
    },
    {
      numero: "8",
      label: "Taux d'arret globale",
      cible: "< 5%",
      rowBg: "bg-blue-50/60",
      rowBgSolid: "bg-blue-50",
      manuelKey: "arret",
      headlineValue: (r) => r.pctArret,
      isPercent: true,
      subRows: [
        { label: "Temps d'arret (min)", getValue: (r) => fmt(r.arretMinutes) },
        { label: "Temps de travail (min)", getValue: (r) => fmt(r.travailMinutes) },
        { label: "% de perte en temps", getValue: (r) => r.pctArretLabel },
      ],
    },
    {
      numero: "9",
      label: "Taux suivi formation",
      cible: "90%",
      rowBg: "bg-orange-50/60",
      rowBgSolid: "bg-orange-50",
      headlineValue: (r) => r.pctFormation,
      isPercent: true,
      subRows: [
        { label: "Nb formation a faire", getValue: (r) => fmt(r.formationAFaire) },
        { label: "Nb formation realisee", getValue: (r) => fmt(r.formationRealisee) },
        { label: "% formation realisee", getValue: (r) => r.pctFormationLabel },
      ],
    },
    {
      numero: "10",
      label: "Taux dechets globale",
      cible: "< 1%",
      rowBg: "bg-teal-50/60",
      rowBgSolid: "bg-teal-50",
      manuelKey: "dechets",
      headlineValue: (r) => r.pctDechets,
      isPercent: true,
      subRows: [
        { label: "Totale production (pieces)", getValue: (r) => r.piecesLabel },
        { label: "Totale dechet (pieces)", getValue: (r) => r.dechetLabel },
        { label: "% de dechet", getValue: (r) => r.pctDechetsLabel },
      ],
    },
    {
      numero: "11",
      label: "Taux de reclamation produit non conforme / prod",
      cible: "< 0,2%",
      rowBg: "bg-amber-50/60",
      rowBgSolid: "bg-amber-50",
      headlineValue: (r) => r.pctReclamationNc,
      isPercent: true,
      subRows: [
        { label: "Qt retournee", getValue: (r) => fmt(r.qtRetourneeNc) },
        { label: "Qt fabriquee (pieces)", getValue: (r) => r.piecesLabel },
        { label: "% de retour NC", getValue: (r) => r.pctReclamationNcLabel },
      ],
    },
    {
      numero: "12",
      label: "Respect du delai de livraison",
      cible: "90%",
      rowBg: "bg-pink-50/60",
      rowBgSolid: "bg-pink-50",
      manuelKey: "delai",
      headlineValue: (r) => r.pctLivraison,
      isPercent: true,
      subRows: [
        { label: "Qt commande", getValue: (r) => fmt(r.qtCommandeLivraison) },
        { label: "Depasse 10 jours", getValue: (r) => fmt(r.qtDepasseLivraison) },
        { label: "% delai respecte", getValue: (r) => r.pctLivraisonLabel },
      ],
    },
    {
      numero: "13",
      label: "Prix de revient 1 carton (journalier cosmetique + energie cosmetique)",
      cible: "-",
      rowBg: "bg-lime-50/60",
      rowBgSolid: "bg-lime-50",
      manuelKey: "prixCarton",
      headlineValue: (r) => r.prixCarton,
      isPercent: false,
      subRows: [{ label: "Cout carton (FCFA)", getValue: (r) => r.prixCartonLabel }],
    },
  ];

  // ---------------------------------------------------------------------
  // Vue trimestrielle (sheet Excel "INDICATEUR 2025") : reprend les memes
  // valeurs phares deja calculees ci-dessus par mois et les regroupe par
  // trimestre (T1 janv-mars, T2 avr-juin, T3 juil-sept, T4 oct-dec) -
  // moyenne des mois disponibles dans le trimestre (les mois sans donnee
  // sont ignores, pas comptes comme 0). L'indicateur 1 (evolution vs N-1)
  // fait exception : demande explicite de comparer le total du trimestre
  // de cette annee au total du MEME trimestre de l'annee precedente (%
  // d'evolution), plutot qu'une simple moyenne sur 3 mois.
  // ---------------------------------------------------------------------
  const monthRowByMois = new Map(monthRows.map((row) => [row.mois, row]));

  type Quarter = { key: string; label: string; annee: number; moisKeys: string[] };

  const quarters: Quarter[] = (() => {
    const annees = [...new Set(monthRows.map((row) => Number(row.mois.slice(0, 4))))].sort((a, b) => a - b);
    const list: Quarter[] = [];
    for (const annee of annees) {
      for (let q = 1; q <= 4; q++) {
        const moisKeys = [1, 2, 3].map((offset) => {
          const m = (q - 1) * 3 + offset;
          return `${annee}-${String(m).padStart(2, "0")}`;
        });
        if (!moisKeys.some((m) => monthRowByMois.has(m))) continue;
        list.push({ key: `${annee}-T${q}`, label: `T${q} ${annee}`, annee, moisKeys });
      }
    }
    return list;
  })();
  const quartersDescending = [...quarters].reverse();

  // Un trimestre ne compte que si son 3eme mois est deja termine (strictement
  // avant le mois en cours) - "123 456 789 101112", pas de chiffre tant que
  // le mois 9 (ou 3/6/12) n'est pas fini normalement, meme si le mois en
  // cours a deja des donnees partielles.
  function isQuarterComplete(quarter: Quarter) {
    return quarter.moisKeys[2] < currentMoisKey;
  }

  function averageOverQuarter(quarter: Quarter, getValue: (r: MonthRow) => number | null) {
    const values = quarter.moisKeys
      .map((m) => monthRowByMois.get(m))
      .filter((r): r is MonthRow => Boolean(r))
      .map((r) => getValue(r))
      .filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  function evolutionN1OverQuarter(quarter: Quarter) {
    const totalCourant = quarter.moisKeys.reduce((sum, m) => sum + (monthRowByMois.get(m)?.cartonFabrique ?? 0), 0);
    const moisAnneePrecedente = quarter.moisKeys.map((m) => `${quarter.annee - 1}-${m.slice(5)}`);
    const aDonneeAnneePrecedente = moisAnneePrecedente.some((m) => monthRowByMois.has(m));
    if (!aDonneeAnneePrecedente) return null;
    const totalPrecedent = moisAnneePrecedente.reduce((sum, m) => sum + (monthRowByMois.get(m)?.cartonFabrique ?? 0), 0);
    if (totalPrecedent <= 0) return null;
    return ((totalCourant - totalPrecedent) / totalPrecedent) * 100;
  }

  function quarterValueLabel(indicateur: (typeof INDICATEUR_ROWS)[number], quarter: Quarter) {
    if (!isQuarterComplete(quarter)) return "-";
    const value =
      indicateur.numero === "1" ? evolutionN1OverQuarter(quarter) : averageOverQuarter(quarter, indicateur.headlineValue);
    if (indicateur.numero === "1") return fmtPct(value);
    return indicateur.isPercent ? fmtPct(value) : fmt(value, indicateur.numero === "13" ? 1 : 0);
  }

  function ManuelBadge() {
    return (
      <span className="ml-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700">
        manuel
      </span>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f0ff_0%,#faf8ff_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">PR4 - Indicateurs Cosmetique</h1>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/qualite/revue-processus/pr4" label="Retour PR4" />
              <ExportExcelButton
                rows={exportRows}
                columns={EXPORT_COLUMNS}
                filename={`pr4-indicateurs-${new Date().toISOString().slice(0, 10)}.xlsx`}
              />
              <RefreshButton />
            </div>
          </div>
        </section>


        {canEdit ? (
          <Pr4ManuelForm
            rows={manuel.rows}
            yearOptions={yearOptions}
            currentYear={currentYear}
            computedByMonth={computedByMonth}
          />
        ) : null}

        {monthRows.length === 0 ? (
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            Aucune donnee pour le moment.
          </div>
        ) : (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-bold text-slate-900">Tableau des indicateurs</h2>
            </div>
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="sticky top-0 z-20 bg-slate-100 text-slate-950">
                  <tr>
                    <th className="sticky left-0 z-30 w-[56px] min-w-[56px] max-w-[56px] border border-slate-200 bg-slate-100 px-3 py-2 font-semibold">
                      #
                    </th>
                    <th className="sticky left-[56px] z-30 w-[200px] min-w-[200px] max-w-[200px] border border-slate-200 bg-slate-100 px-3 py-2 font-semibold">
                      Indicateur
                    </th>
                    <th className="sticky left-[256px] z-30 w-[110px] min-w-[110px] max-w-[110px] border border-slate-200 bg-slate-100 px-3 py-2 font-semibold">
                      Cible
                    </th>
                    <th className="sticky left-[366px] z-30 w-[90px] min-w-[90px] max-w-[90px] border border-slate-200 bg-slate-100 px-3 py-2 font-semibold">
                      Action ({monthRows[0] ? monthRows[0].moisLabel : "-"})
                    </th>
                    <th className="sticky left-[456px] z-30 w-[220px] min-w-[220px] max-w-[220px] border border-slate-200 bg-slate-100 px-3 py-2 font-semibold">
                      Methode de calcul
                    </th>
                    {monthRows.map((row) => (
                      <th key={row.mois} className="border border-slate-200 px-3 py-2 text-center font-semibold">
                        {row.moisLabel}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {INDICATEUR_ROWS.map((indicateur) => {
                    const lastSubRow = indicateur.subRows[indicateur.subRows.length - 1];
                    const action = monthRows[0] ? lastSubRow.getValue(monthRows[0]) : "-";
                    // Colonnes fixes (sticky) : fond OPAQUE obligatoire (rowBgSolid),
                    // sinon le contenu des colonnes mois qui defilent en dessous
                    // transparait a travers (rowBg reste volontairement translucide
                    // "/60" pour les cellules non-sticky plus loin).
                    const rowBgSolid = indicateur.rowBgSolid;
                    return indicateur.subRows.map((subRow, subIndex) => (
                      <tr key={`${indicateur.numero}-${subIndex}`} className="border-t border-slate-100">
                        {subIndex === 0 ? (
                          <>
                            <td
                              rowSpan={indicateur.subRows.length}
                              className={`sticky left-0 z-10 w-[56px] min-w-[56px] max-w-[56px] border border-slate-200 ${rowBgSolid} px-3 py-2 align-top font-semibold text-slate-500`}
                            >
                              {indicateur.numero}
                            </td>
                            <td
                              rowSpan={indicateur.subRows.length}
                              className={`sticky left-[56px] z-10 w-[200px] min-w-[200px] max-w-[200px] border border-slate-200 ${rowBgSolid} px-3 py-2 align-top text-slate-900`}
                            >
                              {indicateur.label}
                            </td>
                            <td
                              rowSpan={indicateur.subRows.length}
                              className={`sticky left-[256px] z-10 w-[110px] min-w-[110px] max-w-[110px] border border-slate-200 ${rowBgSolid} px-3 py-2 align-top text-slate-600`}
                            >
                              {indicateur.cible}
                            </td>
                            <td
                              rowSpan={indicateur.subRows.length}
                              className={`sticky left-[366px] z-10 w-[90px] min-w-[90px] max-w-[90px] border border-slate-200 ${rowBgSolid} px-3 py-2 align-top font-semibold text-slate-900`}
                            >
                              {action}
                            </td>
                          </>
                        ) : null}
                        <td
                          className={`sticky left-[456px] z-10 w-[220px] min-w-[220px] max-w-[220px] border border-slate-200 ${rowBgSolid} px-3 py-2 text-xs text-slate-500`}
                        >
                          {subRow.label}
                          {subIndex === 0 && indicateur.manuelKey ? (
                            <span className="ml-1 text-[9px] text-violet-500">(m)</span>
                          ) : null}
                        </td>
                        {monthRows.map((row) => (
                          <td
                            key={row.mois}
                            className={`border border-slate-200 ${indicateur.rowBg} px-3 py-2 text-right text-slate-700`}
                          >
                            {subRow.getValue(row)}
                            {subIndex === 0 && indicateur.manuelKey && row.isManuel[indicateur.manuelKey] ? (
                              <ManuelBadge />
                            ) : null}
                          </td>
                        ))}
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {quarters.length === 0 ? null : (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-bold text-slate-900">Vue trimestrielle</h2>
            </div>
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="sticky top-0 z-20 bg-slate-100 text-slate-950">
                  <tr>
                    <th className="sticky left-0 z-30 w-[56px] min-w-[56px] max-w-[56px] border border-slate-200 bg-slate-100 px-3 py-2 font-semibold">
                      #
                    </th>
                    <th className="sticky left-[56px] z-30 w-[280px] min-w-[280px] max-w-[280px] border border-slate-200 bg-slate-100 px-3 py-2 font-semibold">
                      Indicateur
                    </th>
                    <th className="sticky left-[336px] z-30 w-[130px] min-w-[130px] max-w-[130px] border border-slate-200 bg-slate-100 px-3 py-2 font-semibold">
                      Cible
                    </th>
                    {quartersDescending.map((quarter) => (
                      <th key={quarter.key} className="border border-slate-200 px-3 py-2 text-center font-semibold">
                        {quarter.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {INDICATEUR_ROWS.map((indicateur) => (
                    <tr key={indicateur.numero} className="border-t border-slate-100">
                      <td
                        className={`sticky left-0 z-10 w-[56px] min-w-[56px] max-w-[56px] border border-slate-200 ${indicateur.rowBgSolid} px-3 py-2 font-semibold text-slate-500`}
                      >
                        {indicateur.numero}
                      </td>
                      <td
                        className={`sticky left-[56px] z-10 w-[280px] min-w-[280px] max-w-[280px] border border-slate-200 ${indicateur.rowBgSolid} px-3 py-2 text-slate-900`}
                      >
                        {indicateur.label}
                      </td>
                      <td
                        className={`sticky left-[336px] z-10 w-[130px] min-w-[130px] max-w-[130px] border border-slate-200 ${indicateur.rowBgSolid} px-3 py-2 text-slate-600`}
                      >
                        {indicateur.cible}
                      </td>
                      {quartersDescending.map((quarter) => (
                        <td
                          key={quarter.key}
                          className={`border border-slate-200 ${indicateur.rowBg} px-3 py-2 text-right font-semibold text-slate-700`}
                        >
                          {quarterValueLabel(indicateur, quarter)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
