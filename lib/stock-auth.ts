import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { supabaseServer } from "./supabase-server";
import { PAGE_REGISTRY, findPageForPath, type PageDefinition } from "./page-registry";

const STOCK_AUTH_COOKIE = "stock_edit_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const STOCK_AUTH_SECRET = process.env.STOCK_AUTH_SECRET;
const ADMIN_USERS = new Set(["mayoub", "ayoub"]);
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export type PagePermissions = Record<string, { view: boolean; write: boolean; delete: boolean }>;

export type StockPermissions = {
  pages: PagePermissions;
  // Commandes a deja un niveau de detail plus fin que "voir/modifier" pour
  // ces deux actions a risque - on les garde a part plutot que de les
  // degrader dans le modele generique par page.
  deleteCommandes: boolean;
  changeStatusCommandes: boolean;
  manageUsers: boolean;
  // Voir les prix/couts (BC MP, lots, recettes, commandes) - a part du
  // systeme page par page, un seul reglage transversal comme manageUsers.
  voirPrix: boolean;
  // Changer la machine Conditionnement d'une ligne sur "Programme par
  // ligne" (le picker existe pour tout le monde qui a "write" sur cette
  // page, mais rester sur la machine par defaut de la grille doit etre le
  // comportement normal - seuls les utilisateurs coches ici peuvent la
  // changer).
  changerMachineConditionnement: boolean;
};

// Forme stockee cote base : peut etre l'ancien format (module) ou le
// nouveau (pages) - normalizeUserRecord() migre l'un vers l'autre a la
// lecture, sans jamais ecraser la table stock_users a la main.
type StoredPermissions = Partial<StockPermissions> & Record<string, unknown>;

type StoredUserRecord =
  | string
  | {
      passwordHash: string;
      permissions?: StoredPermissions;
    };

type NormalizedUserRecord = {
  passwordHash: string;
  permissions: StockPermissions;
  activeSessionToken: string | null;
  sessionStartedAt: string | null;
};

const DEFAULT_STOCK_USERS: Record<string, string> = {
  mayob: "b5dd38303b3a44c82dbbe42a72c3fe131e66b914b9ebca4a34ece678e5ffead3",
  mayoub: "3e1294ebff0cd07c59b368e8592d18fc00e7ba3db6ac2fb245e5473afec644a0",
  david: "07d046d5fac12b3f82daf5035b9aae86db5adc8275ebfbf05ec83005a4a8ba3e",
};

