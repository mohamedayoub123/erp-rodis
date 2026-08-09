-- A coller dans Supabase Dashboard > SQL Editor > New query.
--
-- Permet de supprimer un Transfer Invoice deja Approuve (le stock a deja
-- bouge) en annulant proprement son mouvement : on garde une reference vers
-- les 2 lignes de stock exactes (sortie depot source / entree depot
-- destination) creees a la validation, pour pouvoir les effacer directement
-- si on supprime ce Transfer Invoice (meme principe deja utilise pour
-- l'Import MP avec bons_commande_mp_imports.lot_stock_id).
alter table public.invoice_order_lignes
  add column if not exists sortie_lot_id bigint,
  add column if not exists entree_lot_id bigint;
