// Sauvegarde de l'ERP sur cet ordinateur : TOUTES les donnees (une fichier JSON par table) + TOUS les fichiers joints
// (pieces jointes NC / TAF, photos des Transfer Order). Lecture seule : rien n'est modifie dans l'ERP.
//
//   node scripts/sauvegarde/sauvegarde-erp.mjs
//
// Resultat dans "Documents\Sauvegardes ERP" (ou le dossier donne dans SAUVEGARDE_DOSSIER) :
//   donnees-AAAA-MM-JJ\   une copie complete des donnees par jour (les 14 derniers jours sont gardes)
//   fichiers\             les fichiers joints : copie unique, completee a chaque sauvegarde (rien n'est jamais supprime)
//   derniere-sauvegarde.txt   OK ou ERREUR + resume de la derniere sauvegarde
//   journal.txt           historique de toutes les sauvegardes
// Les identifiants de connexion a la base sont lus dans le fichier .env.local du projet (jamais affiches).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOSSIER = process.env.SAUVEGARDE_DOSSIER || path.join(os.homedir(), "Documents", "Sauvegardes ERP");
const JOURS_GARDES = 14;
const TAILLE_PAGE = 1000;
const TABLES_EN_PARALLELE = 4;
const FICHIERS_EN_PARALLELE = 4;
const DELAI_REQUETE_MS = 180_000;

// ---------------------------------------------------------------- configuration
function lireEnv() {
  const env = {};
  const chemin = path.join(RACINE, ".env.local");
  if (!fs.existsSync(chemin)) throw new Error(`Fichier .env.local introuvable dans ${RACINE}`);
  for (const ligne of fs.readFileSync(chemin, "utf8").split(/\r?\n/)) {
    const m = ligne.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}
const env = lireEnv();
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const CLE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !CLE) throw new Error("NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans .env.local");
const ENTETES = { apikey: CLE, Authorization: `Bearer ${CLE}` };

