-- Complement au 1er script (normalize_ancien_lot_numero_lot.sql) - recherche
-- exhaustive (pagination complete, pas un echantillon limite comme la 1ere
-- fois) qui a trouve d'autres variantes non capturees : "ancein lot"
-- (lettres inversees), "ancien  lot" (double espace), "ancien lo" (tronque).
-- Meme regle : toutes les tables mises a jour ENSEMBLE dans une seule
-- transaction. inventaire_mp_lignes toujours exclue (inventaire en cours).
begin;

update lots_stock_matiere_premiere
set numero_lot = 'ancien-lot'
where numero_lot in ('ancien lot', 'ancein lot', 'ancien  lot', 'ancien lo', 'ancien_lot');

update transfer_order_ligne_lots
set numero_lot = 'ancien-lot'
where numero_lot in ('ancien lot', 'ancein lot', 'ancien  lot', 'ancien lo', 'ancien_lot');

update production_mp_reserve
set numero_lot = 'ancien-lot'
where numero_lot in ('ancien lot', 'ancein lot', 'ancien  lot', 'ancien lo', 'ancien_lot');

update invoice_order_lignes
set numero_lot = 'ancien-lot'
where numero_lot in ('ancien lot', 'ancein lot', 'ancien  lot', 'ancien lo', 'ancien_lot');

update ecriture_cout_lots
set numero_lot = 'ancien-lot'
where numero_lot in ('ancien lot', 'ancein lot', 'ancien  lot', 'ancien lo', 'ancien_lot');

commit;
