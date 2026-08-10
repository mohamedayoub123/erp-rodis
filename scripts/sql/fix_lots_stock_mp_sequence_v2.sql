-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET DEV/V2
-- (le meme onglet que ta derniere capture, ffejeentvwkoslzmnsbk - c'etait
-- deja le bon projet).
--
-- La version precedente (fix_lots_stock_mp_sequence_minimal.sql) renvoyait
-- NULL : pg_get_serial_sequence() ne trouve pas la sequence de cette
-- colonne car elle n'est pas "owned by" la colonne (residu d'un ancien
-- import). Ce script trouve le vrai nom de la sequence via le DEFAULT reel
-- de la colonne, la remet au bon niveau, PUIS repare le lien "owned by"
-- pour que ce probleme ne se reproduise plus jamais sur cette table.
do $do$
declare
  seq_name text;
  max_id bigint;
begin
  select regexp_replace(column_default, '^nextval\(''([^'']+)''.*$', '\1')
    into seq_name
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'lots_stock_matiere_premiere'
    and column_name = 'id';

  if seq_name is null then
    raise exception 'Aucune sequence trouvee sur lots_stock_matiere_premiere.id (column_default inattendu)';
  end if;

  select max(id) into max_id from public.lots_stock_matiere_premiere;

  execute format('select setval(%L, %s)', seq_name, greatest(max_id, 1));
  execute format('alter sequence %s owned by public.lots_stock_matiere_premiere.id', seq_name);
end $do$;

-- Verification finale - la colonne "sequence_trouvee" doit maintenant
-- afficher un nom (plus jamais NULL), et "valeur_actuelle" doit etre un
-- grand nombre proche de "max_id_reel" (les deux colonnes de droite).
select
  pg_get_serial_sequence('public.lots_stock_matiere_premiere', 'id') as sequence_trouvee,
  (select last_value from pg_sequences where sequencename ilike '%lots_stock_matiere_premiere%') as valeur_actuelle,
  (select max(id) from public.lots_stock_matiere_premiere) as max_id_reel;
