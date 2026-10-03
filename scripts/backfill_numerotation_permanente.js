// A lancer UNE FOIS, apres scripts/sql/create_numerotation_permanente.sql :
//
//   node scripts/backfill_numerotation_permanente.js          (ecrit)
//   node scripts/backfill_numerotation_permanente.js --dry    (affiche seulement)
//
// Fige dans la base les numeros que l'ERP affiche AUJOURD'HUI (PL, PD, TE, EP,
// TS, TE/TS/TSA matiere premiere, CLAB), pour qu'ils ne changent plus jamais,
// puis initialise les compteurs de TO, TI, MB et IM au plus grand numero
// existant. Sans danger si relance : un document deja numerote garde son
// numero, et un compteur ne redescend jamais. Ne modifie aucun document.
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, ""),
    ])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const DRY = process.argv.includes("--dry");

async function lireTout(table, colonnes, filtre) {
  const lignes = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(colonnes).order("id", { ascending: true }).range(from, from + 999);
    if (filtre) q = filtre(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    lignes.push(...data);
    if (data.length < 1000) break;
  }
  return lignes;
}

async function lireRegistre(kind) {
  const { data, error } = await sb.rpc("document_lire_numeros", { p_kind: kind });
  if (error) throw new Error(`document_lire_numeros(${kind}): ${error.message}`);
  return new Map(data.map((r) => [Number(r.ref_id), { annee: Number(r.annee), numero: Number(r.numero) }]));
}

async function numeroter(kind, items) {
  const existants = await lireRegistre(kind);
  const manquants = items.filter((i) => !existants.has(i.refId));
  console.log(`  ${kind.padEnd(7)} ${String(items.length).padStart(6)} documents, ${String(existants.size).padStart(6)} deja numerotes, ${String(manquants.length).padStart(6)} a numeroter`);
  if (DRY || manquants.length === 0) return;
  for (let d = 0; d < manquants.length; d += 500) {
    const lot = manquants.slice(d, d + 500).map((i) => ({ ref_id: i.refId, annee: i.annee ?? 0 }));
    const { error } = await sb.rpc("document_attribuer_numeros", { p_kind: kind, p_items: lot });
    if (error) throw new Error(`document_attribuer_numeros(${kind}): ${error.message}`);
  }
}

function groupesParCreation(lignes, cle, tri) {
  // lignes -> [{ cle, ...info }] tries par ordre de creation
  const map = new Map();
  for (const l of lignes) {
    const k = cle(l);
    if (k === null || k === undefined) continue;
    const info = map.get(k);
    if (!info) map.set(k, { cle: k, premiere: l });
    else if (tri(l, info.premiere) < 0) info.premiere = l;
  }
  return [...map.values()];
}

