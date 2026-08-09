-- Choix Manuel/Auto par ligne de Programme (meme principe que "plateforme"
-- sur Programme par ligne) : determine quel code d'article est utilise
-- (code_manu ou code_auto) et quelle limite de capacite de lot s'applique
-- au Dispatch (vrac_max_manuel ou max_vrac_auto).
alter table public.programmes
  add column if not exists plateforme text not null default 'M';
