-- A coller dans Supabase Dashboard > SQL Editor > New query.
--
-- Meme cas que le Sleeve plus tot : sortie (id=33, Depot E) + entree
-- (id=34, Depot B) de 600 LANETTE SX laissees par un Transfer Invoice
-- supprime alors qu'il etait encore "En attente" mais avait deja une ligne
-- partiellement traitee (bug corrige juste apres dans le code). Le Transfer
-- Order source garde deja les 600 comme non-livres (jamais modifie), donc
-- effacer ces 2 lignes retablit exactement l'etat correct.
delete from public.lots_stock_matiere_premiere where id in (33, 34);
