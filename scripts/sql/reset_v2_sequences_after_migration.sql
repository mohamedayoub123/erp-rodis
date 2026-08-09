-- V2 uniquement. Derniere etape apres la copie complete des donnees V1 ->
-- V2 : les lignes copiees ont garde leurs id d'origine, mais les sequences
-- (compteurs auto-incrementes) de V2 n'ont pas bouge - la prochaine
-- creation depuis l'app (nouvel article, nouveau programme...) prendrait
-- un id deja utilise. Remet chaque sequence au max(id) reel de sa table.
do $$
declare
  t text;
  seq text;
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
    'stock_alertes_matiere_premiere', 'import_logs', 'famille_besoins'
  ]
  loop
    seq := pg_get_serial_sequence(t, 'id');
    if seq is not null then
      execute format('select coalesce(max(id), 0) from public.%I', t) into max_id;
      perform setval(seq, greatest(max_id, 1), max_id > 0);
    end if;
  end loop;
end $$;
