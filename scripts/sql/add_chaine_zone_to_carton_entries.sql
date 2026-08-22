-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Fige la chaine/zone de CHAQUE fournee Conditionnement au moment de sa
-- saisie, au lieu de partager programme_lignes.chaine/zone (un seul champ
-- pour toute la ligne) - bug reel : le selecteur Zone/Chaine de la page
-- Conditionnement modifie ce champ partage immediatement (independamment du
-- Save du rapport), donc changer de chaine pour une NOUVELLE fournee
-- repeignait retroactivement la chaine affichee de TOUTES les fournees deja
-- saisies pour cette ligne (cas reel : 3 fournees sur chaine 7 puis 2 puis
-- 3, les 3 affichaient "chaine 3" a la fin, seule qt_carton restait juste).
alter table public.production_carton_entries
  add column if not exists chaine text,
  add column if not exists zone text;
