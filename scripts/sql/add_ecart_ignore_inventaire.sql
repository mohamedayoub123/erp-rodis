-- Inventaire MP/PF : un ecart confirme peut maintenant etre explicitement
-- "laisse tel quel" par le responsable (statut "ecart_ignore"), en plus de
-- "regularise" - demande explicite : si l'inventaire se termine (fermeture
-- automatique des qu'il n'y a plus de lot a distribuer) sans que personne
-- n'ait agi sur un ecart confirme, il doit rester actionnable indefiniment
-- (regulariser OU laisser tel quel), jamais perdu/annule tout seul. Les 2
-- nouvelles colonnes suivent le meme principe que regularise_par/
-- regularise_at, pour ne jamais confondre "j'ai corrige le stock" et "j'ai
-- decide de laisser le stock comme il est".

alter table public.inventaire_mp_lignes drop constraint if exists inventaire_mp_lignes_statut_check;
alter table public.inventaire_mp_lignes add constraint inventaire_mp_lignes_statut_check
  check (statut in ('a_compter', 'bon', 'ecart_confirme', 'regularise', 'ecart_ignore'));
alter table public.inventaire_mp_lignes add column if not exists ignore_par text;
alter table public.inventaire_mp_lignes add column if not exists ignore_at timestamptz;

alter table public.inventaire_pf_lignes drop constraint if exists inventaire_pf_lignes_statut_check;
alter table public.inventaire_pf_lignes add constraint inventaire_pf_lignes_statut_check
  check (statut in ('a_compter', 'bon', 'ecart_confirme', 'regularise', 'ecart_ignore'));
alter table public.inventaire_pf_lignes add column if not exists ignore_par text;
alter table public.inventaire_pf_lignes add column if not exists ignore_at timestamptz;
