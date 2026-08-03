import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { PAGE_REGISTRY, findPageForPath, type PageDefinition } from "./page-registry";

const STOCK_AUTH_COOKIE = "stock_edit_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const STOCK_AUTH_SECRET = process.env.STOCK_AUTH_SECRET;
const USERS_FILE = join(process.cwd(), "storage", "stock-users.json");
const LOGIN_ATTEMPTS_FILE = join(process.cwd(), "storage", "login-attempts.json");
const ADMIN_USERS = new Set(["mayoub"]);
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export type PagePermissions = Record<string, { view: boolean; write: boolean }>;

export type StockPermissions = {
  pages: PagePermissions;
  // Commandes a deja un niveau de detail plus fin que "voir/modifier" pour
  // ces deux actions a risque - on les garde a part plutot que de les
  // degrader dans le modele generique par page.
  deleteCommandes: boolean;
  changeStatusCommandes: boolean;
  manageUsers: boolean;
};

// Forme stockee cote disque : peut etre l'ancien format (module) ou le
// nouveau (pages) - normalizeUserRecord() migre l'un vers l'autre a la
// lecture, sans jamais ecraser storage/stock-users.json a la main.
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
      pages[page.key] = { view: true, write: page.hasWrite === false ? false : true };
      continue;
    }

    pages[page.key] = {
      view: page.defaultView ?? true,
      write: page.hasWrite === false ? false : page.defaultWrite ?? false,
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

function ensureUsersFile() {
  const folder = join(process.cwd(), "storage");

  if (!existsSync(folder)) {
    mkdirSync(folder, { recursive: true });
  }

  if (!existsSync(USERS_FILE)) {
    writeFileSync(USERS_FILE, JSON.stringify(DEFAULT_STOCK_USERS, null, 2), "utf8");
  }
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

function normalizeUserRecord(username: string, record: StoredUserRecord): NormalizedUserRecord {
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

    pages[page.key] = { view, write };
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
  };

  return {
    passwordHash: record.passwordHash,
    permissions,
  };
}

function readUsers() {
  ensureUsersFile();

  try {
    const raw = readFileSync(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw) as Record<string, StoredUserRecord>;

    if (!parsed || typeof parsed !== "object") {
      return Object.fromEntries(
        Object.entries(DEFAULT_STOCK_USERS).map(([username, passwordHash]) => [
          username,
          normalizeUserRecord(username, passwordHash),
        ])
      ) as Record<string, NormalizedUserRecord>;
    }

    // Use the file as the sole source of truth: ensureUsersFile() already
    // seeds it with DEFAULT_STOCK_USERS on first run. Re-merging the defaults
    // here on every read would resurrect default users (mayob, david...)
    // right after an admin deletes them.
    return Object.fromEntries(
      Object.entries(parsed).map(([username, record]) => [
        username,
        normalizeUserRecord(username, record),
      ])
    ) as Record<string, NormalizedUserRecord>;
  } catch {
    return Object.fromEntries(
      Object.entries(DEFAULT_STOCK_USERS).map(([username, passwordHash]) => [
        username,
        normalizeUserRecord(username, passwordHash),
      ])
    ) as Record<string, NormalizedUserRecord>;
  }
}

function writeUsers(users: Record<string, NormalizedUserRecord>) {
  ensureUsersFile();
  const serializable = Object.fromEntries(
    Object.entries(users).map(([username, user]) => [
      username,
      {
        passwordHash: user.passwordHash,
        permissions: user.permissions,
      },
    ])
  );
  writeFileSync(USERS_FILE, JSON.stringify(serializable, null, 2), "utf8");
}

type LoginAttemptState = {
  count: number;
  firstFailureAt: number;
  lockedUntil?: number;
};

function readLoginAttempts(): Record<string, LoginAttemptState> {
  try {
    const raw = readFileSync(LOGIN_ATTEMPTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeLoginAttempts(attempts: Record<string, LoginAttemptState>) {
  const folder = join(process.cwd(), "storage");
  if (!existsSync(folder)) {
    mkdirSync(folder, { recursive: true });
  }
  writeFileSync(LOGIN_ATTEMPTS_FILE, JSON.stringify(attempts, null, 2), "utf8");
}

// Anti brute-force sur la connexion: bloque un utilisateur apres plusieurs
// mots de passe faux d'affilee, pour un temps limite. Necessaire des que le
// site est joignable depuis internet et pas seulement le reseau local.
export function checkLoginLockout(username: string): { locked: boolean; retryAfterSeconds: number } {
  const normalized = username.trim().toLowerCase();
  const attempts = readLoginAttempts();
  const state = attempts[normalized];

  if (!state?.lockedUntil || state.lockedUntil <= Date.now()) {
    return { locked: false, retryAfterSeconds: 0 };
  }

  return { locked: true, retryAfterSeconds: Math.ceil((state.lockedUntil - Date.now()) / 1000) };
}

export function recordFailedLogin(username: string) {
  const normalized = username.trim().toLowerCase();
  const attempts = readLoginAttempts();
  const now = Date.now();
  const state = attempts[normalized];

  if (!state || now - state.firstFailureAt > LOGIN_LOCKOUT_WINDOW_MS) {
    attempts[normalized] = { count: 1, firstFailureAt: now };
  } else {
    const nextCount = state.count + 1;
    attempts[normalized] = {
      count: nextCount,
      firstFailureAt: state.firstFailureAt,
      lockedUntil: nextCount >= MAX_FAILED_LOGIN_ATTEMPTS ? now + LOGIN_LOCKOUT_WINDOW_MS : undefined,
    };
  }

  writeLoginAttempts(attempts);
}

export function clearFailedLogins(username: string) {
  const normalized = username.trim().toLowerCase();
  const attempts = readLoginAttempts();

  if (attempts[normalized]) {
    delete attempts[normalized];
    writeLoginAttempts(attempts);
  }
}

function signSession(username: string, expiresAt: string) {
  return createHmac("sha256", STOCK_AUTH_SECRET as string)
    .update(`${username}.${expiresAt}`)
    .digest("hex");
}

export function isAllowedStockUser(username: string) {
  return username.toLowerCase() in readUsers();
}

export function isAdminUser(username: string | null | undefined) {
  return !!username && ADMIN_USERS.has(username.trim().toLowerCase());
}

export function getUserPermissions(username: string | null | undefined): StockPermissions {
  if (!username) {
    return getDefaultPermissions("");
  }

  const normalized = username.trim().toLowerCase();
  const users = readUsers();
  return users[normalized]?.permissions || getDefaultPermissions(normalized);
}

export function canViewPageUser(username: string | null | undefined, pageKey: string) {
  return getUserPermissions(username).pages[pageKey]?.view ?? false;
}

export function canWritePageUser(username: string | null | undefined, pageKey: string) {
  return getUserPermissions(username).pages[pageKey]?.write ?? false;
}

// Remplace l'ancien canEditModuleUser(user, "Stock") - garde le meme nom
// pour ne pas avoir a toucher chaque point d'appel de app/stock/actions.ts.
export function canEditStockUser(username: string | null | undefined) {
  return canWritePageUser(username, "stock");
}

// Droits Commandes plus fins que le "editCommandes" generique : un
// utilisateur peut avoir le droit de modifier sans avoir celui de
// supprimer, ou celui de changer le statut.
export function canDeleteCommandesUser(username: string | null | undefined) {
  return getUserPermissions(username).deleteCommandes;
}

export function canChangeStatusCommandesUser(username: string | null | undefined) {
  return getUserPermissions(username).changeStatusCommandes;
}

export function canViewPathForUser(username: string | null | undefined, pathname: string): boolean {
  if (pathname === "/" || pathname.startsWith("/test-supabase")) {
    return true;
  }

  if (pathname.startsWith("/admin")) {
    return getUserPermissions(username).manageUsers;
  }

  const page = findPageForPath(pathname);

  if (!page) {
    return true;
  }

  return canViewPageUser(username, page.key);
}

export function canWritePathForUser(username: string | null | undefined, pathname: string): boolean {
  const page = findPageForPath(pathname);
  if (!page) return false;
  return canWritePageUser(username, page.key);
}

// Carte {pageKey: peutVoir} pour tout le PAGE_REGISTRY - consommee par
// GlobalNav (visibilite des liens) et RouteAccessGate (blocage d'acces).
export function getPageViewMap(username: string | null | undefined): Record<string, boolean> {
  const permissions = getUserPermissions(username);
  const map: Record<string, boolean> = {};

  for (const page of PAGE_REGISTRY) {
    map[page.key] = permissions.pages[page.key]?.view ?? false;
  }

  return map;
}

export function verifyStockPassword(username: string, password: string) {
  const normalized = username.trim().toLowerCase();
  const users = readUsers();
  const storedHash = users[normalized]?.passwordHash;

  if (!storedHash) {
    return false;
  }

  const valid = verifyPasswordHash(password, storedHash);

  if (valid && !storedHash.startsWith("scrypt$")) {
    users[normalized].passwordHash = hashPasswordScrypt(password);
    writeUsers(users);
  }

  return valid;
}

export function updateStockPassword(username: string, nextPassword: string) {
  const normalized = username.trim().toLowerCase();
  const users = readUsers();

  if (!users[normalized]) {
    return false;
  }

  users[normalized].passwordHash = hashPasswordScrypt(nextPassword);
  writeUsers(users);
  return true;
}

export function createStockUser(username: string, password: string) {
  const normalized = username.trim().toLowerCase();
  const users = readUsers();

  if (!normalized || users[normalized]) {
    return false;
  }

  users[normalized] = {
    passwordHash: hashPasswordScrypt(password),
    permissions: getDefaultPermissions(normalized),
  };
  writeUsers(users);
  return true;
}

export function deleteStockUser(username: string) {
  const normalized = username.trim().toLowerCase();

  if (!normalized || isAdminUser(normalized)) {
    return false;
  }

  const users = readUsers();

  if (!users[normalized]) {
    return false;
  }

  delete users[normalized];
  writeUsers(users);
  return true;
}

export function updateUserPermissions(
  username: string,
  nextPermissions: {
    pages: PagePermissions;
    deleteCommandes: boolean;
    changeStatusCommandes: boolean;
    manageUsers: boolean;
  }
) {
  const normalized = username.trim().toLowerCase();
  const users = readUsers();

  if (!users[normalized]) {
    return false;
  }

  if (isAdminUser(normalized)) {
    users[normalized].permissions = getDefaultPermissions(normalized);
    writeUsers(users);
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
  };

  writeUsers(users);
  return true;
}

export function listStockUsers() {
  const users = readUsers();

  return Object.keys(users)
    .sort((a, b) => a.localeCompare(b))
    .map((username) => ({
      username,
      isAdmin: isAdminUser(username),
      permissions: users[username].permissions,
    }));
}

export async function createStockSession(username: string) {
  const normalized = username.trim().toLowerCase();
  const cookieStore = await cookies();
  const expiresAt = String(Date.now() + SESSION_TTL_SECONDS * 1000);
  const signature = signSession(normalized, expiresAt);

  cookieStore.set(STOCK_AUTH_COOKIE, `${normalized}.${expiresAt}.${signature}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearStockSession() {
  const cookieStore = await cookies();
  cookieStore.delete(STOCK_AUTH_COOKIE);
}

export async function getCurrentStockUser() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(STOCK_AUTH_COOKIE)?.value || "";

  if (!raw) {
    return null;
  }

  const [username, expiresAt, signature] = raw.split(".");

  if (!username || !expiresAt || !signature) {
    return null;
  }

  if (!isAllowedStockUser(username)) {
    return null;
  }

  if (!safeEqual(signature, signSession(username, expiresAt))) {
    return null;
  }

  if (Number(expiresAt) < Date.now()) {
    return null;
  }

  return username;
}
