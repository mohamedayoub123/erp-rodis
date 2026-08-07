-- Un programme enregistre depuis "Programme par ligne" doit d'abord etre
-- visible/ajustable sur "Ravitailleur par ligne" AVANT d'apparaitre sur le
-- Dashboard Production et le Calendrier - seul le bouton "Save" sur
-- Ravitailleur (par zone ou "Toutes les zones", qui genere le code PD dans
-- Historique Programme Dispatcher) confirme officiellement le programme
-- pour le suivi de production.
--
-- Defaut a TRUE (pas FALSE) : toutes les lignes DEJA en base (creees avant
-- cette colonne, potentiellement deja suivies en production - rapports
-- Fabrication/Conditionnement/Emballage en cours) doivent rester visibles
-- exactement comme avant, sans regression. C'est le code applicatif
-- (performProgrammeLigneSave) qui met explicitement FALSE sur les
-- NOUVELLES lignes desormais - le nouveau flux en 2 etapes ne s'applique
-- donc qu'aux programmes crees a partir de maintenant.
alter table public.programme_lignes
  add column if not exists confirme_production boolean not null default true;
