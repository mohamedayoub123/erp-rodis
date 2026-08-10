-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET DEV/V2
-- (URL contenant ffejeentvwkoslzmnsbk).
--
-- Cause du crash "Enregistrer" sur Fabrication/Conditionnement/Emballage :
-- ces 4 tables ont leur colonne "id" SANS aucune valeur par defaut du tout
-- (pas juste une sequence en retard comme lots_stock_matiere_premiere -
-- carrement aucun nextval() attache a la colonne). Un residu de la
-- migration V1->V2 jamais remarque avant, car ces tables etaient toujours
-- mises a jour via upsert sur des lignes deja migrees (jamais une vraie
-- insertion neuve) - jusqu'au vidage recent qui a fait de chaque saisie une
-- premiere insertion, revelant le probleme.
--
-- Cree une sequence propre pour chaque table (recupere l'existante si elle
-- existe deja, sinon en cree une), l'attache comme DEFAULT de la colonne
-- id, la relie officiellement a la colonne (owned by, pour que les futurs
-- scripts de reset la trouvent), et la cale sur le vrai MAX(id) actuel.
-- Sans danger a relancer plusieurs fois.
do $do$
declare
  t text;
  seq_name text;
  max_id bigint;
begin
  foreach t in array array[
    'production_rapports',
    'production_carton_entries',
    'production_vrac_entries',
    'production_emballage_entries'
  ]
  loop
    seq_name := pg_get_serial_sequence('public.' || t, 'id');

    if seq_name is null then
      if not exists (select 1 from pg_class where relkind = 'S' and relname = t || '_id_seq') then
        execute format('create sequence public.%I', t || '_id_seq');
      end if;
      seq_name := 'public.' || quote_ident(t || '_id_seq');
    end if;

    execute format('alter table public.%I alter column id set default nextval(%L)', t, seq_name);
    execute format('alter sequence %s owned by public.%I.id', seq_name, t);

    execute format('select coalesce(max(id), 0) from public.%I', t) into max_id;
    execute format('select setval(%L, %s)', seq_name, greatest(max_id, 1));
  end loop;
end $do$;

-- Verification - chaque ligne doit maintenant avoir un nom de sequence
-- (plus jamais NULL).
select
  t as table_name,
  pg_get_serial_sequence('public.' || t, 'id') as sequence_trouvee
from unnest(array[
  'production_rapports',
  'production_carton_entries',
  'production_vrac_entries',
  'production_emballage_entries'
]) as t;
