-- Renomme le statut de dossier "Import" en "Depart" (2eme etape du suivi,
-- entre "Fabrication" et "Receptionne au port") pour les dossiers deja
-- enregistres avec l'ancien libelle.
update public.dossiers_import_mp_statut
set statut = 'Depart'
where statut = 'Import';
