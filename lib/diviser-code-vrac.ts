import { supabaseServer } from "@/lib/supabase-server";
import { construireDivision, type EntreeDetailLot, type PlanDivision } from "@/lib/diviser-code-vrac-shared";

// Dashboard > Fabrication : DIVISER un code (lot) d'une ligne de programme en 2 - le code d'origine garde une partie du vrac, un NOUVEAU code
// (choisi par la personne) prend le reste. Ex : AA1 = 3000 kg -> AA1 = 1500 kg + AA9 = 1500 kg (la fabrication se fait sur une machine de
// plus petite capacite que prevu).
//
// Ce qui change : sur la ligne de programme, numero_lot (le nouveau code est place juste apres l'ancien) et numero_lot_detail (vrac et cartons
// prevus de chacun) ; le vrac prevu TOTAL de la ligne ne change pas. Les cartons de chaque morceau sont recalcules comme au Dispatch (vrac /
// contenance / pieces par carton, arrondi au carton superieur). Le PD (historique du Programme Dispatcher) et le dispatcher en cours suivent : le
// nouveau code recoit une copie de la ligne de l'ancien code, avec sa quantite.
//
// Refuse des que le code est deja commence : du vrac, des cartons ou de l'emballage deja saisis, un Besoin valide (matieres reservees) ou une
// Fin programme, des codes vrac choisis au Conditionnement, ou le code deja choisi comme vrac par un Conditionnement. Refuse aussi un nouveau code
// deja utilise ailleurs (programme, PD, fabrication, Test labo, stock produit fini).

export type DivisionCode =
  | { ok: true; message: string; code: string; nouveauCode: string; plan: PlanDivision; avertissements: string[] }
  | { ok: false; message: string };

type LigneBrute = Record<string, unknown> & {
  id: number;
  article_id: number | null;
  numero_lot: string | null;
  numero_lot_detail: EntreeDetailLot[] | null;
  vrac_a_fabriquer: number | null;
  qt_carton: number | null;
  groupe_id: number | null;
  source_numero_programme: number | null;
  programme_termine: boolean | null;
};

type Erreur = { message: string; code?: string } | null;

const echapperLike = (texte: string) => texte.replace(/[\\%_]/g, "\\$&");

// La table des codes vrac choisis au Conditionnement est creee par un script SQL : absente = rien a controler de ce cote
const tableAbsente = (erreur: Erreur) =>
  Boolean(erreur) && (erreur?.code === "42P01" || erreur?.code === "PGRST205" || /does not exist|schema cache/i.test(erreur?.message ?? ""));