const debut = Date.now();
const maintenant = new Date();
const jour = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, "0")}-${String(maintenant.getDate()).padStart(2, "0")}`;
const erreurs = [];
const log = (texte) => console.log(`[${new Date().toLocaleTimeString("fr-FR")}] ${texte}`);

// ---------------------------------------------------------------- reseau (avec 3 essais)
async function appeler(url, options = {}) {
  let derniere;
  for (let essai = 1; essai <= 3; essai++) {
    try {
      const reponse = await fetch(url, { ...options, signal: AbortSignal.timeout(DELAI_REQUETE_MS) });
      if (reponse.status >= 500 || reponse.status === 429) throw new Error(`HTTP ${reponse.status}`);
      return reponse;
    } catch (e) {
      derniere = e;
      await new Promise((r) => setTimeout(r, 1500 * essai));
    }
  }
  throw derniere;
}

async function enParallele(elements, nombre, travail) {
  const file = [...elements];
  await Promise.all(
    Array.from({ length: Math.min(nombre, file.length) }, async () => {
      while (file.length > 0) await travail(file.shift());
    })
  );
}

// ---------------------------------------------------------------- donnees
async function listerTables() {
  const reponse = await appeler(`${URL_BASE}/rest/v1/`, { headers: { ...ENTETES, Accept: "application/openapi+json" } });
  if (!reponse.ok) throw new Error(`Liste des tables impossible : HTTP ${reponse.status}`);
  const schema = await reponse.json();
  return Object.entries(schema.definitions ?? {})
    // les vues (v_...) sont recalculees a partir des tables : inutile de les sauvegarder
    .filter(([nom]) => !nom.startsWith("v_"))
    .map(([nom, definition]) => ({
      nom,
      cles: Object.entries(definition.properties ?? {})
        .filter(([, propriete]) => String(propriete.description ?? "").includes("<pk/>"))
        .map(([colonne]) => colonne),
      colonnes: Object.keys(definition.properties ?? {}),
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom));
}

async function sauvegarderTable(table, dossier) {
  const ordre = (table.cles.length > 0 ? table.cles : table.colonnes.slice(0, 1)).map((c) => `${c}.asc`).join(",");
  const fichier = fs.createWriteStream(path.join(dossier, `${table.nom}.json`), { encoding: "utf8" });
  const ecrire = (texte) => new Promise((resolve, reject) => fichier.write(texte, (e) => (e ? reject(e) : resolve())));
  let lignes = 0;
  let attendu = null;
  try {
    await ecrire("[\n");
    for (let debutPage = 0; ; debutPage += TAILLE_PAGE) {
      const reponse = await appeler(`${URL_BASE}/rest/v1/${encodeURIComponent(table.nom)}?select=*&order=${ordre}`, {
        headers: {
          ...ENTETES,
          "Range-Unit": "items",
          Range: `${debutPage}-${debutPage + TAILLE_PAGE - 1}`,
          ...(debutPage === 0 ? { Prefer: "count=exact" } : {}),
        },
      });
      if (!reponse.ok && reponse.status !== 206) throw new Error(`HTTP ${reponse.status} ${(await reponse.text()).slice(0, 120)}`);
      if (debutPage === 0) {
        const total = reponse.headers.get("content-range")?.split("/")[1];
        attendu = total && total !== "*" ? Number(total) : null;
      }
      const page = await reponse.json();
      for (const ligne of page) {
        await ecrire(`${lignes > 0 ? ",\n" : ""}${JSON.stringify(ligne)}`);
        lignes++;
      }
      if (page.length < TAILLE_PAGE) break;
    }
    await ecrire("\n]\n");
  } finally {
    await new Promise((resolve) => fichier.end(resolve));
  }
  if (attendu !== null && attendu !== lignes) {
    erreurs.push(`Table ${table.nom} : ${lignes} lignes sauvegardees au lieu de ${attendu} (des lignes ont change pendant la sauvegarde ?)`);
  }
  return { lignes, attendu };
}

// ---------------------------------------------------------------- fichiers joints
async function listerFichiers(bucket, prefixe = "") {
  const fichiers = [];
  for (let decalage = 0; ; decalage += 1000) {
    const reponse = await appeler(`${URL_BASE}/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
      method: "POST",
      headers: { ...ENTETES, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: prefixe, limit: 1000, offset: decalage, sortBy: { column: "name", order: "asc" } }),
    });
    if (!reponse.ok) throw new Error(`Liste de ${bucket}/${prefixe} impossible : HTTP ${reponse.status}`);
    const page = await reponse.json();
    for (const element of page) {
      if (element.id === null || element.id === undefined) {
        fichiers.push(...(await listerFichiers(bucket, `${prefixe}${element.name}/`)));
      } else {
        fichiers.push({ chemin: `${prefixe}${element.name}`, taille: Number(element.metadata?.size ?? -1) });
      }
    }
    if (page.length < 1000) break;
  }
  return fichiers;
}