async function main() {
  console.log(DRY ? "MODE SIMULATION (rien n'est ecrit)\n" : "Numerotation permanente : figeage des numeros actuels\n");

  // ---- PL : programme_lignes ----
  {
    const lignes = await lireTout("programme_lignes", "id, groupe_id, date_jour, created_at");
    const groupes = groupesParCreation(
      lignes,
      (l) => l.groupe_id ?? l.id,
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ).sort(
      (a, b) =>
        new Date(a.premiere.created_at).getTime() - new Date(b.premiere.created_at).getTime() || a.cle - b.cle
    );
    await numeroter(
      "PL",
      groupes.map((g) => ({ refId: g.cle, annee: Number(String(g.premiere.date_jour).slice(0, 4)) }))
    );
  }

  // ---- PD : programme_dispatcher_history ----
  {
    const lignes = await lireTout("programme_dispatcher_history", "id, groupe_id, created_at");
    const groupes = groupesParCreation(
      lignes,
      (l) => l.groupe_id,
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ).sort(
      (a, b) =>
        new Date(a.premiere.created_at).getTime() - new Date(b.premiere.created_at).getTime() || a.cle - b.cle
    );
    await numeroter("PD", groupes.map((g) => ({ refId: g.cle })));
  }

  // ---- Mouvements produit fini ----
  {
    const lignes = await lireTout(
      "lots_stock",
      "id, mouvement_groupe_id, source_import, qte_entree, qte_sortie",
      (q) => q.in("source_import", ["web:entree", "web:entree-production", "web:sortie", "web:sortie-commande"])
    );
    const defs = [
      ["TE", ["web:entree"], "qte_entree"],
      ["EP", ["web:entree-production"], "qte_entree"],
      ["TS", ["web:sortie", "web:sortie-commande"], "qte_sortie"],
    ];
    for (const [kind, sources, colonneQte] of defs) {
      const filtrees = lignes.filter((l) => sources.includes(l.source_import) && Number(l[colonneQte] ?? 0) > 0);
      const minIdParGroupe = new Map();
      for (const l of filtrees) {
        const k = l.mouvement_groupe_id ?? l.id;
        minIdParGroupe.set(k, Math.min(minIdParGroupe.get(k) ?? Infinity, l.id));
      }
      const groupes = [...minIdParGroupe.entries()].sort((x, y) => x[1] - y[1]);
      await numeroter(kind, groupes.map(([cle]) => ({ refId: cle })));
    }
  }

  // ---- Mouvements matiere premiere ----
  {
    const lignes = await lireTout(
      "lots_stock_matiere_premiere",
      "id, mouvement_groupe_id, source_import, qte_entree, qte_sortie",
      (q) =>
        q.in("source_import", [
          "web:entree-mp",
          "web:reception-mp",
          "web:sortie-mp",
          "web:sortie-mp-admin",
          "web:programme-plastique",
        ])
    );
    const defs = [
      ["MP_TE", ["web:entree-mp", "web:reception-mp", "web:programme-plastique"], "qte_entree"],
      ["MP_TS", ["web:sortie-mp"], "qte_sortie"],
      ["MP_TSA", ["web:sortie-mp-admin"], "qte_sortie"],
    ];
    for (const [kind, sources, colonneQte] of defs) {
      const filtrees = lignes.filter((l) => sources.includes(l.source_import) && Number(l[colonneQte] ?? 0) > 0);
      const minIdParGroupe = new Map();
      for (const l of filtrees) {
        const k = l.mouvement_groupe_id ?? l.id;
        minIdParGroupe.set(k, Math.min(minIdParGroupe.get(k) ?? Infinity, l.id));
      }
      const groupes = [...minIdParGroupe.entries()].sort((a, b) => a[1] - b[1]);
      await numeroter(kind, groupes.map(([cle]) => ({ refId: cle })));
    }
  }

  // ---- CLAB ----
  {
    const lots = await lireTout("qualite_lab_code_batches", "id, created_at");
    lots.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.id - b.id);
    await numeroter("CLAB", lots.map((l) => ({ refId: l.id })));
  }

  // ---- Compteurs TO / TI / MB / IM (numeros deja stockes sur les documents) ----
  console.log("\nCompteurs (plus grand numero existant) :");
  const compteurs = []; // { kind, annee, max }

  const parAnnee = (lignes, getNumero) => {
    const max = new Map();
    for (const l of lignes) {
      const n = getNumero(l);
      const annee = Number(String(l.date_jour ?? "").slice(0, 4)) || 0;
      if (!n) continue;
      max.set(annee, Math.max(max.get(annee) ?? 0, n));
    }
    return max;
  };

  for (const [kind, table] of [["TO", "transfer_orders"], ["TI", "invoice_orders"]]) {
    const lignes = await lireTout(table, "id, date_jour, numero");
    for (const [annee, max] of parAnnee(lignes, (l) => Number(l.numero ?? 0))) compteurs.push({ kind, annee, max });
  }
  {
    const programmes = await lireTout("programmes", "id, numero_programme");
    const max = Math.max(0, ...programmes.map((p) => Number(p.numero_programme ?? 0)));
    compteurs.push({ kind: "MB", annee: 0, max });
  }
  {
    const imports = await lireTout("bons_commande_mp_imports", "id, numero_import");
    const maxParAnnee = new Map();
    for (const i of imports) {
      const m = /^IM\.(\d{4})\.(\d+)$/.exec(String(i.numero_import ?? ""));
      if (!m) continue;
      maxParAnnee.set(Number(m[1]), Math.max(maxParAnnee.get(Number(m[1])) ?? 0, Number(m[2])));
    }
    for (const [annee, max] of maxParAnnee) compteurs.push({ kind: "IM", annee, max });
  }

  for (const c of compteurs) {
    const { data: existant } = await sb
      .from("document_compteurs")
      .select("dernier_numero")
      .eq("kind", c.kind)
      .eq("annee", c.annee)
      .maybeSingle();
    const valeur = Math.max(Number(existant?.dernier_numero ?? 0), c.max);
    console.log(`  ${c.kind.padEnd(3)} annee ${String(c.annee).padEnd(4)} : plus grand numero ${c.max} -> compteur ${valeur}`);
    if (!DRY) {
      const { error } = await sb
        .from("document_compteurs")
        .upsert({ kind: c.kind, annee: c.annee, dernier_numero: valeur }, { onConflict: "kind,annee" });
      if (error) throw new Error(`compteur ${c.kind}: ${error.message}`);
    }
  }

  console.log(DRY ? "\nSimulation terminee." : "\nTermine : les numeros actuels sont maintenant figes.");
}

main()
  .catch((e) => {
    console.error("ERREUR :", e.message || e);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 300));
