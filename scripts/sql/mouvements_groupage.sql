-- Regroupement des mouvements (TE/TS) par lot d'approbation.
-- A executer dans Supabase Dashboard > SQL Editor > New query, AVANT
-- scripts/sql/stock_locking_indexes.sql et stock_locking_functions.sql
-- (ou apres, l'ordre entre ce fichier et les deux autres n'a pas d'importance).
--
-- Chaque ligne lots_stock recoit un mouvement_groupe_id : toutes les lignes
-- creees dans le meme clic "Approuver entree" / "Approuver sortie" / la meme
-- livraison de commande partagent le meme groupe_id (= le plus petit id du
-- lot cree ensemble). Les lignes deja existantes (import Excel, anciennes
-- saisies) recoivent leur propre id comme groupe_id (groupe d'une seule ligne).

alter table public.lots_stock add column if not exists mouvement_groupe_id bigint;

update public.lots_stock
set mouvement_groupe_id = id
where mouvement_groupe_id is null;

create index if not exists idx_lots_stock_mouvement_groupe
  on public.lots_stock (mouvement_groupe_id);