// Chemin Windows valide (sans caracteres interdits) pour un fichier du dossier distant
const nomLocal = (chemin) => chemin.split("/").map((partie) => partie.replace(/[<>:"\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "_")).join(path.sep);

async function sauvegarderFichiers() {
  const resume = {};
  const reponse = await appeler(`${URL_BASE}/storage/v1/bucket`, { headers: ENTETES });
  if (!reponse.ok) throw new Error(`Liste des dossiers de fichiers impossible : HTTP ${reponse.status}`);
  const buckets = (await reponse.json()).map((b) => b.name);
  for (const bucket of buckets) {
    const fichiers = await listerFichiers(bucket);
    let nouveaux = 0;
    let octets = 0;
    await enParallele(fichiers, FICHIERS_EN_PARALLELE, async (fichier) => {
      const destination = path.join(DOSSIER, "fichiers", bucket, nomLocal(fichier.chemin));
      try {
        if (fs.existsSync(destination) && (fichier.taille < 0 || fs.statSync(destination).size === fichier.taille)) return;
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        const telechargement = await appeler(`${URL_BASE}/storage/v1/object/${encodeURIComponent(bucket)}/${fichier.chemin.split("/").map(encodeURIComponent).join("/")}`, { headers: ENTETES });
        if (!telechargement.ok || !telechargement.body) throw new Error(`HTTP ${telechargement.status}`);
        const temporaire = `${destination}.partiel`;
        await pipeline(Readable.fromWeb(telechargement.body), fs.createWriteStream(temporaire));
        fs.renameSync(temporaire, destination);
        nouveaux++;
        octets += fs.statSync(destination).size;
      } catch (e) {
        erreurs.push(`Fichier ${bucket}/${fichier.chemin} : ${e.message}`);
      }
    });
    resume[bucket] = { fichiers: fichiers.length, nouveaux, octetsNouveaux: octets };
    log(`fichiers ${bucket} : ${fichiers.length} fichier(s), ${nouveaux} nouveau(x) telecharge(s)`);
  }
  return resume;
}

// ---------------------------------------------------------------- principal
async function principal() {
  fs.mkdirSync(DOSSIER, { recursive: true });
  const enCours = path.join(DOSSIER, `donnees-${jour}.en-cours`);
  fs.rmSync(enCours, { recursive: true, force: true });
  fs.mkdirSync(enCours, { recursive: true });

  log(`Sauvegarde de l'ERP vers ${DOSSIER}`);
  const tables = await listerTables();
  log(`${tables.length} tables a sauvegarder`);
  const resumeTables = {};
  await enParallele(tables, TABLES_EN_PARALLELE, async (table) => {
    try {
      const { lignes } = await sauvegarderTable(table, enCours);
      resumeTables[table.nom] = lignes;
    } catch (e) {
      resumeTables[table.nom] = -1;
      erreurs.push(`Table ${table.nom} : ${e.message}`);
    }
  });
  const lignesTotal = Object.values(resumeTables).filter((n) => n > 0).reduce((a, b) => a + b, 0);
  log(`donnees : ${lignesTotal} lignes dans ${tables.length} tables`);

  let resumeFichiers = {};
  try {
    resumeFichiers = await sauvegarderFichiers();
  } catch (e) {
    erreurs.push(`Fichiers joints : ${e.message}`);
  }

  const duree = Math.round((Date.now() - debut) / 1000);
  fs.writeFileSync(
    path.join(enCours, "resume.json"),
    JSON.stringify({ date: maintenant.toISOString(), dureeSecondes: duree, tables: resumeTables, fichiers: resumeFichiers, erreurs }, null, 2)
  );

  // la copie du jour remplace celle d'une sauvegarde precedente du meme jour
  const finale = path.join(DOSSIER, `donnees-${jour}`);
  fs.rmSync(finale, { recursive: true, force: true });
  fs.renameSync(enCours, finale);

  // on garde les 14 derniers jours de donnees
  for (const nom of fs.readdirSync(DOSSIER)) {
    const m = nom.match(/^donnees-(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) continue;
    const age = (maintenant.getTime() - new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()) / 86_400_000;
    if (age > JOURS_GARDES) fs.rmSync(path.join(DOSSIER, nom), { recursive: true, force: true });
  }

  const statut = erreurs.length === 0 ? "OK" : "ERREUR";
  const nbFichiers = Object.values(resumeFichiers).reduce((a, b) => a + b.fichiers, 0);
  const texte =
    `${statut} - sauvegarde du ${maintenant.toLocaleString("fr-FR")} (${duree} s)\n` +
    `${tables.length} tables, ${lignesTotal} lignes, ${nbFichiers} fichiers joints\n` +
    `Dossier : ${finale}\n` +
    (erreurs.length > 0 ? `\nProblemes :\n- ${erreurs.join("\n- ")}\n` : "");
  fs.writeFileSync(path.join(DOSSIER, "derniere-sauvegarde.txt"), texte);
  fs.appendFileSync(path.join(DOSSIER, "journal.txt"), `${texte}\n`);
  console.log(`\n${texte}`);
  process.exitCode = erreurs.length === 0 ? 0 : 1;
}

principal().catch((e) => {
  const texte = `ERREUR - sauvegarde du ${new Date().toLocaleString("fr-FR")} : ${e.message}\n`;
  try {
    fs.mkdirSync(DOSSIER, { recursive: true });
    fs.writeFileSync(path.join(DOSSIER, "derniere-sauvegarde.txt"), texte);
    fs.appendFileSync(path.join(DOSSIER, "journal.txt"), `${texte}\n`);
  } catch {
    // dossier de sauvegarde inaccessible : le message reste affiche ci-dessous
  }
  console.error(texte);
  process.exit(1);
});
