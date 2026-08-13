-- Declarations orphelines de BC17, dupliquees par des receptions
-- fractionnees (livraison en plusieurs fois) - meme quantite totale que
-- les receptions reelles deja liees a un lot de stock (lot_stock_id NOT
-- NULL), donc double comptage confirme. 6 articles, 5 442 000 unites.
delete from public.bons_commande_mp_imports
where id in (572, 579, 581, 593, 596, 598)
  and lot_stock_id is null;
