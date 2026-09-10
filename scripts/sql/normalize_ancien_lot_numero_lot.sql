-- Normalise "ancien_lot" / "ancien lot" en "ancien-lot" (demande explicite) -
-- numero_lot est utilise comme cle de correspondance EXACTE entre plusieurs
-- tables (reservations, transferts, factures, ecritures comptables,
-- inventaire), pas seulement dans le stock lui-meme - verifie avant envoi :
-- 43162+6174 lignes dans lots_stock_matiere_premiere, plus des milliers
-- d'autres dans les tables liees ci-dessous, toutes avec exactement les
-- memes 2 variantes. Toutes les tables sont mises a jour ENSEMBLE dans une
-- seule transaction pour ne jamais laisser une table avec la nouvelle
-- orthographe et une autre avec l'ancienne (ce qui casserait la
-- correspondance entre elles).
begin;

update lots_stock_matiere_premiere
set numero_lot = 'ancien-lot'
where numero_lot in ('ancien_lot', 'ancien lot');

update transfer_order_ligne_lots
set numero_lot = 'ancien-lot'
where numero_lot in ('ancien_lot', 'ancien lot');

update production_mp_reserve
set numero_lot = 'ancien-lot'
where numero_lot in ('ancien_lot', 'ancien lot');

update invoice_order_lignes
set numero_lot = 'ancien-lot'
where numero_lot in ('ancien_lot', 'ancien lot');

update ecriture_cout_lots
set numero_lot = 'ancien-lot'
where numero_lot in ('ancien_lot', 'ancien lot');

update inventaire_mp_lignes
set numero_lot = 'ancien-lot'
where numero_lot in ('ancien_lot', 'ancien lot');

commit;
