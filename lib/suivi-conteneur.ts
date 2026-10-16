// Suivi automatique des conteneurs d'un dossier Import MP, via l'API Terminal49 (https://terminal49.com/docs/api-docs).
// On tape le n° de conteneur (et, si on l'a, le n° BL / booking) sur le dossier Import ; l'ERP cree une "demande de suivi" chez
// Terminal49 (qui devine la compagnie maritime), puis relit l'expedition : navire, ports, depart reel, arrivee prevue / reelle,
// decharge... La cle API (variable d'environnement TERMINAL49_API_KEY) n'est jamais montree dans l'ERP.
//
// Ce fichier ne touche pas a la base : validation des numeros, appels a l'API, lecture des reponses. La base (lignes de suivi,
// rafraichissement) est dans lib/suivi-conteneur-db.ts.
import { formatDate } from "@/lib/format-date";

const URL_API = "https://api.terminal49.com/v2";
const DELAI_API_MS = 9000;

// Page "Suivi conteneurs" (carte + liste) : ouverte seulement a ceux a qui un admin donne le droit (Admin > permissions).
export const CLE_PAGE_SUIVI_CONTENEURS = "stockMatierePremiereSuiviConteneurs";
export const URL_PAGE_SUIVI_CONTENEURS = "/stock/matiere-premiere/commande/suivi";
export const URL_PAGE_IMPORT_MP = "/stock/matiere-premiere/commande";