export async function diviserCodeLigne(ligneId: number, code: string, quantiteNouveau: unknown, nouveauCodeSaisi: string): Promise<DivisionCode> {
  const codeActuel = String(code ?? "").trim();
  if (!codeActuel || codeActuel === "-") return { ok: false, message: "Ce code n'a pas de numero de lot : il ne peut pas etre divise." };

  const { data: ligneData, error: ligneErreur } = await supabaseServer.from("programme_lignes").select("*").eq("id", ligneId).maybeSingle();
  if (ligneErreur) return { ok: false, message: ligneErreur.message };
  const ligne = ligneData as LigneBrute | null;
  if (!ligne) return { ok: false, message: "Cette ligne n'existe plus. Recharge la page." };
  if (ligne.programme_termine) return { ok: false, message: "Le programme de cette ligne est termine." };
  if (ligne.groupe_id === null && ligne.source_numero_programme === null) {
    return { ok: false, message: "Cette ligne ne vient pas d'un programme : son code ne se divise pas ici." };
  }

  const codes = (ligne.numero_lot || "").split(",").map((c) => c.trim()).filter(Boolean);

  // Calcul de la division (verifie le code, le nouveau code, la quantite) AVANT de lire quoi que ce soit d'autre
  const { data: articleData, error: articleErreur } = ligne.article_id
    ? await supabaseServer.from("articles").select("contenance, piece_par_carton").eq("id", ligne.article_id).maybeSingle()
    : { data: null, error: null };
  if (articleErreur) return { ok: false, message: articleErreur.message };
  const article = articleData as { contenance: number | null; piece_par_carton: number | null } | null;

  const calcul = construireDivision({
    codes,
    detail: Array.isArray(ligne.numero_lot_detail) ? ligne.numero_lot_detail : null,
    vracLigne: ligne.vrac_a_fabriquer,
    cartonsLigne: ligne.qt_carton,
    code: codeActuel,
    nouveauCode: nouveauCodeSaisi,
    quantiteNouveau,
    contenance: article?.contenance ? Number(article.contenance) : null,
    piecesParCarton: article?.piece_par_carton ? Number(article.piece_par_carton) : null,
  });
  if (!calcul.ok) return calcul;
  const plan = calcul.plan;
  const nouveauCode = plan.nouvelle.code;

  // ----- Le code est-il deja commence ? -----
  const [vrac, cartons, emballages, termines, choix, choisiCommeVrac] = await Promise.all([
    supabaseServer.from("production_vrac_entries").select("code").eq("programme_ligne_id", ligneId),
    supabaseServer.from("production_carton_entries").select("code").eq("programme_ligne_id", ligneId),
    supabaseServer.from("production_emballage_entries").select("code").eq("programme_ligne_id", ligneId),
    supabaseServer.from("production_code_termine").select("code, stage").eq("programme_ligne_id", ligneId),
    supabaseServer.from("conditionnement_codes_vrac").select("code").eq("programme_ligne_id", ligneId),
    supabaseServer.from("conditionnement_codes_vrac").select("code_vrac").eq("code_vrac", codeActuel).limit(1),
  ]);
  for (const resultat of [vrac, cartons, emballages, termines]) if (resultat.error) return { ok: false, message: resultat.error.message };
  for (const resultat of [choix, choisiCommeVrac]) if (resultat.error && !tableAbsente(resultat.error)) return { ok: false, message: resultat.error.message };

  const codesDe = (resultat: { data: unknown }) => ((resultat.data ?? []) as { code: string | null }[]).map((entree) => (entree.code ?? "").trim());
  for (const resultat of [vrac, cartons, emballages]) {
    if (codesDe(resultat).includes("")) {
      return { ok: false, message: "Cette ligne a une saisie ancienne sans numero de lot : son code ne peut plus etre divise." };
    }
  }
  if (codesDe(vrac).includes(codeActuel)) {
    return { ok: false, message: "La Fabrication de ce code est deja commencee (du vrac a deja ete saisi) : il ne peut plus etre divise." };
  }
  if (codesDe(cartons).includes(codeActuel) || codesDe(emballages).includes(codeActuel)) {
    return { ok: false, message: "Le Conditionnement de ce code est deja commence : il ne peut plus etre divise." };
  }
  if (codesDe(termines).includes(codeActuel)) {
    return {
      ok: false,
      message: "Ce code a deja un Besoin valide (salle de pesage ou de conditionnement) ou une Fin programme : il ne peut plus etre divise.",
    };
  }
  if (!choix.error && codesDe(choix).includes(codeActuel)) {
    return { ok: false, message: "Des codes vrac sont deja choisis pour ce code au Conditionnement : il ne peut plus etre divise." };
  }
  if (!choisiCommeVrac.error && ((choisiCommeVrac.data ?? []) as unknown[]).length > 0) {
    return { ok: false, message: "Ce code est deja choisi comme vrac par un Conditionnement : il ne peut plus etre divise." };
  }

  // ----- Le nouveau code existe-t-il deja quelque part ? -----
  const motif = echapperLike(nouveauCode);
  const [lignesPrises, historique, entreesVrac, rapports, stock, vracChoisi] = await Promise.all([
    supabaseServer.from("programme_lignes").select("numero_lot").ilike("numero_lot", `%${motif}%`).limit(200),
    supabaseServer.from("programme_dispatcher_history").select("code").ilike("code", motif).limit(1),
    supabaseServer.from("production_vrac_entries").select("code").ilike("code", motif).limit(1),
    supabaseServer.from("production_rapports").select("code").ilike("code", motif).limit(1),
    supabaseServer.from("lots_stock").select("numero_lot").ilike("numero_lot", motif).limit(1),
    supabaseServer.from("conditionnement_codes_vrac").select("code_vrac").ilike("code_vrac", motif).limit(1),
  ]);
  for (const resultat of [lignesPrises, historique, entreesVrac, rapports, stock]) if (resultat.error) return { ok: false, message: resultat.error.message };
  if (vracChoisi.error && !tableAbsente(vracChoisi.error)) return { ok: false, message: vracChoisi.error.message };
  const minuscule = nouveauCode.toLowerCase();
  const prisSurUneLigne = ((lignesPrises.data ?? []) as { numero_lot: string | null }[]).some((autre) =>
    (autre.numero_lot ?? "").split(",").some((lot) => lot.trim().toLowerCase() === minuscule)
  );
  const dejaPris =
    prisSurUneLigne ||
    ((historique.data ?? []) as unknown[]).length > 0 ||
    ((entreesVrac.data ?? []) as unknown[]).length > 0 ||
    ((rapports.data ?? []) as unknown[]).length > 0 ||
    ((stock.data ?? []) as unknown[]).length > 0 ||
    (!vracChoisi.error && ((vracChoisi.data ?? []) as unknown[]).length > 0);
  if (dejaPris) {
    return { ok: false, message: `Le code ${nouveauCode} est deja utilise ailleurs (programme, PD, fabrication ou stock) : choisis un autre code.` };
  }

  // ----- Ecriture : la ligne de programme (si elle a change entre-temps, rien n'est ecrit) -----
  const modification: Record<string, unknown> = { numero_lot: plan.numeroLot, numero_lot_detail: plan.detail };
  if (plan.qtCartonLigne !== null) modification.qt_carton = plan.qtCartonLigne;
  const { data: modifiees, error: modificationErreur } = await supabaseServer
    .from("programme_lignes")
    .update(modification)
    .eq("id", ligneId)
    .eq("numero_lot", ligne.numero_lot ?? "")
    .select("id");
  if (modificationErreur) return { ok: false, message: modificationErreur.message };
  if ((modifiees ?? []).length !== 1) return { ok: false, message: "La ligne a change entre-temps. Recharge la page." };

  // ----- Le PD (historique du Programme Dispatcher) et le dispatcher en cours : le nouveau code y recoit sa propre ligne -----
  const avertissements: string[] = [];
  if (ligne.groupe_id !== null) {
    const pd = await diviserLignesDispatcher("programme_dispatcher_history", "source_groupe_id", ligne, codeActuel, plan, true);
    if (pd) avertissements.push(pd);
    const enCours = await diviserLignesDispatcher("programme_dispatcher_lignes", "groupe_id", ligne, codeActuel, plan, false);
    if (enCours) avertissements.push(enCours);
  }

  const texteCartons = (valeur: number | null) => (valeur === null ? "" : ` (${valeur} cartons)`);
  return {
    ok: true,
    message:
      `Code ${codeActuel} (${plan.vracAvant} kg) divise : ${codeActuel} garde ${plan.gardee.qt_vrac} kg${texteCartons(plan.gardee.qt_carton)} ` +
      `et le nouveau code ${nouveauCode} prend ${plan.nouvelle.qt_vrac} kg${texteCartons(plan.nouvelle.qt_carton)}`,
    code: codeActuel,
    nouveauCode,
    plan,
    avertissements,
  };
}

