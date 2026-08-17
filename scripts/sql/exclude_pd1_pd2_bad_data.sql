-- Masque PD1 et PD2 (les 2 tout premiers lots dispatches, saisis avec des
-- erreurs humaines) des rapports Production et de Suivi Production, SANS
-- rien supprimer : le stock (lots_stock) et les commandes/fifo_resultats
-- deja livrees qui citent certains de ces codes (34 lignes, ~10 commandes
-- reelles) restent intacts et tracables - seule la partie
-- "suivi/rapport de production" est cachee.
--
-- A executer dans Supabase Dashboard > SQL Editor.
alter table public.programme_lignes add column if not exists exclu_rapports boolean not null default false;

update public.programme_lignes
set exclu_rapports = true
where id in (
  7089, 7090, 7091, 7092, 7093, 7094, 7095, 7096, 7097, 7098, 7099, 7100, 7101, 7102, 7103, 7104,
  7105, 7106, 7107, 7108, 7109, 7110, 7111, 7112, 7113, 7114, 7115, 7320, 7321, 7322, 7324, 7325,
  7326, 7327, 7328, 7329, 7330, 7331, 7332, 7333, 7334, 7339, 7445, 7446, 7447, 7461, 7462, 7463,
  7466, 7467, 7468, 7469, 7480, 7481, 7487, 7541, 7542, 7543, 7544, 7545, 7546, 7547, 7548, 7549,
  7550, 7551, 7552, 7553, 7554, 7555, 7615, 7635
);