// Cle lue dans l'environnement, nettoyee des erreurs de copier-coller les plus courantes : espaces, guillemets autour, mot "Token "
// (ou "Bearer ") colle devant la cle, ponctuation a la fin. Une cle Terminal49 ne contient jamais ces caracteres.
export function lireCleApi(): string | null {
  let cle = (process.env.TERMINAL49_API_KEY ?? "").trim();
  cle = cle.replace(/^["'`]+|["'`]+$/g, "").trim();
  cle = cle.replace(/^(token|bearer)\s+/i, "").trim();
  cle = cle.replace(/[.,;:]+$/, "");
  return cle || null;
}

// Description de la cle SANS jamais la reveler : longueur et problemes de copier-coller reperes (affichee quand le service refuse la cle).
export function diagnosticCleApi(): string | null {
  const brute = process.env.TERMINAL49_API_KEY ?? "";
  if (!brute.trim()) return null;
  const nettoyee = lireCleApi() ?? "";
  const problemes: string[] = [];
  if (/^\s|\s$/.test(brute)) problemes.push("espace ou retour a la ligne autour de la cle (retire automatiquement)");
  if (/^["'`]|["'`]$/.test(brute.trim())) problemes.push("guillemets autour de la cle (retires automatiquement)");
  if (/^(token|bearer)\s/i.test(brute.trim().replace(/^["'`]+/, ""))) problemes.push("mot Token / Bearer colle devant la cle (retire automatiquement)");
  if (/[.,;:]$/.test(brute.trim().replace(/["'`]+$/, ""))) problemes.push("ponctuation a la fin de la cle (retiree automatiquement)");
  if (/\s/.test(nettoyee)) problemes.push("espace AU MILIEU de la cle : la cle a ete coupee ou mal copiee");
  if (nettoyee.length < 16) problemes.push("cle tres courte : elle semble incomplete");
  return `La cle enregistree dans Vercel fait ${nettoyee.length} caracteres${problemes.length ? ` - a corriger : ${problemes.join(" ; ")}` : " et ne montre aucun defaut de copie visible"}.`;
}

export function suiviConfigure(): boolean {
  return lireCleApi() !== null;
}

// ------------------------------------------------------------------ numeros de conteneur

// ISO 6346 : 4 lettres (3 du proprietaire + 1 categorie) + 6 chiffres + 1 chiffre de controle. Le chiffre de controle detecte la
// plupart des fautes de frappe (un chiffre faux ou 2 chiffres inverses) AVANT d'appeler le service de suivi.
const VALEUR_LETTRE: Record<string, number> = {
  A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20, K: 21, L: 23, M: 24,
  N: 25, O: 26, P: 27, Q: 28, R: 29, S: 30, T: 31, U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38,
};

export function chiffreControleConteneurValide(numero: string): boolean {
  if (!/^[A-Z]{4}\d{7}$/.test(numero)) return false;
  let somme = 0;
  for (let i = 0; i < 10; i++) {
    const caractere = numero[i];
    const valeur = i < 4 ? VALEUR_LETTRE[caractere] : Number(caractere);
    somme += valeur * 2 ** i;
  }
  return (somme % 11) % 10 === Number(numero[10]);
}

export function normaliserNumeroDocument(valeur: string): string {
  return valeur.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

// Plusieurs conteneurs peuvent etre tapes d'un coup, separes par une virgule, un point-virgule ou un retour a la ligne. Un numero
// s'ecrit souvent avec un espace ou un tiret (MSCU 1234567, MSCU-123456-7) : les espaces et tirets d'un meme morceau sont donc
// ignores. Deux numeros colles ou separes seulement par un espace (MSCU1234567 CSQU3054383) sont aussi reconnus.
export function lireNumerosConteneurs(texte: string): { valides: string[]; invalides: string[]; chiffreControleFaux: string[] } {
  const morceaux = texte.split(/[,;\n\r]+/).map(normaliserNumeroDocument).filter(Boolean);
  const liste: string[] = [];
  for (const morceau of morceaux) {
    if (morceau.length > 11 && morceau.length % 11 === 0 && /^([A-Z]{4}\d{7})+$/.test(morceau)) {
      for (let i = 0; i < morceau.length; i += 11) liste.push(morceau.slice(i, i + 11));
    } else {
      liste.push(morceau);
    }
  }
  const numeros = [...new Set(liste)];
  const valides = numeros.filter((numero) => /^[A-Z]{4}\d{7}$/.test(numero));
  return {
    valides,
    invalides: numeros.filter((numero) => !valides.includes(numero)),
    chiffreControleFaux: valides.filter((numero) => !chiffreControleConteneurValide(numero)),
  };
}

// ------------------------------------------------------------------ etat d'un conteneur (ce qu'on garde en base et affiche)

export type Lieu = { nom: string; locode: string | null; lat: number | null; lon: number | null };
export type PhaseSuivi = "attente_depart" | "en_mer" | "arrive_port" | "decharge" | "sorti_port";
export type EvenementSuivi = { code: string; libelle: string; date: string | null; prevu: boolean };

export type EtatSuivi = {
  phase: PhaseSuivi;
  compagnie: string | null;
  navire: string | null;
  imo: string | null;
  voyage: string | null;
  pol: Lieu | null;
  pod: Lieu | null;
  etd: string | null;
  atd: string | null;
  eta: string | null;
  etaInitiale: string | null;
  ata: string | null;
  conteneur: { type: string | null; arriveLe: string | null; dechargeLe: string | null; sortiLe: string | null } | null;
  evenements: EvenementSuivi[];
  maj: string;
};

export const LIBELLE_PHASE: Record<PhaseSuivi, string> = {
  attente_depart: "Pas encore parti",
  en_mer: "En mer",
  arrive_port: "Arrive au port",
  decharge: "Decharge",
  sorti_port: "Sorti du port",
};

export function classePhase(phase: PhaseSuivi): string {
  switch (phase) {
    case "attente_depart":
      return "bg-slate-100 text-slate-800";
    case "en_mer":
      return "bg-sky-100 text-sky-800";
    case "arrive_port":
      return "bg-amber-100 text-amber-800";
    case "decharge":
      return "bg-violet-100 text-violet-800";
    case "sorti_port":
      return "bg-emerald-100 text-emerald-800";
  }
}

// Phrase courte pour la liste Import : "En mer - arrivee prevue 12/11/2026".
export function resumerEtat(etat: EtatSuivi | null): string {
  if (!etat) return "";
  const lieu = etat.pod?.nom ? ` a ${etat.pod.nom}` : "";
  switch (etat.phase) {
    case "attente_depart":
      return etat.etd ? `Depart prevu ${formatDate(etat.etd)}` : "Pas encore parti";
    case "en_mer":
      return etat.eta ? `En mer - arrivee prevue ${formatDate(etat.eta)}` : "En mer";
    case "arrive_port":
      return `Arrive${lieu}${etat.ata ? ` le ${formatDate(etat.ata)}` : ""}`;
    case "decharge":
      return `Decharge${lieu}`;
    case "sorti_port":
      return `Sorti du port${lieu}`;
  }
}

// ------------------------------------------------------------------ appels a l'API Terminal49

type ReponseApi = { statut: number; json: unknown; detail: string | null };
type JsonObjet = Record<string, unknown>;

function objet(valeur: unknown): JsonObjet {
  return valeur && typeof valeur === "object" && !Array.isArray(valeur) ? (valeur as JsonObjet) : {};
}

function texte(valeur: unknown): string | null {
  if (typeof valeur === "string" && valeur.trim()) return valeur.trim();
  if (typeof valeur === "number" && Number.isFinite(valeur)) return String(valeur);
  return null;
}

function nombre(valeur: unknown): number | null {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  const n = Number(valeur);
  return Number.isFinite(n) ? n : null;
}

async function appelApi(chemin: string, options: { methode?: "GET" | "POST"; corps?: unknown } = {}): Promise<ReponseApi> {
  const cle = lireCleApi();
  if (!cle) return { statut: 0, json: null, detail: null };
  try {
    const reponse = await fetch(`${URL_API}${chemin}`, {
      method: options.methode ?? "GET",
      headers: {
        Authorization: `Token ${cle}`,
        "Content-Type": "application/vnd.api+json",
        Accept: "application/vnd.api+json",
      },
      body: options.corps === undefined ? undefined : JSON.stringify(options.corps),
      cache: "no-store",
      signal: AbortSignal.timeout(DELAI_API_MS),
    });
    let json: unknown = null;
    try {
      json = await reponse.json();
    } catch {
      json = null;
    }
    return { statut: reponse.status, json, detail: detailReponse(json) };
  } catch {
    return { statut: 0, json: null, detail: null };
  }
}

// Explication renvoyee par le service dans sa reponse d'erreur (jamais la cle) : aide a comprendre un refus.
function detailReponse(json: unknown): string | null {
  const racine = objet(json);
  const erreurs = Array.isArray(racine.errors) ? (racine.errors as unknown[]) : [];
  const premiere = objet(erreurs[0]);
  const texteErreur = texte(premiere.detail) ?? texte(premiere.title) ?? texte(racine.error) ?? texte(racine.message);
  return texteErreur ? texteErreur.slice(0, 200) : null;
}

function messageErreurHttp(statut: number, detail: string | null = null): string | null {
  const precision = detail ? ` Reponse du service : "${detail}".` : "";
  if (statut === 0) return "Le service de suivi ne repond pas pour le moment (reessaie dans quelques minutes).";
  if (statut === 401) return `Cle API refusee par le service de suivi : verifie TERMINAL49_API_KEY.${precision}`;
  if (statut === 403) return `Ton abonnement du service de suivi n'autorise pas cette operation.${precision}`;
  if (statut === 429) return "Trop de demandes envoyees au service de suivi : reessaie dans une minute.";
  if (statut >= 500) return "Le service de suivi a un probleme temporaire (reessaie plus tard).";
  return null;
}

function detailErreur422(json: unknown): { doublon: boolean; detail: string } {
  const erreurs = Array.isArray(objet(json).errors) ? (objet(json).errors as unknown[]) : [];
  const premiere = objet(erreurs[0]);
  const detail = texte(premiere.detail) ?? texte(premiere.title) ?? "Demande refusee par le service de suivi.";
  const doublon = erreurs.some((erreur) => {
    const e = objet(erreur);
    return e.code === "duplicate" || /already exists/i.test(String(e.detail ?? ""));
  });
  return { doublon, detail };
}

function traduireDetail(detail: string): string {
  if (/not supported|do not currently integrate/i.test(detail)) {
    return "Cette compagnie maritime n'est pas encore prise en charge par le service de suivi.";
  }
  if (/not recognized/i.test(detail)) return "Compagnie maritime non reconnue par le service de suivi.";
  return detail;
}

export type ResultatDemande = { ok: boolean; demandeId: string | null; doublon: boolean; message: string | null };

// Cree la demande de suivi. Avec un n° BL / booking on suit le BL (plus fiable : la plupart des compagnies n'acceptent pas un n° de
// conteneur seul) ; sinon on suit le n° de conteneur. La compagnie est devinee par le service (auto_detect_vocc_scac). Un doublon
// (deja suivi) n'est pas une erreur : l'expedition existe deja, on va simplement la relire.
export async function creerDemandeSuivi(params: {
  numeroConteneur: string;
  numeroBl: string | null;
  reference: string | null;
}): Promise<ResultatDemande> {
  const parBl = Boolean(params.numeroBl);
  const { statut, json, detail } = await appelApi("/tracking_requests", {
    methode: "POST",
    corps: {
      data: {
        type: "tracking_request",
        attributes: {
          request_type: parBl ? "bill_of_lading" : "container",
          request_number: parBl ? params.numeroBl : params.numeroConteneur,
          auto_detect_vocc_scac: true,
          ...(params.reference ? { ref_numbers: [params.reference] } : {}),
        },
      },
    },
  });

  if (statut === 201 || statut === 200) {
    return { ok: true, demandeId: texte(objet(objet(json).data).id), doublon: false, message: null };
  }
  if (statut === 422) {
    const { doublon, detail } = detailErreur422(json);
    if (doublon) return { ok: true, demandeId: null, doublon: true, message: null };
    return { ok: false, demandeId: null, doublon: false, message: traduireDetail(detail) };
  }
  return { ok: false, demandeId: null, doublon: false, message: messageErreurHttp(statut, detail) ?? `Erreur du service de suivi (${statut}).` };
}

const MESSAGE_RAISON_ECHEC: Record<string, string> = {
  not_found: "Numero introuvable chez la compagnie : verifie le numero ou ajoute le numero BL / booking.",
  invalid_number: "Numero invalide : verifie le numero ou ajoute le numero BL / booking.",
  scac_auto_detect_failed: "Compagnie maritime non reconnue : ajoute le numero BL / booking.",
  shipping_line_unreachable: "Le site de la compagnie maritime ne repond pas : nouvel essai automatique plus tard.",
  booking_cancelled: "Le booking a ete annule par la compagnie.",
  expired: "Le suivi a expire (aucune donnee pendant trop longtemps).",
  retries_exhausted: "La compagnie n'a rien renvoye apres plusieurs essais : verifie le numero.",
  data_unavailable: "La compagnie ne fournit pas de donnees pour ce numero.",
};

// Etat de la demande de suivi (pour expliquer pourquoi une expedition n'apparait pas). Reserve a certains abonnements : sur un refus
// ou une erreur on renvoie simplement null, sans bruit.
export async function lireEchecDemande(demandeId: string): Promise<string | null> {
  const { statut, json } = await appelApi(`/tracking_requests/${encodeURIComponent(demandeId)}`);
  if (statut !== 200) return null;
  const attributs = objet(objet(objet(json).data).attributes);
  if (attributs.status !== "failed") return null;
  const raison = texte(attributs.failed_reason);
  return (raison && MESSAGE_RAISON_ECHEC[raison]) || "Le service de suivi n'a pas pu suivre ce numero : verifie le numero ou ajoute le numero BL / booking.";
}

export type ResultatRecherche = {
  expeditionId: string | null;
  etat: EtatSuivi | null;
  erreur: string | null;
};

// Cherche l'expedition (creee par le service quelques minutes apres la demande) et construit l'etat a afficher.
export async function chercherExpedition(params: { numeroConteneur: string; numeroBl: string | null }): Promise<ResultatRecherche> {
  const requete = params.numeroBl || params.numeroConteneur;
  const { statut, json, detail } = await appelApi(
    `/shipments?filter[q]=${encodeURIComponent(requete)}&include=containers,port_of_lading,port_of_discharge&page[size]=10`
  );
  if (statut !== 200) {
    return { expeditionId: null, etat: null, erreur: messageErreurHttp(statut, detail) ?? `Erreur du service de suivi (${statut}).` };
  }

  const racine = objet(json);
  const expeditions = Array.isArray(racine.data) ? (racine.data as unknown[]) : [];
  const inclus = Array.isArray(racine.included) ? (racine.included as unknown[]) : [];

  const parId = new Map<string, JsonObjet>();
  for (const element of inclus) {
    const o = objet(element);
    const type = texte(o.type);
    const id = texte(o.id);
    if (type && id) parId.set(`${type}:${id}`, o);
  }

  const idsRelation = (expedition: JsonObjet, relation: string): string[] => {
    const donnees = objet(objet(objet(expedition.relationships)[relation])).data;
    const liste = Array.isArray(donnees) ? donnees : donnees ? [donnees] : [];
    return liste.map((element) => texte(objet(element).id)).filter((id): id is string => Boolean(id));
  };

  // L'expedition qui contient bien CE conteneur ; a defaut (suivi par BL) celle dont le BL correspond.
  let choisie: JsonObjet | null = null;
  let conteneur: JsonObjet | null = null;
  for (const element of expeditions) {
    const expedition = objet(element);
    const conteneurs = idsRelation(expedition, "containers")
      .map((id) => parId.get(`container:${id}`))
      .filter((c): c is JsonObjet => Boolean(c));
    const trouve = conteneurs.find((c) => normaliserNumeroDocument(String(objet(c.attributes).number ?? "")) === params.numeroConteneur);
    if (trouve) {
      choisie = expedition;
      conteneur = trouve;
      break;
    }
    if (!choisie && params.numeroBl) {
      const attributs = objet(expedition.attributes);
      const bl = normaliserNumeroDocument(String(attributs.bill_of_lading_number ?? attributs.normalized_number ?? ""));
      if (bl && bl === params.numeroBl) choisie = expedition;
    }
  }

  if (!choisie) return { expeditionId: null, etat: null, erreur: null };

  const lieu = (relation: string, nomRepli: unknown, locodeRepli: unknown): Lieu | null => {
    const id = idsRelation(choisie as JsonObjet, relation)[0];
    const port = id ? parId.get(`port:${id}`) : undefined;
    const attributs = objet(port?.attributes);
    const nom = texte(attributs.name) ?? texte(nomRepli);
    if (!nom) return null;
    return {
      nom,
      locode: texte(attributs.code) ?? texte(locodeRepli),
      lat: nombre(attributs.latitude),
      lon: nombre(attributs.longitude),
    };
  };

  const a = objet(choisie.attributes);
  const attributsConteneur = objet(conteneur?.attributes);
  const pol = lieu("port_of_lading", a.port_of_lading_name, a.port_of_lading_locode);
  const pod = lieu("port_of_discharge", a.port_of_discharge_name, a.port_of_discharge_locode);

  const etat = construireEtat({
    compagnie: texte(a.shipping_line_name) ?? texte(a.shipping_line_short_name),
    navire: texte(a.pod_vessel_name),
    imo: texte(a.pod_vessel_imo),
    voyage: texte(a.pod_voyage_number),
    pol,
    pod,
    etd: texte(a.pol_etd_at),
    atd: texte(a.pol_atd_at),
    eta: texte(a.pod_eta_at),
    etaInitiale: texte(a.pod_original_eta_at),
    ata: texte(a.pod_ata_at),
    typeConteneur: [texte(attributsConteneur.equipment_length), texte(attributsConteneur.equipment_type)].filter(Boolean).join(" ") || null,
    conteneurArriveLe: texte(attributsConteneur.pod_arrived_at),
    conteneurDechargeLe: texte(attributsConteneur.pod_discharged_at),
    conteneurSortiLe: texte(attributsConteneur.pod_full_out_at),
    avecConteneur: Boolean(conteneur),
  });

  return { expeditionId: texte(choisie.id), etat, erreur: null };
}

// Construit l'etat affiche a partir des champs de l'expedition (fonction pure, testable sans reseau).
export function construireEtat(entree: {
  compagnie: string | null;
  navire: string | null;
  imo: string | null;
  voyage: string | null;
  pol: Lieu | null;
  pod: Lieu | null;
  etd: string | null;
  atd: string | null;
  eta: string | null;
  etaInitiale: string | null;
  ata: string | null;
  typeConteneur: string | null;
  conteneurArriveLe: string | null;
  conteneurDechargeLe: string | null;
  conteneurSortiLe: string | null;
  avecConteneur: boolean;
  maintenant?: Date;
}): EtatSuivi {
  const arrivee = entree.ata ?? entree.conteneurArriveLe;
  const phase: PhaseSuivi = entree.conteneurSortiLe
    ? "sorti_port"
    : entree.conteneurDechargeLe
      ? "decharge"
      : arrivee
        ? "arrive_port"
        : entree.atd
          ? "en_mer"
          : "attente_depart";

  const depart = entree.atd ?? entree.etd;
  const dateArrivee = arrivee ?? entree.eta;
  const nomPol = entree.pol?.nom ?? "le port de depart";
  const nomPod = entree.pod?.nom ?? "le port d'arrivee";

  const evenements: EvenementSuivi[] = [
    { code: "depart", libelle: `Depart de ${nomPol}`, date: depart, prevu: !entree.atd },
    { code: "arrivee", libelle: `Arrivee a ${nomPod}`, date: dateArrivee, prevu: !arrivee },
    { code: "decharge", libelle: "Decharge du navire", date: entree.conteneurDechargeLe, prevu: !entree.conteneurDechargeLe },
    { code: "sortie", libelle: "Sorti du terminal", date: entree.conteneurSortiLe, prevu: !entree.conteneurSortiLe },
  ];

  return {
    phase,
    compagnie: entree.compagnie,
    navire: entree.navire,
    imo: entree.imo,
    voyage: entree.voyage,
    pol: entree.pol,
    pod: entree.pod,
    etd: entree.etd,
    atd: entree.atd,
    eta: entree.eta,
    etaInitiale: entree.etaInitiale,
    ata: arrivee,
    conteneur: entree.avecConteneur
      ? { type: entree.typeConteneur, arriveLe: entree.conteneurArriveLe, dechargeLe: entree.conteneurDechargeLe, sortiLe: entree.conteneurSortiLe }
      : null,
    evenements,
    maj: (entree.maintenant ?? new Date()).toISOString(),
  };
}
