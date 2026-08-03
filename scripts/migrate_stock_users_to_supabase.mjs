// Migration ponctuelle : copie storage/stock-users.json vers la table
// Supabase stock_users (necessaire pour que la connexion fonctionne sur
// Vercel, qui n'a pas de systeme de fichiers persistant). A lancer une
// seule fois avec: node scripts/migrate_stock_users_to_supabase.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const raw = readFileSync(join(rootDir, ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = loadEnvLocal();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const usersRaw = JSON.parse(readFileSync(join(rootDir, "storage", "stock-users.json"), "utf8"));

const rows = Object.entries(usersRaw).map(([username, record]) => ({
  username,
  password_hash: record.passwordHash,
  permissions: record.permissions || {},
}));

const { data, error } = await supabase.from("stock_users").upsert(rows, { onConflict: "username" }).select("username");

if (error) {
  console.error("Migration failed:", error.message);
  process.exit(1);
}

console.log(`Migrated ${data.length} users:`, data.map((row) => row.username).join(", "));