// Duplique la ligne du code d'origine pour le nouveau code, et ramene la ligne d'origine a sa part. Retourne un avertissement si quelque chose
// n'a pas pu etre fait (la division de la ligne de programme, elle, est deja ecrite : le PD ne bloque jamais la division).
async function diviserLignesDispatcher(
  table: "programme_dispatcher_history" | "programme_dispatcher_lignes",
  colonneGroupe: "source_groupe_id" | "groupe_id",
  ligne: LigneBrute,
  code: string,
  plan: PlanDivision,
  dernierPdSeulement: boolean
): Promise<string | null> {
  const libelle = table === "programme_dispatcher_history" ? "Le PD" : "Le dispatcher en cours";
  const { data, error } = await supabaseServer.from(table).select("*").eq(colonneGroupe, ligne.groupe_id).eq("code", code);
  if (error) return `${libelle} n'a pas pu etre lu : ${error.message}`;

  let candidates = ((data ?? []) as Record<string, unknown>[]).filter((r) => Number(r.article_id) === Number(ligne.article_id));
  // meme chaine / meme zone quand la ligne de programme les donne (et qu'elles existent dans le PD)
  for (const cle of ["chaine", "zone"] as const) {
    const valeur = typeof ligne[cle] === "string" ? (ligne[cle] as string) : null;
    if (!valeur) continue;
    const memes = candidates.filter((r) => r[cle] === valeur);
    if (memes.length > 0) candidates = memes;
  }
  // la ligne dont la quantite est celle du code avant division (un meme code peut etre partage entre plusieurs chaines)
  let retenues = candidates.filter((r) => Math.abs(Number(r.qt_vrac ?? 0) - plan.vracAvant) < 0.01);
  if (retenues.length === 0) return `${libelle} : la ligne de ${code} n'a pas ete retrouvee, ${plan.nouvelle.code} n'y apparait pas.`;
  if (dernierPdSeulement) {
    // le PD affiche pour un code est celui de sa ligne la plus recente : seul ce PD change, les PD plus anciens restent tels qu'enregistres
    const derniere = retenues.reduce((a, b) => (Number(b.id) > Number(a.id) ? b : a));
    retenues = retenues.filter((r) => r.groupe_id === derniere.groupe_id);
  }
  retenues.sort((a, b) => Number(a.id) - Number(b.id));

  for (const ancienne of retenues) {
    const { id, ...copie } = ancienne;
    const { data: creee, error: creationErreur } = await supabaseServer
      .from(table)
      .insert({ ...copie, code: plan.nouvelle.code, qt_vrac: plan.nouvelle.qt_vrac, qt_carton: plan.nouvelle.qt_carton })
      .select("id")
      .maybeSingle();
    const idCree = (creee as { id: number } | null)?.id;
    if (creationErreur || !idCree) return `${libelle} n'a pas pu recevoir ${plan.nouvelle.code} : ${creationErreur?.message ?? "creation impossible"}.`;
    const { error: majErreur } = await supabaseServer
      .from(table)
      .update({ qt_vrac: plan.gardee.qt_vrac, qt_carton: plan.gardee.qt_carton })
      .eq("id", id as number);
    if (majErreur) {
      await supabaseServer.from(table).delete().eq("id", idCree);
      return `${libelle} n'a pas pu etre mis a jour pour ${code} : ${majErreur.message}.`;
    }
  }
  return null;
}
