-- deleteProgrammeDispatcherHistoryGroupAction retrouve les lignes
-- programme_lignes a marquer "termine" en matchant les codes du PD
-- supprime contre numero_lot - mais une ligne dont l'article n'a pas de
-- code_manu/code_auto configure n'a JAMAIS de code (numero_lot reste NULL),
-- donc ne peut jamais etre retrouvee par ce matching et resterait
-- indefiniment visible sur le Dashboard meme apres suppression de son PD.
-- Cette colonne garde le groupe_id du programme SOURCE (programme_lignes)
-- au moment du Save Ravitailleur, pour pouvoir aussi marquer "termine" par
-- groupe entier (en plus du matching par code), qui couvre ce cas.
alter table public.programme_dispatcher_history
  add column if not exists source_groupe_id bigint;
