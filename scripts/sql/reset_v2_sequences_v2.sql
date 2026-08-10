-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET DEV/V2.
--
-- Version corrigee de reset_v2_sequences_after_migration.sql : l'ancienne
-- version utilisait pg_get_serial_sequence() pour trouver la sequence de
-- chaque table, qui renvoie NULL (et donc saute silencieusement la table,
-- sans erreur) quand la sequence n'est pas "owned by" la colonne - c'est
-- exactement ce qui bloquait lots_stock_matiere_premiere depuis le debut,
-- et ca peut affecter d'autres tables de la meme liste sans qu'on l'ait vu
-- (ex: lots_stock, jamais verifie separement). Ce script trouve le vrai nom
-- de chaque sequence via le DEFAULT reel de la colonne (marche meme sans
-- "owned by"), remet chaque compteur au bon niveau, PUIS repare le lien
-- "owned by" partout pour que ca ne se reproduise plus. Sans danger a
-- relancer plusieurs fois.
do $do$
declare
  t text;
  seq_name text;
  max_id bigint;
begin
  foreach t in array array[
    'familles', 'clients', 'machines', 'articles', 'articles_matiere_premiere',
    'dossiers_import_mp_statut', 'stock_users', 'commandes',
    'bons_commande_matiere_premiere', 'commandes_matiere_premiere',
    'machine_produits', 'lots_stock', 'lots_stock_matiere_premiere',
    'recettes_pf', 'programmes', 'programme_lignes', 'commande_lignes',
    'bons_commande_mp_imports', 'fifo_resultats', 'pending_article_code_updates',
    'programme_dispatcher_lignes', 'programme_dispatcher_history',
    'production_code_termine', 'production_carton_entries',
    'production_vrac_entries', 'production_emballage_entries',
    'production_rapports', 'suivi_tirage', 'ravitailleur_lignes',
    'stock_alertes_matiere_premiere', 'import_logs', 'famille_besoins',
    'transfer_orders', 'transfer_order_lignes', 'transfer_order_ligne_lots',
    'invoice_orders', 'invoice_order_lignes', 'production_mp_reserve'
  ]
  loop
    select regexp_replace(column_default, '^nextval\(''([^'']+)''.*$', '\1')
      into seq_name
    from information_schema.columns
    where table_schema = 'public' and table_name = t and column_name = 'id';

    if seq_name is not null then
      execute format('select coalesce(max(id), 0) from public.%I', t) into max_id;
      execute format('select setval(%L, %s)', seq_name, greatest(max_id, 1));
      execute format('alter sequence %s owned by public.%I.id', seq_name, t);
    end if;
  end loop;
end $do$;

-- Verification - toutes les valeurs "ecart" doivent etre proches de 0 (la
-- sequence est juste au niveau du max id reel, pas en dessous).
select
  c.relname as table_name,
  s.seqrelid::regclass::text as sequence_name,
  pg_sequence_last_value(s.seqrelid::regclass) as valeur_sequence
from pg_class c
join pg_depend d on d.refobjid = c.oid and d.deptype = 'a'
join pg_class s on s.oid = d.objid and s.relkind = 'S'
where c.relnamespace = 'public'::regnamespace
order by c.relname;
