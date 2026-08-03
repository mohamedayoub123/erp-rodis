-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Necessaire pour retrouver les parametres production de l'article
-- (piece_par_carton, dispenseur_pcs_carton, besoin_*) et calculer
-- Flacon/Pot, Capsule/Pompe, Sleeve, Carton, Etiquete, Nb Etui, Dispenseur
-- sur les pages "Programme Dispatcher <ZONE>".
alter table public.programme_dispatcher_lignes
  add column if not exists article_id bigint references public.articles(id);
