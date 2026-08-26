-- PD29 : 3 batches (AA4270V, AA4272V, AA4274V - Lait WHITE SECRET 500ml)
-- disparus du Dashboard.
--
-- Cause reelle : le 25/08/2026 a 13:23, suppression d'un PD contenant le
-- code "AA4270V" (une AUTRE ligne, Lait WHITE SECRET 200ml, programme_lignes
-- id 7901). Le meme texte de code existait par coincidence aussi dans
-- programme_lignes.id 7904 (numero_lot = "AA4270V, AA4272V, AA4274V"), et
-- l'action de suppression matchait par simple texte de code, sans verifier
-- que le code appartenait bien a la bonne ligne/groupe. Les 2 lignes ont
-- donc ete marquees "programme_termine = true" alors que seule la ligne
-- 7901 devait l'etre.
--
-- La ligne 7904 (article 401, groupe_id 7904) a donc disparu du Dashboard
-- (qui ignore toute ligne programme_termine = true) alors que sa
-- fabrication/conditionnement/emballage ne sont pas faits.
--
-- Le bug source (matching par texte de code non scope) est corrige dans le
-- code (app/ravitailleur-par-ligne/dispatcher-actions.ts). Ce script
-- corrige uniquement la donnee deja corrompue.

update programme_lignes
set programme_termine = false,
    programme_termine_date = null
where id = 7904
  and numero_lot = 'AA4270V, AA4272V, AA4274V';