if (!STOCK_AUTH_SECRET) {
  throw new Error("STOCK_AUTH_SECRET is missing.");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

// Nouveaux mots de passe : scrypt sale, resistant au brute-force/tables de
// correspondance (necessaire des que l'app est exposee sur internet, pas
// seulement le reseau local). Format stocke: "scrypt$<selHex>$<hashHex>".
function hashPasswordScrypt(password: string) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function verifyPasswordScrypt(password: string, saltHex: string, hashHex: string) {
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = scryptSync(password, salt, expected.length);
  return safeEqual(derived.toString("hex"), Buffer.from(expected).toString("hex"));
}

// Verifie un mot de passe contre un hash stocke, qu'il soit au nouveau
// format (scrypt$sel$hash) ou a l'ancien format (sha256 simple, sans sel -
// les comptes crees avant ce changement). Les anciens hash sont acceptes
// pour ne pas bloquer les utilisateurs existants ; ils sont mis a niveau
// vers scrypt automatiquement a la prochaine connexion reussie.
function verifyPasswordHash(password: string, storedHash: string) {
  if (storedHash.startsWith("scrypt$")) {
    const [, saltHex, hashHex] = storedHash.split("$");
    if (!saltHex || !hashHex) return false;
    return verifyPasswordScrypt(password, saltHex, hashHex);
  }

  return safeEqual(sha256(password), storedHash);
}

function defaultPagePermissions(isAdmin: boolean): PagePermissions {
  const pages: PagePermissions = {};

  for (const page of PAGE_REGISTRY) {
    if (isAdmin) {
      pages[page.key] = {
        view: true,
        write: page.hasWrite === false ? false : true,
        delete: page.hasWrite === false ? false : true,
      };
      continue;
    }

    pages[page.key] = {
      view: page.defaultView ?? true,
      write: page.hasWrite === false ? false : page.defaultWrite ?? false,
      delete: page.hasWrite === false ? false : page.defaultWrite ?? false,
    };
  }

  return pages;
}

function getDefaultPermissions(username: string): StockPermissions {
  const isAdmin = isAdminUser(username);

  return {
    pages: defaultPagePermissions(isAdmin),
    deleteCommandes: isAdmin,
    changeStatusCommandes: isAdmin,
    manageUsers: isAdmin,
    voirPrix: isAdmin,
    changerMachineConditionnement: isAdmin,
  };
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

// Pour une page donnee, retrouve sa valeur dans l'ancien systeme (module)
// stockee sur disque - sert de valeur de depart la toute premiere fois
// qu'un utilisateur existant est lu apres l'introduction des permissions
// par page, pour ne retirer aucun acces qu'il avait deja. Meme principe que
// deleteCommandes/changeStatusCommandes qui heritaient auparavant de
// editCommandes.
function legacyPageValue(
  page: PageDefinition,
  source: StoredPermissions,
  kind: "view" | "write"
): boolean | undefined {
  const field =
    kind === "view"
      ? page.legacyView ?? `view${page.module}`
      : page.legacyWrite ?? `write${page.module}`;

  const value = source[field];
  return typeof value === "boolean" ? value : undefined;
}

function normalizeUserRecord(
  username: string,
  record: StoredUserRecord
): Omit<NormalizedUserRecord, "activeSessionToken" | "sessionStartedAt"> {
  if (typeof record === "string") {
    return {
      passwordHash: record,
      permissions: getDefaultPermissions(username),
    };
  }

  const isAdmin = isAdminUser(username);
  const defaults = getDefaultPermissions(username);
  const source = record.permissions || {};
  const storedPages = (source.pages as PagePermissions | undefined) || {};

  const pages: PagePermissions = {};

  for (const page of PAGE_REGISTRY) {
    if (isAdmin) {
      pages[page.key] = defaults.pages[page.key];
      continue;
    }

    const stored = storedPages[page.key];

    const view =
      typeof stored?.view === "boolean"
        ? stored.view
        : legacyPageValue(page, source, "view") ?? defaults.pages[page.key].view;

    const write =
      page.hasWrite === false
        ? false
        : typeof stored?.write === "boolean"
          ? stored.write
          : legacyPageValue(page, source, "write") ?? defaults.pages[page.key].write;

    // "Supprimer" n'existait pas comme droit distinct avant - tant qu'un
    // admin n'a pas explicitement decoche la case, on herite de "write" pour
    // ne retirer aucune capacite de suppression qu'un utilisateur avait deja
    // (meme principe que known_page_keys pour les nouvelles pages).
    const del =
      page.hasWrite === false
        ? false
        : typeof stored?.delete === "boolean"
          ? stored.delete
          : write;

    pages[page.key] = { view, write, delete: del };
  }

  const legacyEditCommandes = typeof source.editCommandes === "boolean" ? source.editCommandes : undefined;

  const permissions: StockPermissions = {
    pages,
    deleteCommandes: isAdmin
      ? true
      : typeof source.deleteCommandes === "boolean"
        ? source.deleteCommandes
        : legacyEditCommandes ?? defaults.deleteCommandes,
    changeStatusCommandes: isAdmin
      ? true
      : typeof source.changeStatusCommandes === "boolean"
        ? source.changeStatusCommandes
        : legacyEditCommandes ?? defaults.changeStatusCommandes,
    manageUsers: isAdmin ? true : !!source.manageUsers,
    voirPrix: isAdmin
      ? true
      : typeof source.voirPrix === "boolean"
        ? source.voirPrix
        : defaults.voirPrix,
    changerMachineConditionnement: isAdmin
      ? true
      : typeof source.changerMachineConditionnement === "boolean"
        ? source.changerMachineConditionnement
        : defaults.changerMachineConditionnement,
  };

  return {
    passwordHash: record.passwordHash,
    permissions,
  };
}

async function seedDefaultUsers() {
  const rows = Object.entries(DEFAULT_STOCK_USERS).map(([username, passwordHash]) => ({
    username,
    password_hash: passwordHash,
    permissions: {},
  }));

  const { error } = await supabaseServer.from("stock_users").upsert(rows, { onConflict: "username" });

  if (error) {
    throw new Error(`stock_users seed failed: ${error.message}`);
  }
}

// Chaque verification de permission (canViewPageUser, canWritePageUser,
// getCurrentStockUser...) appelle readUsers() independamment - sans cache,
// une seule page en appelait 6 a 8 fois d'affilee, chacune relisant toute la
// table stock_users. React.cache() dedoublonne ces appels au sein d'une
// meme requete serveur (jamais entre deux requetes/connexions differentes,
// donc aucun risque de permissions perimees affichees a un utilisateur).
const readUsers = cache(async (): Promise<Record<string, NormalizedUserRecord>> => {
  const { data, error } = await supabaseServer
    .from("stock_users")
    .select("username, password_hash, permissions, active_session_token, session_started_at");

  if (error) {
    throw new Error(`stock_users read failed: ${error.message}`);
  }

  if (!data || data.length === 0) {
    await seedDefaultUsers();

    return Object.fromEntries(
      Object.entries(DEFAULT_STOCK_USERS).map(([username, passwordHash]) => [
        username,
        { ...normalizeUserRecord(username, passwordHash), activeSessionToken: null, sessionStartedAt: null },
      ])
    );
  }

  return Object.fromEntries(
    data.map((row) => [
      row.username,
      {
        ...normalizeUserRecord(row.username, {
          passwordHash: row.password_hash,
          permissions: (row.permissions as StoredPermissions) || {},
        }),
        activeSessionToken: (row as { active_session_token: string | null }).active_session_token,
        sessionStartedAt: (row as { session_started_at: string | null }).session_started_at,
      },
    ])
  );
});

async function writeUsers(users: Record<string, NormalizedUserRecord>) {
  const rows = Object.entries(users).map(([username, user]) => ({
    username,
    password_hash: user.passwordHash,
    permissions: user.permissions,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabaseServer.from("stock_users").upsert(rows, { onConflict: "username" });

  if (error) {
    throw new Error(`stock_users write failed: ${error.message}`);
  }
}

async function deleteUserRow(username: string) {
  const { error } = await supabaseServer.from("stock_users").delete().eq("username", username);

  if (error) {
    throw new Error(`stock_users delete failed: ${error.message}`);
  }
}

type LoginAttemptState = {
  count: number;
  firstFailureAt: number;
  lockedUntil?: number;
};

async function readLoginAttemptState(username: string): Promise<LoginAttemptState | null> {
  const { data, error } = await supabaseServer
    .from("stock_login_attempts")
    .select("count, first_failure_at, locked_until")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    throw new Error(`stock_login_attempts read failed: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    count: data.count,
    firstFailureAt: Number(data.first_failure_at),
    lockedUntil: data.locked_until != null ? Number(data.locked_until) : undefined,
  };
}

async function writeLoginAttemptState(username: string, state: LoginAttemptState) {
  const { error } = await supabaseServer.from("stock_login_attempts").upsert(
    {
      username,
      count: state.count,
      first_failure_at: state.firstFailureAt,
      locked_until: state.lockedUntil ?? null,
    },
    { onConflict: "username" }
  );

  if (error) {
    throw new Error(`stock_login_attempts write failed: ${error.message}`);
  }
}

async function clearLoginAttemptState(username: string) {
  const { error } = await supabaseServer.from("stock_login_attempts").delete().eq("username", username);

  if (error) {
    throw new Error(`stock_login_attempts delete failed: ${error.message}`);
  }
}

// Anti brute-force sur la connexion: bloque un utilisateur apres plusieurs
// mots de passe faux d'affilee, pour un temps limite. Necessaire des que le
// site est joignable depuis internet et pas seulement le reseau local.
export async function checkLoginLockout(username: string): Promise<{ locked: boolean; retryAfterSeconds: number }> {
  const normalized = username.trim().toLowerCase();
  const state = await readLoginAttemptState(normalized);

  if (!state?.lockedUntil || state.lockedUntil <= Date.now()) {
    return { locked: false, retryAfterSeconds: 0 };
  }

  return { locked: true, retryAfterSeconds: Math.ceil((state.lockedUntil - Date.now()) / 1000) };
}

export async function recordFailedLogin(username: string) {
  const normalized = username.trim().toLowerCase();
  const state = await readLoginAttemptState(normalized);
  const now = Date.now();

  if (!state || now - state.firstFailureAt > LOGIN_LOCKOUT_WINDOW_MS) {
    await writeLoginAttemptState(normalized, { count: 1, firstFailureAt: now });
    return;
  }

  const nextCount = state.count + 1;
  await writeLoginAttemptState(normalized, {
    count: nextCount,
    firstFailureAt: state.firstFailureAt,
    lockedUntil: nextCount >= MAX_FAILED_LOGIN_ATTEMPTS ? now + LOGIN_LOCKOUT_WINDOW_MS : undefined,
  });
}

export async function clearFailedLogins(username: string) {
  const normalized = username.trim().toLowerCase();
  await clearLoginAttemptState(normalized);
}

function signSession(username: string, expiresAt: string, sessionToken: string) {
  return createHmac("sha256", STOCK_AUTH_SECRET as string)
    .update(`${username}.${expiresAt}.${sessionToken}`)
    .digest("hex");
}

export async function isAllowedStockUser(username: string) {
  const users = await readUsers();
  return username.toLowerCase() in users;
}

export function isAdminUser(username: string | null | undefined) {
  return !!username && ADMIN_USERS.has(username.trim().toLowerCase());
}

// Une session "active" a un jeton et n'a pas depasse la duree du cookie
// (12h) - au-dela, une session laissee ouverte (navigateur ferme sans
// Deconnexion) se libere toute seule, sans intervention de l'admin.
function sessionIsActive(activeSessionToken: string | null, sessionStartedAt: string | null) {
  if (!activeSessionToken || !sessionStartedAt) return false;
  const startedMs = new Date(sessionStartedAt).getTime();
  if (Number.isNaN(startedMs)) return false;
  return startedMs + SESSION_TTL_SECONDS * 1000 > Date.now();
}

// Un seul login actif a la fois par compte (mayoub inclus) - evite que 2
// personnes (ou 2 postes) utilisent le meme compte en meme temps et
// ecrasent le travail l'une de l'autre (ex: Programme par ligne). Si mayoub
// se retrouve bloque sur un poste, Admin > "Qui est connecte" permet de se
// deconnecter soi-meme depuis l'autre poste encore connecte ; sinon la
// session se libere seule au bout de 12h (SESSION_TTL_SECONDS).
export async function checkConcurrentSession(
  username: string
): Promise<{ blocked: boolean; since: string | null }> {
  const normalized = username.trim().toLowerCase();
  const users = await readUsers();
  const user = users[normalized];
  if (!user) return { blocked: false, since: null };

  if (sessionIsActive(user.activeSessionToken, user.sessionStartedAt)) {
    return { blocked: true, since: user.sessionStartedAt };
  }

  return { blocked: false, since: null };
}

export async function forceLogoutStockUser(username: string) {
  const normalized = username.trim().toLowerCase();
  const { error } = await supabaseServer
    .from("stock_users")
    .update({ active_session_token: null, session_started_at: null })
    .eq("username", normalized);

  if (error) {
    throw new Error(`stock_users force logout failed: ${error.message}`);
  }
}

export async function getUserPermissions(username: string | null | undefined): Promise<StockPermissions> {
  if (!username) {
    return getDefaultPermissions("");
  }

  const normalized = username.trim().toLowerCase();
  const users = await readUsers();
  return users[normalized]?.permissions || getDefaultPermissions(normalized);
}

export async function canViewPageUser(username: string | null | undefined, pageKey: string) {
  const permissions = await getUserPermissions(username);
  return permissions.pages[pageKey]?.view ?? false;
}

export async function canWritePageUser(username: string | null | undefined, pageKey: string) {
  const permissions = await getUserPermissions(username);
  return permissions.pages[pageKey]?.write ?? false;
}

export async function canDeletePageUser(username: string | null | undefined, pageKey: string) {
  const permissions = await getUserPermissions(username);
  return permissions.pages[pageKey]?.delete ?? false;
}

// Remplace l'ancien canEditModuleUser(user, "Stock") - garde le meme nom
// pour ne pas avoir a toucher chaque point d'appel de app/stock/actions.ts.
export async function canEditStockUser(username: string | null | undefined) {
  return canWritePageUser(username, "stock");
}

// Droits Commandes plus fins que le "editCommandes" generique : un
// utilisateur peut avoir le droit de modifier sans avoir celui de
// supprimer, ou celui de changer le statut.
export async function canDeleteCommandesUser(username: string | null | undefined) {
  const permissions = await getUserPermissions(username);
  return permissions.deleteCommandes;
}

export async function canChangeStatusCommandesUser(username: string | null | undefined) {
  const permissions = await getUserPermissions(username);
  return permissions.changeStatusCommandes;
}

export async function canVoirPrixUser(username: string | null | undefined) {
  const permissions = await getUserPermissions(username);
  return permissions.voirPrix;
}

export async function canChangerMachineConditionnementUser(username: string | null | undefined) {
  const permissions = await getUserPermissions(username);
  return permissions.changerMachineConditionnement;
}

export async function canViewPathForUser(username: string | null | undefined, pathname: string): Promise<boolean> {
  if (pathname === "/" || pathname.startsWith("/test-supabase")) {
    return true;
  }

  if (pathname.startsWith("/admin")) {
    const permissions = await getUserPermissions(username);
    return permissions.manageUsers;
  }

  const page = findPageForPath(pathname);

  if (!page) {
    return true;
  }

  return canViewPageUser(username, page.key);
}

export async function canWritePathForUser(username: string | null | undefined, pathname: string): Promise<boolean> {
  const page = findPageForPath(pathname);
  if (!page) return false;
  return canWritePageUser(username, page.key);
}

// Carte {pageKey: peutVoir} pour tout le PAGE_REGISTRY - consommee par
// GlobalNav (visibilite des liens) et RouteAccessGate (blocage d'acces).
export async function getPageViewMap(username: string | null | undefined): Promise<Record<string, boolean>> {
  const permissions = await getUserPermissions(username);
  const map: Record<string, boolean> = {};

  for (const page of PAGE_REGISTRY) {
    map[page.key] = permissions.pages[page.key]?.view ?? false;
  }

  return map;
}

export async function verifyStockPassword(username: string, password: string) {
  const normalized = username.trim().toLowerCase();
  const users = await readUsers();
  const storedHash = users[normalized]?.passwordHash;

  if (!storedHash) {
    return false;
  }

  const valid = verifyPasswordHash(password, storedHash);

  if (valid && !storedHash.startsWith("scrypt$")) {
    users[normalized].passwordHash = hashPasswordScrypt(password);
    await writeUsers(users);
  }

  return valid;
}

export async function updateStockPassword(username: string, nextPassword: string) {
  const normalized = username.trim().toLowerCase();
  const users = await readUsers();

  if (!users[normalized]) {
    return false;
  }

  users[normalized].passwordHash = hashPasswordScrypt(nextPassword);
  await writeUsers(users);
  return true;
}

export async function createStockUser(username: string, password: string) {
  const normalized = username.trim().toLowerCase();
  const users = await readUsers();

  if (!normalized || users[normalized]) {
    return false;
  }

  users[normalized] = {
    passwordHash: hashPasswordScrypt(password),
    permissions: getDefaultPermissions(normalized),
    activeSessionToken: null,
    sessionStartedAt: null,
  };
  await writeUsers(users);
  return true;
}

// Change seulement le mot de passe - garde les permissions et la session en
// cours intactes (contrairement a effacer + recreer l'utilisateur, qui
// remettrait ses permissions a la valeur par defaut).
export async function resetStockUserPassword(username: string, newPassword: string) {
  const normalized = username.trim().toLowerCase();
  const users = await readUsers();

  if (!users[normalized]) {
    return false;
  }

  users[normalized].passwordHash = hashPasswordScrypt(newPassword);
  await writeUsers(users);
  return true;
}

export async function deleteStockUser(username: string) {
  const normalized = username.trim().toLowerCase();

  if (!normalized || isAdminUser(normalized)) {
    return false;
  }

  const users = await readUsers();

  if (!users[normalized]) {
    return false;
  }

  await deleteUserRow(normalized);
  return true;
}

export async function updateUserPermissions(
  username: string,
  nextPermissions: {
    pages: PagePermissions;
    deleteCommandes: boolean;
    changeStatusCommandes: boolean;
    manageUsers: boolean;
    voirPrix: boolean;
    changerMachineConditionnement: boolean;
  }
) {
  const normalized = username.trim().toLowerCase();
  const users = await readUsers();

  if (!users[normalized]) {
    return false;
  }

  if (isAdminUser(normalized)) {
    users[normalized].permissions = getDefaultPermissions(normalized);
    await writeUsers(users);
    return true;
  }

  // Remplacement complet (pas de fusion partielle) : le formulaire Admin
  // soumet toujours l'etat de TOUTES les pages du registre, donc une page
  // absente du formulaire soumis doit bien repasser a false, pas garder son
  // ancienne valeur indefiniment.
  users[normalized].permissions = {
    pages: nextPermissions.pages,
    deleteCommandes: !!nextPermissions.deleteCommandes,
    changeStatusCommandes: !!nextPermissions.changeStatusCommandes,
    manageUsers: !!nextPermissions.manageUsers,
    voirPrix: !!nextPermissions.voirPrix,
    changerMachineConditionnement: !!nextPermissions.changerMachineConditionnement,
  };

  await writeUsers(users);
  return true;
}

export async function listStockUsers() {
  const users = await readUsers();

  return Object.keys(users)
    .sort((a, b) => a.localeCompare(b))
    .map((username) => ({
      username,
      isAdmin: isAdminUser(username),
      permissions: users[username].permissions,
      connected: sessionIsActive(users[username].activeSessionToken, users[username].sessionStartedAt),
      connectedSince: users[username].sessionStartedAt,
    }));
}

export async function createStockSession(username: string) {
  const normalized = username.trim().toLowerCase();
  const cookieStore = await cookies();
  const expiresAt = String(Date.now() + SESSION_TTL_SECONDS * 1000);
  const token = randomBytes(16).toString("hex");
  const signature = signSession(normalized, expiresAt, token);

  const { error } = await supabaseServer
    .from("stock_users")
    .update({ active_session_token: token, session_started_at: new Date().toISOString() })
    .eq("username", normalized);

  if (error) {
    throw new Error(`stock_users session write failed: ${error.message}`);
  }

  cookieStore.set(STOCK_AUTH_COOKIE, `${normalized}.${expiresAt}.${token}.${signature}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearStockSession(username?: string | null) {
  const cookieStore = await cookies();
  cookieStore.delete(STOCK_AUTH_COOKIE);

  if (username) {
    await forceLogoutStockUser(username);
  }
}

export async function getCurrentStockUser() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(STOCK_AUTH_COOKIE)?.value || "";

  if (!raw) {
    return null;
  }

  const [username, expiresAt, token, signature] = raw.split(".");

  if (!username || !expiresAt || !token || !signature) {
    return null;
  }

  if (!(await isAllowedStockUser(username))) {
    return null;
  }

  if (!safeEqual(signature, signSession(username, expiresAt, token))) {
    return null;
  }

  if (Number(expiresAt) < Date.now()) {
    return null;
  }

  // Le jeton du cookie doit correspondre exactement a celui stocke en base
  // (mayoub inclus) - sinon un login plus recent ailleurs (ou une
  // deconnexion forcee depuis Admin) a deja invalide cette session.
  const users = await readUsers();
  const user = users[username];
  if (!user || user.activeSessionToken !== token) {
    return null;
  }

  return username;
}
