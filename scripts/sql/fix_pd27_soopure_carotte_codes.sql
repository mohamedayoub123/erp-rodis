-- PD27 (source_groupe_id 7876), article "Gel douche soopure carotte 300ml" :
-- les codes ont ete corriges cote Programme par ligne (NDGB0097/98/99 ->
-- NDGB0444/45/46, confirmes comme les "codes vrais" par l'equipe) AVANT le
-- correctif qui synchronise automatiquement l'historique PD - ces 3 lignes
-- de programme_dispatcher_history sont donc restees figees avec les
-- anciens codes. Remise a jour ponctuelle pour que PD27 corresponde a la
-- realite ; les futures corrections se feront seules desormais.

update programme_dispatcher_history
set code = 'NDGB0444'
where source_groupe_id = 7876 and code = 'NDGB0097';

update programme_dispatcher_history
set code = 'NDGB0445'
where source_groupe_id = 7876 and code = 'NDGB0098';

update programme_dispatcher_history
set code = 'NDGB0446'
where source_groupe_id = 7876 and code = 'NDGB0099';
