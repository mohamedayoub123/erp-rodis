-- Inventaire PF : meme fonctionnement que Inventaire MP -
-- plusieurs sessions en parallele, chacune limitable a des
-- categories (type_article) et/ou des gammes au demarrage.
alter table public.inventaire_pf_sessions
  add column if not exists categories_filtre text[],
  add column if not exists gammes_filtre text[];
