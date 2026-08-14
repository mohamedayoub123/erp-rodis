-- Rattrapage : le statut "Receptionne Rodis" n'est devenu automatique que
-- le 2026-08-14 - tous les dossiers deja receptionnes physiquement AVANT
-- cette date (au moins 1 evenement d'import avec lot_stock_id renseigne)
-- passent maintenant au statut final, meme s'ils etaient restes a
-- "Fabrication"/"Depart" ou sans ligne de suivi du tout. Ne touche jamais
-- date_prevue_reception.
do $$
declare
  dossier record;
begin
  for dossier in
    select distinct n_doss_4d_import as n_doss_4d, n_doss_erp_import as n_doss_erp
    from public.bons_commande_mp_imports
    where lot_stock_id is not null
  loop
    if exists (
      select 1 from public.dossiers_import_mp_statut d
      where (d.n_doss_4d is not distinct from dossier.n_doss_4d)
        and (d.n_doss_erp is not distinct from dossier.n_doss_erp)
    ) then
      update public.dossiers_import_mp_statut
      set statut = 'Receptionne Rodis', updated_at = now()
      where (n_doss_4d is not distinct from dossier.n_doss_4d)
        and (n_doss_erp is not distinct from dossier.n_doss_erp);
    else
      insert into public.dossiers_import_mp_statut (n_doss_4d, n_doss_erp, statut)
      values (dossier.n_doss_4d, dossier.n_doss_erp, 'Receptionne Rodis');
    end if;
  end loop;
end $$;
