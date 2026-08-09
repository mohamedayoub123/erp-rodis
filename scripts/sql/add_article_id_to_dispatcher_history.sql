-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Necessaire pour retrouver les parametres production de l'article
-- (piece_par_carton, dispenseur_pcs_carton, besoin_*) et calculer
-- Flacon/Pot, Capsule/Pompe, Sleeve, Carton, Etiquete, Nb Etui, Dispenseur
-- sur la page detail "Historique Programme Dispatcher" - meme colonne que
-- programme_dispatcher_lignes (voir add_article_id_to_dispatcher_lignes.sql),
-- deja lue/ecrite par le code (saveProgrammeDispatcherSnapshotAction etc.)
-- mais jamais ajoutee sur la table historique elle-meme.
alter table public.programme_dispatcher_history
  add column if not exists article_id bigint references public.articles(id);
