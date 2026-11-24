-- Machines identiques (ex : platforme 2, platforme 3, platforme 4) : toutes les machines qui ont le
-- meme groupe_identique_id sont identiques. Sur la page d'une machine (Equipements > machine), on
-- coche les machines identiques ; ensuite les produits (capacite, min/max, temps) ajoutes ou retires
-- sur l'une arrivent automatiquement sur les autres. Le numero de groupe est le plus petit id des
-- machines du groupe ; une machine sans groupe (NULL) n'a pas de machine identique.
-- Tant que ce script n'est pas execute, la section "Machines identiques" n'apparait pas et les
-- Equipements marchent exactement comme avant.
alter table public.machines
  add column if not exists groupe_identique_id bigint;

create index if not exists machines_groupe_identique_idx
  on public.machines (groupe_identique_id);
