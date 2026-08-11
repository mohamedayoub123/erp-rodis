-- Genere automatiquement - cree un vrac partage pour chaque famille de produits
-- qui existe en plusieurs tailles (ex: Lait WHITE SECRET 200/300/500ml -> 1 seul
-- "vrac lait white secret"). Les familles a taille UNIQUE ne sont PAS touchees
-- (choix confirme). Article deja normalise (Clarifiant/Exfoliant/N/S-H restent
-- des familles separees, jamais fusionnees).

begin;

-- 135 nouveaux articles vrac
insert into public.articles
  (nom_article, article_normalise, type_article, marque, gamme, min_stock, max_stock, actif, nature, quantite_recette_base)
values
  ('vrac brume parfumee oriental scent oriental oud', 'VRAC BRUME PARFUMEE ORIENTAL SCENT ORIENTAL OUD', 'parfume', 'RODIS', 'ORIENTAL SCENT ', 0, 0, true, 'vrac', 100),
  ('vrac edc real care baby', 'VRAC EDC REAL CARE BABY', 'parfume', 'RODIS', 'REAL CARE BABY', 0, 0, true, 'vrac', 100),
  ('vrac talc my family care aloe vera', 'VRAC TALC MY FAMILY CARE ALOE VERA', 'talc', 'RODIS', 'MY FAMILY CARE ALOE VERA', 0, 0, true, 'vrac', 100),
  ('vrac gel douche absolute care water lilies', 'VRAC GEL DOUCHE ABSOLUTE CARE WATER LILIES', 'gel douche', 'RODIS', 'ABSOLUTE CARE WATER LILIES ', 0, 0, true, 'vrac', 100),
  ('vrac savon white secret', 'VRAC SAVON WHITE SECRET', 'savon', 'RODIS', 'WHITE SECRET', 0, 0, true, 'vrac', 100),
  ('vrac talc my family care pomegranate', 'VRAC TALC MY FAMILY CARE POMEGRANATE', 'talc', 'RODIS', 'MY FAMILY CARE POMEGRANATE', 0, 0, true, 'vrac', 100),
  ('vrac creme mamassita hydratant', 'VRAC CREME MAMASSITA HYDRATANT', 'hydratant', 'RODIS', 'MAMASSITA', 0, 0, true, 'vrac', 100),
  ('vrac creme mamassita nourrissant', 'VRAC CREME MAMASSITA NOURRISSANT', 'hydratant', 'RODIS', 'MAMASSITA', 0, 0, true, 'vrac', 100),
  ('vrac creme matrix', 'VRAC CREME MATRIX', 'menthole', 'RODIS', 'MATRIX ', 0, 0, true, 'vrac', 100),
  ('vrac creme morocco skin', 'VRAC CREME MOROCCO SKIN', 'clarifiant', 'RODIS', 'MOROCCO SKIN', 0, 0, true, 'vrac', 100),
  ('vrac gel douche exf tone therapy advanced', 'VRAC GEL DOUCHE EXF TONE THERAPY ADVANCED', 'gel douche', 'RODIS', 'TONE THERAPY ADVANCED', 0, 0, true, 'vrac', 100),
  ('vrac creme elixir', 'VRAC CREME ELIXIR', 'clarifiant', 'RODIS', 'ELIXIR', 0, 0, true, 'vrac', 100),
  ('vrac creme luxury cocoa', 'VRAC CREME LUXURY COCOA', 'hydratant', 'RODIS', 'LUXURY COCOA', 0, 0, true, 'vrac', 100),
  ('vrac brume parfumee oriental scent royal jasmine', 'VRAC BRUME PARFUMEE ORIENTAL SCENT ROYAL JASMINE', 'parfume', 'RODIS', 'ORIENTAL SCENT ', 0, 0, true, 'vrac', 100),
  ('vrac creme egyptian beauty', 'VRAC CREME EGYPTIAN BEAUTY', 'clarifiant', 'RODIS', 'EGYPTIAN BEAUTY', 0, 0, true, 'vrac', 100),
  ('vrac creme luxury avocado', 'VRAC CREME LUXURY AVOCADO', 'hydratant', 'RODIS', ' LUXURY AVOCADO', 0, 0, true, 'vrac', 100),
  ('vrac lait luxury cocoa', 'VRAC LAIT LUXURY COCOA', 'hydratant', 'RODIS', 'LUXURY COCOA', 0, 0, true, 'vrac', 100),
  ('vrac creme my family care almond', 'VRAC CREME MY FAMILY CARE ALMOND', 'hydratant', 'RODIS', 'MY FAMILY CARE ALMOND', 0, 0, true, 'vrac', 100),
  ('vrac lait coco clear', 'VRAC LAIT COCO CLEAR', 'clarifiant', 'RODIS', 'COCO CLEAR', 0, 0, true, 'vrac', 100),
  ('vrac lait bbc', 'VRAC LAIT BBC', 'clarifiant', 'RODIS', 'bb clear', 0, 0, true, 'vrac', 100),
  ('vrac gel douche absolute care fresh lime', 'VRAC GEL DOUCHE ABSOLUTE CARE FRESH LIME', 'gel douche', 'RODIS', 'ABSOLUTE CARE  FRESH LIME ', 0, 0, true, 'vrac', 100),
  ('vrac gel douche absolute care aloe vera', 'VRAC GEL DOUCHE ABSOLUTE CARE ALOE VERA', 'gel douche', 'RODIS', 'ABSOLUTE CARE ALOE VERA ', 0, 0, true, 'vrac', 100),
  ('vrac gel douche elixir clarifiant', 'VRAC GEL DOUCHE ELIXIR CLARIFIANT', 'gel douche', 'RODIS', 'ELIXIR', 0, 0, true, 'vrac', 100),
  ('vrac lait my family care almond', 'VRAC LAIT MY FAMILY CARE ALMOND', 'hydratant', 'RODIS', 'MY FAMILY CARE ALMOND', 0, 0, true, 'vrac', 100),
  ('vrac lait my family care aloe vera', 'VRAC LAIT MY FAMILY CARE ALOE VERA', 'hydratant', 'RODIS', 'MY FAMILY CARE ALOE VERA', 0, 0, true, 'vrac', 100),
  ('vrac lait tone therapy advanced', 'VRAC LAIT TONE THERAPY ADVANCED', 'clarifiant', 'RODIS', 'TONE THERAPY ADVANCED', 0, 0, true, 'vrac', 100),
  ('vrac talc my family care lemon', 'VRAC TALC MY FAMILY CARE LEMON', 'talc', 'RODIS', 'MY FAMILY CARE LEMON ', 0, 0, true, 'vrac', 100),
  ('vrac gel douche absolute care papaya', 'VRAC GEL DOUCHE ABSOLUTE CARE PAPAYA', 'gel douche', 'RODIS', 'ABSOLUTE CARE PAPAYA', 0, 0, true, 'vrac', 100),
  ('vrac brume parfumee oriental scent sandalwood', 'VRAC BRUME PARFUMEE ORIENTAL SCENT SANDALWOOD', 'parfume', 'RODIS', 'ORIENTAL SCENT ', 0, 0, true, 'vrac', 100),
  ('vrac gel douche real care baby', 'VRAC GEL DOUCHE REAL CARE BABY', 'gel douche', 'RODIS', 'REAL CARE BABY', 0, 0, true, 'vrac', 100),
  ('vrac gel douche real care family', 'VRAC GEL DOUCHE REAL CARE FAMILY', 'gel douche', 'RODIS', 'REAL CARE FAMILY ', 0, 0, true, 'vrac', 100),
  ('vrac gel douche real care men', 'VRAC GEL DOUCHE REAL CARE MEN', 'gel douche', 'RODIS', 'REAL CARE MEN ', 0, 0, true, 'vrac', 100),
  ('vrac gel douche soopure carotte', 'VRAC GEL DOUCHE SOOPURE CAROTTE', 'gel douche', 'RODIS', 'soopure', 0, 0, true, 'vrac', 100),
  ('vrac gel douche soopure classic', 'VRAC GEL DOUCHE SOOPURE CLASSIC', 'gel douche', 'RODIS', 'soopure', 0, 0, true, 'vrac', 100),
  ('vrac gel douche soopure kids', 'VRAC GEL DOUCHE SOOPURE KIDS', 'gel douche', 'RODIS', 'soopure', 0, 0, true, 'vrac', 100),
  ('vrac pommade mamassita blanc', 'VRAC POMMADE MAMASSITA BLANC', 'pommade', 'RODIS', 'MAMASSITA', 0, 0, true, 'vrac', 100),
  ('vrac pommade mamassita jaune', 'VRAC POMMADE MAMASSITA JAUNE', 'pommade', 'RODIS', 'MAMASSITA', 0, 0, true, 'vrac', 100),
  ('vrac lait bbc vit c', 'VRAC LAIT BBC VIT C', 'clarifiant', 'RODIS', 'bb clear v c', 0, 0, true, 'vrac', 100),
  ('vrac brume parfumee oriental scent white musk', 'VRAC BRUME PARFUMEE ORIENTAL SCENT WHITE MUSK', 'parfume', 'RODIS', 'ORIENTAL SCENT ', 0, 0, true, 'vrac', 100),
  ('vrac crème absolute care water lilies', 'VRAC CRÈME ABSOLUTE CARE WATER LILIES', 'clarifiant', 'RODIS', 'ABSOLUTE CARE WATER LILIES ', 0, 0, true, 'vrac', 100),
  ('vrac creme tone therapy advanced', 'VRAC CREME TONE THERAPY ADVANCED', 'clarifiant', 'RODIS', 'TONE THERAPY ADVANCED', 0, 0, true, 'vrac', 100),
  ('vrac gel douche soopure men', 'VRAC GEL DOUCHE SOOPURE MEN', 'gel douche', 'RODIS', 'soopure', 0, 0, true, 'vrac', 100),
  ('vrac gel douche soopure women', 'VRAC GEL DOUCHE SOOPURE WOMEN', 'gel douche', 'RODIS', 'soopure', 0, 0, true, 'vrac', 100),
  ('vrac pommade my family care almond', 'VRAC POMMADE MY FAMILY CARE ALMOND', 'pommade', 'RODIS', 'MY FAMILY CARE ALMOND', 0, 0, true, 'vrac', 100),
  ('vrac lait morocco skin', 'VRAC LAIT MOROCCO SKIN', 'clarifiant', 'RODIS', 'MOROCCO SKIN', 0, 0, true, 'vrac', 100),
  ('vrac creme real care men', 'VRAC CREME REAL CARE MEN', 'hydratant', 'RODIS', 'REAL CARE MEN ', 0, 0, true, 'vrac', 100),
  ('vrac creme my family care aloe vera', 'VRAC CREME MY FAMILY CARE ALOE VERA', 'hydratant', 'RODIS', 'MY FAMILY CARE ALOE VERA', 0, 0, true, 'vrac', 100),
  ('vrac pommade real care baby', 'VRAC POMMADE REAL CARE BABY', 'pommade', 'RODIS', 'REAL CARE BABY', 0, 0, true, 'vrac', 100),
  ('vrac pommade real care men', 'VRAC POMMADE REAL CARE MEN', 'pommade', 'RODIS', 'REAL CARE MEN ', 0, 0, true, 'vrac', 100),
  ('vrac pommade soopure lemon', 'VRAC POMMADE SOOPURE LEMON', 'pommade', 'RODIS', 'soopure', 0, 0, true, 'vrac', 100),
  ('vrac pommade my family care pomegranate', 'VRAC POMMADE MY FAMILY CARE POMEGRANATE', 'pommade', 'RODIS', 'MY FAMILY CARE POMEGRANATE', 0, 0, true, 'vrac', 100),
  ('vrac lait absolute care fresh lime', 'VRAC LAIT ABSOLUTE CARE FRESH LIME', 'clarifiant', 'RODIS', 'ABSOLUTE CARE  FRESH LIME ', 0, 0, true, 'vrac', 100),
  ('vrac lait dermatone', 'VRAC LAIT DERMATONE', 'clarifiant', 'RODIS', 'DERMATONE', 0, 0, true, 'vrac', 100),
  ('vrac creme precious perfect', 'VRAC CREME PRECIOUS PERFECT', 'clarifiant', 'RODIS', 'PRECIOUS PERFECT', 0, 0, true, 'vrac', 100),
  ('vrac lait absolute care water lilies', 'VRAC LAIT ABSOLUTE CARE WATER LILIES', 'clarifiant', 'RODIS', 'ABSOLUTE CARE WATER LILIES ', 0, 0, true, 'vrac', 100),
  ('vrac pommade one for all cocoa butter', 'VRAC POMMADE ONE FOR ALL COCOA BUTTER', 'pommade', 'RODIS', 'One For All', 0, 0, true, 'vrac', 100),
  ('vrac pommade one for all lemon', 'VRAC POMMADE ONE FOR ALL LEMON', 'pommade', 'RODIS', 'One For All', 0, 0, true, 'vrac', 100),
  ('vrac pommade rapide white', 'VRAC POMMADE RAPIDE WHITE', 'pommade', 'RODIS', 'Rapide White', 0, 0, true, 'vrac', 100),
  ('vrac pommade real care family', 'VRAC POMMADE REAL CARE FAMILY', 'pommade', 'RODIS', 'REAL CARE FAMILY ', 0, 0, true, 'vrac', 100),
  ('vrac pommade soopure', 'VRAC POMMADE SOOPURE', 'pommade', 'RODIS', 'soopure', 0, 0, true, 'vrac', 100),
  ('vrac crème absolute care fresh lime', 'VRAC CRÈME ABSOLUTE CARE FRESH LIME', 'clarifiant', 'RODIS', 'ABSOLUTE CARE  FRESH LIME ', 0, 0, true, 'vrac', 100),
  ('vrac crème absolute care aloe vera', 'VRAC CRÈME ABSOLUTE CARE ALOE VERA', 'clarifiant', 'RODIS', 'ABSOLUTE CARE ALOE VERA ', 0, 0, true, 'vrac', 100),
  ('vrac creme real care family', 'VRAC CREME REAL CARE FAMILY', 'hydratant', 'RODIS', 'REAL CARE FAMILY ', 0, 0, true, 'vrac', 100),
  ('vrac lait real care family', 'VRAC LAIT REAL CARE FAMILY', 'hydratant', 'RODIS', 'REAL CARE FAMILY ', 0, 0, true, 'vrac', 100),
  ('vrac lait real care men', 'VRAC LAIT REAL CARE MEN', 'hydratant', 'RODIS', 'REAL CARE MEN ', 0, 0, true, 'vrac', 100),
  ('vrac creme pro white', 'VRAC CREME PRO WHITE', 'clarifiant', 'RODIS', 'PRO WHITE', 0, 0, true, 'vrac', 100),
  ('vrac creme real care baby', 'VRAC CREME REAL CARE BABY', 'hydratant', 'RODIS', 'REAL CARE BABY', 0, 0, true, 'vrac', 100),
  ('vrac lait absolute care aloe vera', 'VRAC LAIT ABSOLUTE CARE ALOE VERA', 'clarifiant', 'RODIS', 'ABSOLUTE CARE ALOE VERA', 0, 0, true, 'vrac', 100),
  ('vrac crème absolute care papaya', 'VRAC CRÈME ABSOLUTE CARE PAPAYA', 'clarifiant', 'RODIS', 'ABSOLUTE CARE PAPAYA', 0, 0, true, 'vrac', 100),
  ('vrac creme bbc', 'VRAC CREME BBC', 'clarifiant', 'RODIS', 'bb clear ', 0, 0, true, 'vrac', 100),
  ('vrac creme bbc vit c', 'VRAC CREME BBC VIT C', 'clarifiant', 'RODIS', 'bb clear v c', 0, 0, true, 'vrac', 100),
  ('vrac pommade eco family', 'VRAC POMMADE ECO FAMILY', 'pommade', 'RODIS', 'ECO FAMILY', 0, 0, true, 'vrac', 100),
  ('vrac lait my family care lemon', 'VRAC LAIT MY FAMILY CARE LEMON', 'hydratant', 'RODIS', 'MY FAMILY CARE LEMON ', 0, 0, true, 'vrac', 100),
  ('vrac lait my family care pomegranate', 'VRAC LAIT MY FAMILY CARE POMEGRANATE', 'hydratant', 'RODIS', 'MY FAMILY CARE POMEGRANATE', 0, 0, true, 'vrac', 100),
  ('vrac lait precious perfect', 'VRAC LAIT PRECIOUS PERFECT', 'clarifiant', 'RODIS', 'PRECIOUS PERFECT', 0, 0, true, 'vrac', 100),
  ('vrac pommade my family care aloe vera', 'VRAC POMMADE MY FAMILY CARE ALOE VERA', 'pommade', 'RODIS', 'MY FAMILY CARE ALOE VERA', 0, 0, true, 'vrac', 100),
  ('vrac pommade my family care lemon', 'VRAC POMMADE MY FAMILY CARE LEMON', 'pommade', 'RODIS', 'MY FAMILY CARE LEMON ', 0, 0, true, 'vrac', 100),
  ('vrac gel douche my family care lemon', 'VRAC GEL DOUCHE MY FAMILY CARE LEMON', 'gel douche', 'RODIS', 'MY FAMILY CARE LEMON ', 0, 0, true, 'vrac', 100),
  ('vrac gel douche exf tone therapy intense', 'VRAC GEL DOUCHE EXF TONE THERAPY INTENSE', 'gel douche', 'RODIS', 'TONE THERAPY INTENSE', 0, 0, true, 'vrac', 100),
  ('vrac creme dermatone', 'VRAC CREME DERMATONE', 'clarifiant', 'RODIS', 'DERMATONE', 0, 0, true, 'vrac', 100),
  ('vrac gel douche my family care pomegranate', 'VRAC GEL DOUCHE MY FAMILY CARE POMEGRANATE', 'gel douche', 'RODIS', 'MY FAMILY CARE POMEGRANATE', 0, 0, true, 'vrac', 100),
  ('vrac lait pro white', 'VRAC LAIT PRO WHITE', 'clarifiant', 'RODIS', 'PRO WHITE', 0, 0, true, 'vrac', 100),
  ('vrac creme tone therapy intense', 'VRAC CREME TONE THERAPY INTENSE', 'clarifiant', 'RODIS', 'TONE THERAPY INTENSE', 0, 0, true, 'vrac', 100),
  ('vrac lait real care baby', 'VRAC LAIT REAL CARE BABY', 'hydratant', 'RODIS', 'REAL CARE BABY', 0, 0, true, 'vrac', 100),
  ('vrac lait tone therapy intense', 'VRAC LAIT TONE THERAPY INTENSE', 'clarifiant', 'RODIS', 'TONE THERAPY INTENSE', 0, 0, true, 'vrac', 100),
  ('vrac brume parfumee bouquet daisy', 'VRAC BRUME PARFUMEE BOUQUET DAISY', 'parfume', 'RODIS', 'BOUQUET', 0, 0, true, 'vrac', 100),
  ('vrac brume parfumee bouquet hibiscus', 'VRAC BRUME PARFUMEE BOUQUET HIBISCUS', 'parfume', 'RODIS', 'BOUQUET', 0, 0, true, 'vrac', 100),
  ('vrac brume parfumee bouquet lilium', 'VRAC BRUME PARFUMEE BOUQUET LILIUM', 'parfume', 'RODIS', 'BOUQUET', 0, 0, true, 'vrac', 100),
  ('vrac gel anti mosquito family citronella', 'VRAC GEL ANTI MOSQUITO FAMILY CITRONELLA', 'Anti sptique ', 'RODIS', 'FOREVER CARE', 0, 0, true, 'vrac', 100),
  ('vrac lait anti mosquito family citronella', 'VRAC LAIT ANTI MOSQUITO FAMILY CITRONELLA', 'Anti sptique ', 'RODIS', 'FOREVER CARE', 0, 0, true, 'vrac', 100),
  ('vrac brume parfumee bouquet rosa', 'VRAC BRUME PARFUMEE BOUQUET ROSA', 'parfume', 'RODIS', 'BOUQUET', 0, 0, true, 'vrac', 100),
  ('vrac spray anti mosquito baby', 'VRAC SPRAY ANTI MOSQUITO BABY', 'Anti sptique ', 'RODIS', 'FOREVER CARE', 0, 0, true, 'vrac', 100),
  ('vrac spray anti mosquito family citronella', 'VRAC SPRAY ANTI MOSQUITO FAMILY CITRONELLA', 'Anti sptique ', 'RODIS', 'FOREVER CARE', 0, 0, true, 'vrac', 100),
  ('vrac gel douche clarif tone therapy intense', 'VRAC GEL DOUCHE CLARIF TONE THERAPY INTENSE', 'gel douche', 'RODIS', 'TONE THERAPY INTENSE', 0, 0, true, 'vrac', 100),
  ('vrac gel douche efficacite plus', 'VRAC GEL DOUCHE EFFICACITE PLUS', 'gel douche', 'RODIS', 'EFFICACITE PLUS', 0, 0, true, 'vrac', 100),
  ('vrac gel douche efficacite plus exfoliant', 'VRAC GEL DOUCHE EFFICACITE PLUS EXFOLIANT', 'gel douche', 'RODIS', 'EFFICACITE PLUS', 0, 0, true, 'vrac', 100),
  ('vrac gel douche my family care aloe vera', 'VRAC GEL DOUCHE MY FAMILY CARE ALOE VERA', 'gel douche', 'RODIS', 'MY FAMILY CARE ALOE VERA', 0, 0, true, 'vrac', 100),
  ('vrac brume parfumee bouquet sunflower', 'VRAC BRUME PARFUMEE BOUQUET SUNFLOWER', 'parfume', 'RODIS', 'BOUQUET', 0, 0, true, 'vrac', 100),
  ('vrac brume parfumee bouquet tulipa', 'VRAC BRUME PARFUMEE BOUQUET TULIPA', 'parfume', 'RODIS', 'BOUQUET', 0, 0, true, 'vrac', 100),
  ('vrac talc mamassita', 'VRAC TALC MAMASSITA', 'talc', 'RODIS', 'MAMASSITA', 0, 0, true, 'vrac', 100),
  ('vrac lait absolute care papaya', 'VRAC LAIT ABSOLUTE CARE PAPAYA', 'clarifiant', 'RODIS', 'ABSOLUTE CARE PAPAYA', 0, 0, true, 'vrac', 100),
  ('vrac creme my family care lemon', 'VRAC CREME MY FAMILY CARE LEMON', 'hydratant', 'RODIS', 'MY FAMILY CARE LEMON ', 0, 0, true, 'vrac', 100),
  ('vrac lait anti mosquito family night sky', 'VRAC LAIT ANTI MOSQUITO FAMILY NIGHT SKY', 'Anti sptique ', 'RODIS', 'FOREVER CARE', 0, 0, true, 'vrac', 100),
  ('vrac gel anti mosquito family night sky', 'VRAC GEL ANTI MOSQUITO FAMILY NIGHT SKY', 'Anti sptique ', 'RODIS', 'FOREVER CARE', 0, 0, true, 'vrac', 100),
  ('vrac gel douche perfect glow', 'VRAC GEL DOUCHE PERFECT GLOW', 'gel douche', 'RODIS', 'PERFECT GLOW', 0, 0, true, 'vrac', 100),
  ('vrac creme white secret', 'VRAC CREME WHITE SECRET', 'clarifiant', 'RODIS', 'WHITE SECRET', 0, 0, true, 'vrac', 100),
  ('vrac talc my family care almond', 'VRAC TALC MY FAMILY CARE ALMOND', 'talc', 'RODIS', 'MY FAMILY CARE ALMOND', 0, 0, true, 'vrac', 100),
  ('vrac tube gel dr johnson', 'VRAC TUBE GEL DR JOHNSON', 'menthole', 'RODIS', 'Dr Johnson', 0, 0, true, 'vrac', 100),
  ('vrac lait luxury avocado', 'VRAC LAIT LUXURY AVOCADO', 'hydratant', 'RODIS', ' LUXURY AVOCADO', 0, 0, true, 'vrac', 100),
  ('vrac lait egyptian beauty', 'VRAC LAIT EGYPTIAN BEAUTY', 'clarifiant', 'RODIS', 'EGYPTIAN BEAUTY', 0, 0, true, 'vrac', 100),
  ('vrac gel douche my family care almond', 'VRAC GEL DOUCHE MY FAMILY CARE ALMOND', 'gel douche', 'RODIS', 'MY FAMILY CARE ALMOND', 0, 0, true, 'vrac', 100),
  ('vrac lait elixir', 'VRAC LAIT ELIXIR', 'clarifiant', 'RODIS', 'ELIXIR', 0, 0, true, 'vrac', 100),
  ('vrac creme perfect glow', 'VRAC CREME PERFECT GLOW', 'clarifiant', 'RODIS', 'PERFECT GLOW', 0, 0, true, 'vrac', 100),
  ('vrac lave vitre clean up', 'VRAC LAVE VITRE CLEAN UP', 'lave vitre ', 'RODIS', 'soopure', 0, 0, true, 'vrac', 100),
  ('vrac lait mamassita hydratant', 'VRAC LAIT MAMASSITA HYDRATANT', 'hydratant', 'RODIS', 'MAMASSITA', 0, 0, true, 'vrac', 100),
  ('vrac lait mamassita nourissant', 'VRAC LAIT MAMASSITA NOURISSANT', 'hydratant', 'RODIS', 'MAMASSITA', 0, 0, true, 'vrac', 100),
  ('vrac creme my family care pomegranate', 'VRAC CREME MY FAMILY CARE POMEGRANATE', 'hydratant', 'RODIS', 'MY FAMILY CARE POMEGRANATE', 0, 0, true, 'vrac', 100),
  ('vrac lait anti mosquito baby', 'VRAC LAIT ANTI MOSQUITO BABY', 'Anti sptique ', 'RODIS', 'FOREVER CARE', 0, 0, true, 'vrac', 100),
  ('vrac lait perfect glow', 'VRAC LAIT PERFECT GLOW', 'clarifiant', 'RODIS', 'PERFECT GLOW', 0, 0, true, 'vrac', 100),
  ('vrac spray antiseptique', 'VRAC SPRAY ANTISEPTIQUE', 'Anti sptique ', 'RODIS', 'SOOPURE', 0, 0, true, 'vrac', 100),
  ('vrac creme coco clear', 'VRAC CREME COCO CLEAR', 'clarifiant', 'RODIS', 'COCO CLEAR', 0, 0, true, 'vrac', 100),
  ('vrac talc real care baby', 'VRAC TALC REAL CARE BABY', 'talc', 'RODIS', 'REAL CARE BABY', 0, 0, true, 'vrac', 100),
  ('vrac pommade c.d.v blanc', 'VRAC POMMADE C.D.V BLANC', 'pommade', 'RODIS', ' C.D.V ', 0, 0, true, 'vrac', 100),
  ('vrac pommade c.d.v coco butteur', 'VRAC POMMADE C.D.V COCO BUTTEUR', 'pommade', 'RODIS', 'C.D.V', 0, 0, true, 'vrac', 100),
  ('vrac pommade c.d.v rose', 'VRAC POMMADE C.D.V ROSE', 'pommade', 'RODIS', ' C.D.V ', 0, 0, true, 'vrac', 100),
  ('vrac gel anti mosquito baby', 'VRAC GEL ANTI MOSQUITO BABY', 'Anti sptique ', 'RODIS', 'FOREVER CARE', 0, 0, true, 'vrac', 100),
  ('vrac savon bbc', 'VRAC SAVON BBC', 'savon', 'RODIS', 'bb clear ', 0, 0, true, 'vrac', 100),
  ('vrac spray anti mosquito family night sky', 'VRAC SPRAY ANTI MOSQUITO FAMILY NIGHT SKY', 'Anti sptique ', 'RODIS', 'FOREVER CARE', 0, 0, true, 'vrac', 100),
  ('vrac edc my family care lemon', 'VRAC EDC MY FAMILY CARE LEMON', 'parfume', 'RODIS', 'MY FAMILY CARE LEMON ', 0, 0, true, 'vrac', 100),
  ('vrac brume parfumee oriental scent black musk', 'VRAC BRUME PARFUMEE ORIENTAL SCENT BLACK MUSK', 'parfume', 'RODIS', 'ORIENTAL SCENT ', 0, 0, true, 'vrac', 100),
  ('vrac edc my family care almond', 'VRAC EDC MY FAMILY CARE ALMOND', 'parfume', 'RODIS', 'MY FAMILY CARE ALMOND', 0, 0, true, 'vrac', 100),
  ('vrac edc my family care aloe vera', 'VRAC EDC MY FAMILY CARE ALOE VERA', 'parfume', 'RODIS', 'MY FAMILY CARE ALOE VERA', 0, 0, true, 'vrac', 100),
  ('vrac savon perfect glow', 'VRAC SAVON PERFECT GLOW', 'savon', 'RODIS', 'PERFECT GLOW', 0, 0, true, 'vrac', 100),
  ('vrac edc my family care pomegranate', 'VRAC EDC MY FAMILY CARE POMEGRANATE', 'parfume', 'RODIS', 'MY FAMILY CARE POMEGRANATE', 0, 0, true, 'vrac', 100),
  ('vrac brume parfumee oriental scent red amber', 'VRAC BRUME PARFUMEE ORIENTAL SCENT RED AMBER', 'parfume', 'RODIS', 'ORIENTAL SCENT ', 0, 0, true, 'vrac', 100);

-- Lie chaque article fini a son vrac (nouveau ou deja existant)
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac brume parfumee oriental scent oriental oud' and nature = 'vrac' limit 1) where id = 4952; -- BRUME PARFUMEE ORIENTAL SCENT ORIENTAL OUD 90ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac brume parfumee oriental scent oriental oud' and nature = 'vrac' limit 1) where id = 51; -- BRUME PARFUMEE ORIENTAL SCENT ORIENTAL OUD 450ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac edc real care baby' and nature = 'vrac' limit 1) where id = 187; -- EDC REAL CARE BABY 750ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac edc real care baby' and nature = 'vrac' limit 1) where id = 189; -- EDC REAL CARE BABY 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac edc real care baby' and nature = 'vrac' limit 1) where id = 188; -- EDC REAL CARE BABY 400ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc my family care aloe vera' and nature = 'vrac' limit 1) where id = 582; -- TALC MY FAMILY CARE ALOE VERA 600G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc my family care aloe vera' and nature = 'vrac' limit 1) where id = 578; -- TALC MY FAMILY CARE ALOE VERA 100G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc my family care aloe vera' and nature = 'vrac' limit 1) where id = 579; -- TALC MY FAMILY CARE ALOE VERA 200G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc my family care aloe vera' and nature = 'vrac' limit 1) where id = 580; -- TALC MY FAMILY CARE ALOE VERA 400G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc my family care aloe vera' and nature = 'vrac' limit 1) where id = 581; -- TALC MY FAMILY CARE ALOE VERA 50G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche absolute care water lilies' and nature = 'vrac' limit 1) where id = 197; -- Gel Douche  ABSOLUTE CARE WATER LILIES 500ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche absolute care water lilies' and nature = 'vrac' limit 1) where id = 207; -- Gel Douche ABSOLUTE CARE WATER LILIES 1L
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac savon white secret' and nature = 'vrac' limit 1) where id = 90; -- Savon WHITE SECRET 190grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac savon white secret' and nature = 'vrac' limit 1) where id = 543; -- Savon  WHITE SECRET 90grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc my family care pomegranate' and nature = 'vrac' limit 1) where id = 184; -- TALC MY FAMILY CARE POMEGRANATE 100G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc my family care pomegranate' and nature = 'vrac' limit 1) where id = 126; -- TALC MY FAMILY CARE POMEGRANATE 50G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc my family care pomegranate' and nature = 'vrac' limit 1) where id = 125; -- TALC MY FAMILY CARE POMEGRANATE 600G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc my family care pomegranate' and nature = 'vrac' limit 1) where id = 127; -- TALC MY FAMILY CARE POMEGRANATE 400G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc my family care pomegranate' and nature = 'vrac' limit 1) where id = 128; -- TALC MY FAMILY CARE POMEGRANATE 200G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme mamassita hydratant' and nature = 'vrac' limit 1) where id = 104; -- CREME MAMASSITA HYDRATANT 400G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme mamassita hydratant' and nature = 'vrac' limit 1) where id = 103; -- CREME MAMASSITA HYDRATANT 220G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme mamassita nourrissant' and nature = 'vrac' limit 1) where id = 105; -- CREME MAMASSITA NOURRISSANT 220G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme mamassita nourrissant' and nature = 'vrac' limit 1) where id = 106; -- CREME MAMASSITA NOURRISSANT 400G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme matrix' and nature = 'vrac' limit 1) where id = 107; -- CREME MATRIX 125ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme matrix' and nature = 'vrac' limit 1) where id = 108; -- Creme Matrix 250ml 6Dz
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme matrix' and nature = 'vrac' limit 1) where id = 109; -- Creme Matrix 50ml 18Dz
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme matrix' and nature = 'vrac' limit 1) where id = 110; -- Creme Matrix 50ml 9Dz
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme morocco skin' and nature = 'vrac' limit 1) where id = 111; -- CREME MOROCCO SKIN 150 ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme morocco skin' and nature = 'vrac' limit 1) where id = 112; -- Creme MOROCCO SKIN 300 ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche exf tone therapy advanced' and nature = 'vrac' limit 1) where id = 218; -- GEL DOUCHE EXF TONE THERAPY ADVANCED 1000ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche exf tone therapy advanced' and nature = 'vrac' limit 1) where id = 230; -- GEL DOUCHE EXF TONE THERAPY ADVANCED 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme elixir' and nature = 'vrac' limit 1) where id = 96; -- Creme ELIXIR 400grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme elixir' and nature = 'vrac' limit 1) where id = 95; -- Creme ELIXIR 220grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme luxury cocoa' and nature = 'vrac' limit 1) where id = 102; -- Creme LUXURY COCOA 500grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme luxury cocoa' and nature = 'vrac' limit 1) where id = 100; -- Creme LUXURY COCOA 125grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme luxury cocoa' and nature = 'vrac' limit 1) where id = 101; -- Creme LUXURY COCOA 250grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac brume parfumee oriental scent royal jasmine' and nature = 'vrac' limit 1) where id = 54; -- BRUME PARFUMEE ORIENTAL SCENT ROYAL JASMINE 450ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac brume parfumee oriental scent royal jasmine' and nature = 'vrac' limit 1) where id = 55; -- BRUME PARFUMEE ORIENTAL SCENT ROYAL JASMINE 90ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme egyptian beauty' and nature = 'vrac' limit 1) where id = 93; -- Creme EGYPTIAN BEAUTY 125ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme egyptian beauty' and nature = 'vrac' limit 1) where id = 94; -- Creme EGYPTIAN BEAUTY 300ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme luxury avocado' and nature = 'vrac' limit 1) where id = 97; -- Creme LUXURY AVOCADO 125grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme luxury avocado' and nature = 'vrac' limit 1) where id = 98; -- Creme LUXURY AVOCADO 250grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme luxury avocado' and nature = 'vrac' limit 1) where id = 99; -- Creme LUXURY AVOCADO 500grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait luxury cocoa' and nature = 'vrac' limit 1) where id = 345; -- Lait LUXURY COCOA 400ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait luxury cocoa' and nature = 'vrac' limit 1) where id = 346; -- Lait LUXURY COCOA 750ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait luxury cocoa' and nature = 'vrac' limit 1) where id = 344; -- Lait LUXURY COCOA 250ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme my family care almond' and nature = 'vrac' limit 1) where id = 114; -- CREME MY FAMILY CARE ALMOND 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme my family care almond' and nature = 'vrac' limit 1) where id = 113; -- CREME MY FAMILY CARE ALMOND 100ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme my family care almond' and nature = 'vrac' limit 1) where id = 115; -- CREME MY FAMILY CARE ALMOND 400ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme my family care almond' and nature = 'vrac' limit 1) where id = 116; -- CREME MY FAMILY CARE ALMOND 900ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait coco clear' and nature = 'vrac' limit 1) where id = 328; -- Lait Coco Clear  200ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait coco clear' and nature = 'vrac' limit 1) where id = 163; -- Lait Coco Clear  500ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait coco clear' and nature = 'vrac' limit 1) where id = 289; -- Lait Coco Clear  300ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait bbc' and nature = 'vrac' limit 1) where id = 325; -- Lait BBC 300ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait bbc' and nature = 'vrac' limit 1) where id = 324; -- Lait BBC 200ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche absolute care fresh lime' and nature = 'vrac' limit 1) where id = 194; -- Gel Douche  ABSOLUTE CARE  FRESH LIME 500ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche absolute care fresh lime' and nature = 'vrac' limit 1) where id = 198; -- Gel Douche ABSOLUTE CARE  FRESH LIME 1L
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche absolute care aloe vera' and nature = 'vrac' limit 1) where id = 195; -- Gel Douche  ABSOLUTE CARE ALOE VERA 500ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche absolute care aloe vera' and nature = 'vrac' limit 1) where id = 201; -- Gel Douche ABSOLUTE CARE ALOE VERA 1L
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche elixir clarifiant' and nature = 'vrac' limit 1) where id = 226; -- Gel Douche ELIXIR  CLARIFIANT 1L
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche elixir clarifiant' and nature = 'vrac' limit 1) where id = 227; -- Gel Douche ELIXIR  Clarifiant 500ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait my family care almond' and nature = 'vrac' limit 1) where id = 353; -- LAIT MY FAMILY CARE ALMOND 125ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait my family care almond' and nature = 'vrac' limit 1) where id = 354; -- LAIT MY FAMILY CARE ALMOND 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait my family care almond' and nature = 'vrac' limit 1) where id = 355; -- LAIT MY FAMILY CARE ALMOND 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait my family care almond' and nature = 'vrac' limit 1) where id = 356; -- LAIT MY FAMILY CARE ALMOND 750ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait my family care aloe vera' and nature = 'vrac' limit 1) where id = 357; -- LAIT MY FAMILY CARE ALOE VERA 125ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait my family care aloe vera' and nature = 'vrac' limit 1) where id = 359; -- LAIT MY FAMILY CARE ALOE VERA 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait my family care aloe vera' and nature = 'vrac' limit 1) where id = 360; -- LAIT MY FAMILY CARE ALOE VERA 750ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait my family care aloe vera' and nature = 'vrac' limit 1) where id = 358; -- LAIT MY FAMILY CARE ALOE VERA 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait tone therapy advanced' and nature = 'vrac' limit 1) where id = 335; -- LAIT TONE THERAPY ADVANCED  300ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait tone therapy advanced' and nature = 'vrac' limit 1) where id = 394; -- LAIT TONE THERAPY ADVANCED 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait tone therapy advanced' and nature = 'vrac' limit 1) where id = 393; -- LAIT TONE THERAPY ADVANCED 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc my family care lemon' and nature = 'vrac' limit 1) where id = 124; -- TALC MY FAMILY CARE LEMON 200G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc my family care lemon' and nature = 'vrac' limit 1) where id = 121; -- TALC MY FAMILY CARE LEMON 600G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc my family care lemon' and nature = 'vrac' limit 1) where id = 123; -- TALC MY FAMILY CARE LEMON 400G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc my family care lemon' and nature = 'vrac' limit 1) where id = 122; -- TALC MY FAMILY CARE LEMON 50G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc my family care lemon' and nature = 'vrac' limit 1) where id = 181; -- TALC MY FAMILY CARE LEMON 100G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche absolute care papaya' and nature = 'vrac' limit 1) where id = 196; -- Gel Douche  ABSOLUTE CARE PAPAYA 500ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche absolute care papaya' and nature = 'vrac' limit 1) where id = 204; -- Gel Douche ABSOLUTE CARE PAPAYA 1L
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac brume parfumee oriental scent sandalwood' and nature = 'vrac' limit 1) where id = 56; -- BRUME PARFUMEE ORIENTAL SCENT SANDALWOOD 450ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac brume parfumee oriental scent sandalwood' and nature = 'vrac' limit 1) where id = 57; -- BRUME PARFUMEE ORIENTAL SCENT SANDALWOOD 90ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche real care baby' and nature = 'vrac' limit 1) where id = 260; -- GEL DOUCHE REAL CARE BABY 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche real care baby' and nature = 'vrac' limit 1) where id = 259; -- GEL DOUCHE REAL CARE BABY 400ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche real care baby' and nature = 'vrac' limit 1) where id = 258; -- GEL DOUCHE REAL CARE BABY 750ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche real care family' and nature = 'vrac' limit 1) where id = 263; -- GEL DOUCHE REAL CARE FAMILY 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche real care family' and nature = 'vrac' limit 1) where id = 262; -- GEL DOUCHE REAL CARE FAMILY 400ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche real care family' and nature = 'vrac' limit 1) where id = 261; -- GEL DOUCHE REAL CARE FAMILY 750ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche real care men' and nature = 'vrac' limit 1) where id = 266; -- GEL DOUCHE REAL CARE MEN 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche real care men' and nature = 'vrac' limit 1) where id = 265; -- GEL DOUCHE REAL CARE MEN 400ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche real care men' and nature = 'vrac' limit 1) where id = 264; -- GEL DOUCHE REAL CARE MEN 750ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche soopure carotte' and nature = 'vrac' limit 1) where id = 267; -- Gel douche soopure carotte 300ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche soopure carotte' and nature = 'vrac' limit 1) where id = 268; -- Gel douche soopure carotte 600ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche soopure classic' and nature = 'vrac' limit 1) where id = 269; -- Gel douche soopure classic 300ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche soopure classic' and nature = 'vrac' limit 1) where id = 270; -- gel douche soopure classic 600ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche soopure kids' and nature = 'vrac' limit 1) where id = 271; -- gel douche soopure kids 300ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche soopure kids' and nature = 'vrac' limit 1) where id = 272; -- gel douche soopure kids 600ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade mamassita blanc' and nature = 'vrac' limit 1) where id = 451; -- POMMADE MAMASSITA BLANC 400G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade mamassita blanc' and nature = 'vrac' limit 1) where id = 450; -- POMMADE MAMASSITA BLANC 220G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade mamassita jaune' and nature = 'vrac' limit 1) where id = 452; -- POMMADE MAMASSITA JAUNE 220G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade mamassita jaune' and nature = 'vrac' limit 1) where id = 453; -- POMMADE MAMASSITA JAUNE 400G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait bbc vit c' and nature = 'vrac' limit 1) where id = 327; -- Lait BBC VIT C 300ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait bbc vit c' and nature = 'vrac' limit 1) where id = 326; -- Lait BBC VIT C 200ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac brume parfumee oriental scent white musk' and nature = 'vrac' limit 1) where id = 58; -- BRUME PARFUMEE ORIENTAL SCENT WHITE MUSK 450ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac brume parfumee oriental scent white musk' and nature = 'vrac' limit 1) where id = 59; -- BRUME PARFUMEE ORIENTAL SCENT WHITE MUSK 90ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac crème absolute care water lilies' and nature = 'vrac' limit 1) where id = 66; -- CRÈME  ABSOLUTE CARE WATER LILIES 150 ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac crème absolute care water lilies' and nature = 'vrac' limit 1) where id = 79; -- Crème ABSOLUTE CARE WATER LILIES 300 ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme tone therapy advanced' and nature = 'vrac' limit 1) where id = 67; -- CREME  TONE THERAPY ADVANCED 150ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme tone therapy advanced' and nature = 'vrac' limit 1) where id = 68; -- CREME  TONE THERAPY ADVANCED 300ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme tone therapy advanced' and nature = 'vrac' limit 1) where id = 69; -- CREME  TONE THERAPY ADVANCED 450ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche soopure men' and nature = 'vrac' limit 1) where id = 273; -- gel douche soopure men 300ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche soopure men' and nature = 'vrac' limit 1) where id = 274; -- gel douche soopure men 600ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche soopure women' and nature = 'vrac' limit 1) where id = 275; -- gel douche soopure women  600ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche soopure women' and nature = 'vrac' limit 1) where id = 276; -- gel douche soopure women 300ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade my family care almond' and nature = 'vrac' limit 1) where id = 455; -- POMMADE MY FAMILY CARE ALMOND 100ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade my family care almond' and nature = 'vrac' limit 1) where id = 456; -- POMMADE MY FAMILY CARE ALMOND 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade my family care almond' and nature = 'vrac' limit 1) where id = 458; -- POMMADE MY FAMILY CARE ALMOND 900ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade my family care almond' and nature = 'vrac' limit 1) where id = 457; -- POMMADE MY FAMILY CARE ALMOND 400ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait morocco skin' and nature = 'vrac' limit 1) where id = 352; -- Lait MOROCCO SKIN 400ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait morocco skin' and nature = 'vrac' limit 1) where id = 351; -- LAIT MOROCCO SKIN 200 ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme real care men' and nature = 'vrac' limit 1) where id = 146; -- CREME REAL CARE MEN 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme real care men' and nature = 'vrac' limit 1) where id = 144; -- CREME REAL CARE MEN 125ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme real care men' and nature = 'vrac' limit 1) where id = 145; -- CREME REAL CARE MEN 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme my family care aloe vera' and nature = 'vrac' limit 1) where id = 118; -- CREME MY FAMILY CARE ALOE VERA 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme my family care aloe vera' and nature = 'vrac' limit 1) where id = 120; -- CREME MY FAMILY CARE ALOE VERA 900ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme my family care aloe vera' and nature = 'vrac' limit 1) where id = 117; -- CREME MY FAMILY CARE ALOE VERA 100ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme my family care aloe vera' and nature = 'vrac' limit 1) where id = 119; -- CREME MY FAMILY CARE ALOE VERA 400ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade real care baby' and nature = 'vrac' limit 1) where id = 479; -- POMMADE REAL CARE BABY 125ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade real care baby' and nature = 'vrac' limit 1) where id = 481; -- POMMADE REAL CARE BABY 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade real care baby' and nature = 'vrac' limit 1) where id = 480; -- POMMADE REAL CARE BABY 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade real care men' and nature = 'vrac' limit 1) where id = 485; -- POMMADE REAL CARE MEN 125ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade real care men' and nature = 'vrac' limit 1) where id = 486; -- POMMADE REAL CARE MEN 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade real care men' and nature = 'vrac' limit 1) where id = 487; -- POMMADE REAL CARE MEN 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade soopure lemon' and nature = 'vrac' limit 1) where id = 490; -- pommade soopure lemon 200 ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade soopure lemon' and nature = 'vrac' limit 1) where id = 491; -- pommade soopure lemon 400 ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade my family care pomegranate' and nature = 'vrac' limit 1) where id = 298; -- POMMADE MY FAMILY CARE POMEGRANATE 100ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade my family care pomegranate' and nature = 'vrac' limit 1) where id = 249; -- POMMADE MY FAMILY CARE POMEGRANATE 400ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade my family care pomegranate' and nature = 'vrac' limit 1) where id = 250; -- POMMADE MY FAMILY CARE POMEGRANATE 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade my family care pomegranate' and nature = 'vrac' limit 1) where id = 186; -- POMMADE MY FAMILY CARE POMEGRANATE 900ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait absolute care fresh lime' and nature = 'vrac' limit 1) where id = 312; -- LAIT ABSOLUTE CARE  FRESH LIME 200 ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait absolute care fresh lime' and nature = 'vrac' limit 1) where id = 317; -- Lait ABSOLUTE CARE FRESH LIME 300 ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait absolute care fresh lime' and nature = 'vrac' limit 1) where id = 313; -- Lait ABSOLUTE CARE  FRESH LIME 500ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait dermatone' and nature = 'vrac' limit 1) where id = 308; -- LAIT DERMATONE 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait dermatone' and nature = 'vrac' limit 1) where id = 309; -- LAIT DERMATONE 400ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme precious perfect' and nature = 'vrac' limit 1) where id = 132; -- Creme PRECIOUS PERFECT 250grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme precious perfect' and nature = 'vrac' limit 1) where id = 133; -- Creme PRECIOUS PERFECT 500grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme precious perfect' and nature = 'vrac' limit 1) where id = 131; -- Creme PRECIOUS PERFECT 125grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait absolute care water lilies' and nature = 'vrac' limit 1) where id = 321; -- LAIT ABSOLUTE CARE WATER LILIES 200 ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait absolute care water lilies' and nature = 'vrac' limit 1) where id = 322; -- Lait ABSOLUTE CARE WATER LILIES 300 ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait absolute care water lilies' and nature = 'vrac' limit 1) where id = 323; -- Lait ABSOLUTE CARE WATER LILIES 500ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade one for all cocoa butter' and nature = 'vrac' limit 1) where id = 473; -- Pommade One For All Cocoa Butter 500grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade one for all cocoa butter' and nature = 'vrac' limit 1) where id = 472; -- Pommade One For All Cocoa Butter 1Kg
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade one for all lemon' and nature = 'vrac' limit 1) where id = 474; -- Pommade One For All Lemon 1Kg
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade one for all lemon' and nature = 'vrac' limit 1) where id = 475; -- Pommade One For All Lemon 500grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade rapide white' and nature = 'vrac' limit 1) where id = 476; -- Pommade Rapide White  1Kg
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade rapide white' and nature = 'vrac' limit 1) where id = 478; -- Pommade Rapide White 140grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade rapide white' and nature = 'vrac' limit 1) where id = 477; -- Pommade Rapide White  300grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade rapide white' and nature = 'vrac' limit 1) where id = 623; -- Pommade Rapide White 480grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade real care family' and nature = 'vrac' limit 1) where id = 482; -- POMMADE REAL CARE FAMILY 125ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade real care family' and nature = 'vrac' limit 1) where id = 483; -- POMMADE REAL CARE FAMILY 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade real care family' and nature = 'vrac' limit 1) where id = 484; -- POMMADE REAL CARE FAMILY 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade soopure' and nature = 'vrac' limit 1) where id = 488; -- pommade soopure 200 ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade soopure' and nature = 'vrac' limit 1) where id = 489; -- pommade soopure 400 ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac crème absolute care fresh lime' and nature = 'vrac' limit 1) where id = 70; -- CRÈME ABSOLUTE CARE  FRESH LIME 150 ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac crème absolute care fresh lime' and nature = 'vrac' limit 1) where id = 71; -- Crème ABSOLUTE CARE  FRESH LIME 300 ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac crème absolute care aloe vera' and nature = 'vrac' limit 1) where id = 73; -- CRÈME ABSOLUTE CARE ALOE VERA 150 ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac crème absolute care aloe vera' and nature = 'vrac' limit 1) where id = 74; -- Crème ABSOLUTE CARE ALOE VERA 300 ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme real care family' and nature = 'vrac' limit 1) where id = 141; -- CREME REAL CARE FAMILY 125ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme real care family' and nature = 'vrac' limit 1) where id = 142; -- CREME REAL CARE FAMILY 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme real care family' and nature = 'vrac' limit 1) where id = 143; -- CREME REAL CARE FAMILY 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait real care family' and nature = 'vrac' limit 1) where id = 384; -- LAIT REAL CARE FAMILY 750ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait real care family' and nature = 'vrac' limit 1) where id = 382; -- LAIT REAL CARE FAMILY 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait real care family' and nature = 'vrac' limit 1) where id = 383; -- LAIT REAL CARE FAMILY 400ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait real care men' and nature = 'vrac' limit 1) where id = 385; -- LAIT REAL CARE MEN 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait real care men' and nature = 'vrac' limit 1) where id = 386; -- LAIT REAL CARE MEN 400ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait real care men' and nature = 'vrac' limit 1) where id = 387; -- LAIT REAL CARE MEN 750ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme pro white' and nature = 'vrac' limit 1) where id = 137; -- Creme PRO WHITE 220grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme pro white' and nature = 'vrac' limit 1) where id = 136; -- Creme PRO WHITE 400grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme real care baby' and nature = 'vrac' limit 1) where id = 138; -- CREME REAL CARE BABY 125ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme real care baby' and nature = 'vrac' limit 1) where id = 139; -- CREME REAL CARE BABY 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme real care baby' and nature = 'vrac' limit 1) where id = 140; -- CREME REAL CARE BABY 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait absolute care aloe vera' and nature = 'vrac' limit 1) where id = 316; -- Lait ABSOLUTE CARE ALOE VERA 500ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait absolute care aloe vera' and nature = 'vrac' limit 1) where id = 315; -- Lait ABSOLUTE CARE ALOE VERA 300 ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait absolute care aloe vera' and nature = 'vrac' limit 1) where id = 314; -- LAIT ABSOLUTE CARE ALOE VERA 200 ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac crème absolute care papaya' and nature = 'vrac' limit 1) where id = 76; -- CRÈME ABSOLUTE CARE PAPAYA 150 ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac crème absolute care papaya' and nature = 'vrac' limit 1) where id = 77; -- Crème ABSOLUTE CARE PAPAYA 300 ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme bbc' and nature = 'vrac' limit 1) where id = 83; -- Creme BBC 320grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme bbc' and nature = 'vrac' limit 1) where id = 81; -- Creme BBC 140grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme bbc vit c' and nature = 'vrac' limit 1) where id = 84; -- Creme BBC VIT C 140grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme bbc vit c' and nature = 'vrac' limit 1) where id = 85; -- Creme BBC VIT C 320grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade eco family' and nature = 'vrac' limit 1) where id = 448; -- Pommade Eco Family  1Kg
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade eco family' and nature = 'vrac' limit 1) where id = 449; -- Pommade Eco Family 500grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait my family care lemon' and nature = 'vrac' limit 1) where id = 463; -- LAIT MY FAMILY CARE LEMON 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait my family care lemon' and nature = 'vrac' limit 1) where id = 364; -- LAIT MY FAMILY CARE LEMON 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait my family care lemon' and nature = 'vrac' limit 1) where id = 363; -- LAIT MY FAMILY CARE LEMON 750ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait my family care lemon' and nature = 'vrac' limit 1) where id = 466; -- LAIT MY FAMILY CARE LEMON 125ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait my family care pomegranate' and nature = 'vrac' limit 1) where id = 368; -- LAIT MY FAMILY CARE POMEGRANATE 125ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait my family care pomegranate' and nature = 'vrac' limit 1) where id = 367; -- LAIT MY FAMILY CARE POMEGRANATE 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait my family care pomegranate' and nature = 'vrac' limit 1) where id = 366; -- LAIT MY FAMILY CARE POMEGRANATE 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait my family care pomegranate' and nature = 'vrac' limit 1) where id = 365; -- LAIT MY FAMILY CARE POMEGRANATE 750ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait precious perfect' and nature = 'vrac' limit 1) where id = 371; -- Lait PRECIOUS PERFECT 125ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait precious perfect' and nature = 'vrac' limit 1) where id = 372; -- Lait PRECIOUS PERFECT 250ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait precious perfect' and nature = 'vrac' limit 1) where id = 373; -- Lait PRECIOUS PERFECT 500ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade my family care aloe vera' and nature = 'vrac' limit 1) where id = 460; -- POMMADE MY FAMILY CARE ALOE VERA 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade my family care aloe vera' and nature = 'vrac' limit 1) where id = 461; -- POMMADE MY FAMILY CARE ALOE VERA 400ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade my family care aloe vera' and nature = 'vrac' limit 1) where id = 462; -- POMMADE MY FAMILY CARE ALOE VERA 900ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade my family care aloe vera' and nature = 'vrac' limit 1) where id = 459; -- POMMADE MY FAMILY CARE ALOE VERA 100ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade my family care lemon' and nature = 'vrac' limit 1) where id = 362; -- POMMADE MY FAMILY CARE LEMON 100ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade my family care lemon' and nature = 'vrac' limit 1) where id = 361; -- POMMADE MY FAMILY CARE LEMON 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade my family care lemon' and nature = 'vrac' limit 1) where id = 247; -- POMMADE MY FAMILY CARE LEMON 900ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade my family care lemon' and nature = 'vrac' limit 1) where id = 248; -- POMMADE MY FAMILY CARE LEMON 400ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche my family care lemon' and nature = 'vrac' limit 1) where id = 528; -- GEL DOUCHE MY FAMILY CARE LEMON 750ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche my family care lemon' and nature = 'vrac' limit 1) where id = 584; -- GEL DOUCHE MY FAMILY CARE LEMON 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche my family care lemon' and nature = 'vrac' limit 1) where id = 583; -- GEL DOUCHE MY FAMILY CARE LEMON 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche exf tone therapy intense' and nature = 'vrac' limit 1) where id = 27; -- GEL DOUCHE EXF TONE THERAPY INTENSE 1000ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche exf tone therapy intense' and nature = 'vrac' limit 1) where id = 231; -- GEL DOUCHE EXF TONE THERAPY INTENSE 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme dermatone' and nature = 'vrac' limit 1) where id = 150; -- CREME DERMATONE 300ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme dermatone' and nature = 'vrac' limit 1) where id = 89; -- CREME DERMATONE 150ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche my family care pomegranate' and nature = 'vrac' limit 1) where id = 530; -- GEL DOUCHE MY FAMILY CARE POMEGRANATE 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche my family care pomegranate' and nature = 'vrac' limit 1) where id = 529; -- GEL DOUCHE MY FAMILY CARE POMEGRANATE 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche my family care pomegranate' and nature = 'vrac' limit 1) where id = 470; -- GEL DOUCHE MY FAMILY CARE POMEGRANATE 750ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait pro white' and nature = 'vrac' limit 1) where id = 377; -- Lait PRO WHITE 250ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait pro white' and nature = 'vrac' limit 1) where id = 378; -- Lait PRO WHITE 500ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme tone therapy intense' and nature = 'vrac' limit 1) where id = 164; -- CREME TONE THERAPY INTENSE 450ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme tone therapy intense' and nature = 'vrac' limit 1) where id = 151; -- CREME TONE THERAPY INTENSE 150ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme tone therapy intense' and nature = 'vrac' limit 1) where id = 152; -- CREME TONE THERAPY INTENSE 300ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait real care baby' and nature = 'vrac' limit 1) where id = 379; -- LAIT REAL CARE BABY 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait real care baby' and nature = 'vrac' limit 1) where id = 380; -- LAIT REAL CARE BABY 400ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait real care baby' and nature = 'vrac' limit 1) where id = 381; -- LAIT REAL CARE BABY 750ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait tone therapy intense' and nature = 'vrac' limit 1) where id = 395; -- LAIT TONE THERAPY INTENSE 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait tone therapy intense' and nature = 'vrac' limit 1) where id = 396; -- LAIT TONE THERAPY INTENSE 300ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait tone therapy intense' and nature = 'vrac' limit 1) where id = 397; -- LAIT TONE THERAPY INTENSE 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac brume parfumee bouquet daisy' and nature = 'vrac' limit 1) where id = 31; -- BRUME PARFUMEE BOUQUET DAISY 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac brume parfumee bouquet daisy' and nature = 'vrac' limit 1) where id = 32; -- BRUME PARFUMEE BOUQUET DAISY 90ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac brume parfumee bouquet hibiscus' and nature = 'vrac' limit 1) where id = 33; -- BRUME PARFUMEE BOUQUET HIBISCUS 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac brume parfumee bouquet hibiscus' and nature = 'vrac' limit 1) where id = 34; -- BRUME PARFUMEE BOUQUET HIBISCUS 90ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac brume parfumee bouquet lilium' and nature = 'vrac' limit 1) where id = 35; -- BRUME PARFUMEE BOUQUET LILIUM 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac brume parfumee bouquet lilium' and nature = 'vrac' limit 1) where id = 36; -- BRUME PARFUMEE BOUQUET LILIUM 90ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel anti mosquito family citronella' and nature = 'vrac' limit 1) where id = 674; -- GEL ANTI MOSQUITO FAMILY CITRONELLA 90ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel anti mosquito family citronella' and nature = 'vrac' limit 1) where id = 675; -- GEL  ANTI MOSQUITO FAMILY CITRONELLA 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait anti mosquito family citronella' and nature = 'vrac' limit 1) where id = 673; -- LAIT ANTI MOSQUITO FAMILY CITRONELLA 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait anti mosquito family citronella' and nature = 'vrac' limit 1) where id = 672; -- LAIT ANTI MOSQUITO FAMILY CITRONELLA 90ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac brume parfumee bouquet rosa' and nature = 'vrac' limit 1) where id = 37; -- BRUME PARFUMEE BOUQUET ROSA 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac brume parfumee bouquet rosa' and nature = 'vrac' limit 1) where id = 38; -- BRUME PARFUMEE BOUQUET ROSA 90ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac spray anti mosquito baby' and nature = 'vrac' limit 1) where id = 671; -- SPRAY ANTI MOSQUITO BABY 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac spray anti mosquito baby' and nature = 'vrac' limit 1) where id = 670; -- SPRAY ANTI MOSQUITO BABY 90ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac spray anti mosquito family citronella' and nature = 'vrac' limit 1) where id = 676; -- SPRAY ANTI MOSQUITO FAMILY CITRONELLA 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac spray anti mosquito family citronella' and nature = 'vrac' limit 1) where id = 677; -- SPRAY ANTI MOSQUITO FAMILY CITRONELLA 90ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche clarif tone therapy intense' and nature = 'vrac' limit 1) where id = 216; -- GEL DOUCHE CLARIF TONE THERAPY INTENSE  500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche clarif tone therapy intense' and nature = 'vrac' limit 1) where id = 217; -- GEL DOUCHE CLARIF TONE THERAPY INTENSE 1000ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche efficacite plus' and nature = 'vrac' limit 1) where id = 658; -- GEL DOUCHE EFFICACITE PLUS 1L
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche efficacite plus' and nature = 'vrac' limit 1) where id = 659; -- GEL DOUCHE EFFICACITE PLUS 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche efficacite plus exfoliant' and nature = 'vrac' limit 1) where id = 656; -- GEL DOUCHE EFFICACITE PLUS EXFOLIANT 1L
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche efficacite plus exfoliant' and nature = 'vrac' limit 1) where id = 657; -- GEL DOUCHE EFFICACITE PLUS EXFOLIANT 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche my family care aloe vera' and nature = 'vrac' limit 1) where id = 245; -- GEL DOUCHE MY FAMILY CARE ALOE VERA 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche my family care aloe vera' and nature = 'vrac' limit 1) where id = 246; -- GEL DOUCHE MY FAMILY CARE ALOE VERA 750ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche my family care aloe vera' and nature = 'vrac' limit 1) where id = 244; -- GEL DOUCHE MY FAMILY CARE ALOE VERA 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac brume parfumee bouquet sunflower' and nature = 'vrac' limit 1) where id = 39; -- BRUME PARFUMEE BOUQUET SUNFLOWER 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac brume parfumee bouquet sunflower' and nature = 'vrac' limit 1) where id = 40; -- BRUME PARFUMEE BOUQUET SUNFLOWER 90ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac brume parfumee bouquet tulipa' and nature = 'vrac' limit 1) where id = 41; -- BRUME PARFUMEE BOUQUET TULIPA 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac brume parfumee bouquet tulipa' and nature = 'vrac' limit 1) where id = 42; -- BRUME PARFUMEE BOUQUET TULIPA 90ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc mamassita' and nature = 'vrac' limit 1) where id = 570; -- TALC MAMASSITA 100G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc mamassita' and nature = 'vrac' limit 1) where id = 571; -- TALC MAMASSITA 225G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc mamassita' and nature = 'vrac' limit 1) where id = 572; -- TALC MAMASSITA 500G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait absolute care papaya' and nature = 'vrac' limit 1) where id = 320; -- Lait ABSOLUTE CARE PAPAYA 500ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait absolute care papaya' and nature = 'vrac' limit 1) where id = 318; -- LAIT ABSOLUTE CARE PAPAYA 200 ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait absolute care papaya' and nature = 'vrac' limit 1) where id = 319; -- Lait ABSOLUTE CARE PAPAYA 300 ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme my family care lemon' and nature = 'vrac' limit 1) where id = 661; -- CREME MY FAMILY CARE LEMON 100ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme my family care lemon' and nature = 'vrac' limit 1) where id = 660; -- CREME MY FAMILY CARE LEMON 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme my family care lemon' and nature = 'vrac' limit 1) where id = 614; -- CREME MY FAMILY CARE LEMON 400ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme my family care lemon' and nature = 'vrac' limit 1) where id = 588; -- CREME MY FAMILY CARE LEMON 900ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait anti mosquito family night sky' and nature = 'vrac' limit 1) where id = 678; -- LAIT ANTI MOSQUITO FAMILY NIGHT SKY 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait anti mosquito family night sky' and nature = 'vrac' limit 1) where id = 679; -- LAIT ANTI MOSQUITO FAMILY NIGHT SKY 90ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel anti mosquito family night sky' and nature = 'vrac' limit 1) where id = 681; -- GEL ANTI MOSQUITO FAMILY NIGHT SKY 90ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel anti mosquito family night sky' and nature = 'vrac' limit 1) where id = 680; -- GEL ANTI MOSQUITO FAMILY NIGHT SKY 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche perfect glow' and nature = 'vrac' limit 1) where id = 254; -- Gel Douche PERFECT GLOW 500ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche perfect glow' and nature = 'vrac' limit 1) where id = 253; -- Gel Douche PERFECT GLOW 1L
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme white secret' and nature = 'vrac' limit 1) where id = 156; -- Creme WHITE SECRET 320grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme white secret' and nature = 'vrac' limit 1) where id = 155; -- Creme WHITE SECRET 140grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc my family care almond' and nature = 'vrac' limit 1) where id = 575; -- TALC MY FAMILY CARE ALMOND 400G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc my family care almond' and nature = 'vrac' limit 1) where id = 576; -- TALC MY FAMILY CARE ALMOND 50G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc my family care almond' and nature = 'vrac' limit 1) where id = 577; -- TALC MY FAMILY CARE ALMOND 600G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc my family care almond' and nature = 'vrac' limit 1) where id = 573; -- TALC MY FAMILY CARE ALMOND 100G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc my family care almond' and nature = 'vrac' limit 1) where id = 574; -- TALC MY FAMILY CARE ALMOND 200G
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac tube gel dr johnson' and nature = 'vrac' limit 1) where id = 604; -- tube gel dr johnson 15 grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac tube gel dr johnson' and nature = 'vrac' limit 1) where id = 605; -- Tube Gel Dr Johnson 30grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac tube gel dr johnson' and nature = 'vrac' limit 1) where id = 603; -- Tube Gel Dr Johnson 100grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait luxury avocado' and nature = 'vrac' limit 1) where id = 341; -- Lait LUXURY AVOCADO 250ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait luxury avocado' and nature = 'vrac' limit 1) where id = 342; -- Lait LUXURY AVOCADO 400ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait luxury avocado' and nature = 'vrac' limit 1) where id = 343; -- Lait LUXURY AVOCADO 750ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait egyptian beauty' and nature = 'vrac' limit 1) where id = 337; -- Lait EGYPTIAN BEAUTY 250ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait egyptian beauty' and nature = 'vrac' limit 1) where id = 338; -- Lait EGYPTIAN BEAUTY 500ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche my family care almond' and nature = 'vrac' limit 1) where id = 242; -- GEL DOUCHE MY FAMILY CARE ALMOND 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche my family care almond' and nature = 'vrac' limit 1) where id = 243; -- GEL DOUCHE MY FAMILY CARE ALMOND 750ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel douche my family care almond' and nature = 'vrac' limit 1) where id = 241; -- GEL DOUCHE MY FAMILY CARE ALMOND 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait elixir' and nature = 'vrac' limit 1) where id = 339; -- Lait ELIXIR 250ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait elixir' and nature = 'vrac' limit 1) where id = 340; -- Lait ELIXIR 500ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme perfect glow' and nature = 'vrac' limit 1) where id = 135; -- Creme PERFECT GLOW 320grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme perfect glow' and nature = 'vrac' limit 1) where id = 134; -- Creme PERFECT GLOW 140grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lave vitre clean up' and nature = 'vrac' limit 1) where id = 402; -- lave vitre clean up
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lave vitre clean up' and nature = 'vrac' limit 1) where id = 403; -- lave vitre clean up 750 ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait mamassita hydratant' and nature = 'vrac' limit 1) where id = 347; -- LAIT MAMASSITA HYDRATANT 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait mamassita hydratant' and nature = 'vrac' limit 1) where id = 348; -- LAIT MAMASSITA HYDRATANT 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait mamassita nourissant' and nature = 'vrac' limit 1) where id = 349; -- LAIT MAMASSITA NOURISSANT 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait mamassita nourissant' and nature = 'vrac' limit 1) where id = 350; -- LAIT MAMASSITA NOURISSANT 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme my family care pomegranate' and nature = 'vrac' limit 1) where id = 663; -- CREME MY FAMILY CARE POMEGRANATE 100ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme my family care pomegranate' and nature = 'vrac' limit 1) where id = 662; -- CREME MY FAMILY CARE POMEGRANATE 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme my family care pomegranate' and nature = 'vrac' limit 1) where id = 593; -- CREME MY FAMILY CARE POMEGRANATE 400ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme my family care pomegranate' and nature = 'vrac' limit 1) where id = 592; -- CREME MY FAMILY CARE POMEGRANATE 900ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait anti mosquito baby' and nature = 'vrac' limit 1) where id = 667; -- LAIT ANTI MOSQUITO BABY 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait anti mosquito baby' and nature = 'vrac' limit 1) where id = 666; -- LAIT ANTI MOSQUITO BABY 90ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait perfect glow' and nature = 'vrac' limit 1) where id = 374; -- Lait PERFECT GLOW 200ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait perfect glow' and nature = 'vrac' limit 1) where id = 376; -- Lait PERFECT GLOW 500ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac lait perfect glow' and nature = 'vrac' limit 1) where id = 375; -- Lait PERFECT GLOW 300ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac spray antiseptique' and nature = 'vrac' limit 1) where id = 665; -- SPRAY ANTISEPTIQUE 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac spray antiseptique' and nature = 'vrac' limit 1) where id = 664; -- SPRAY ANTISEPTIQUE 750ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme coco clear' and nature = 'vrac' limit 1) where id = 553; -- Creme Coco Clear  320grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac creme coco clear' and nature = 'vrac' limit 1) where id = 600; -- Creme Coco Clear  140grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc real care baby' and nature = 'vrac' limit 1) where id = 595; -- TALC REAL CARE BABY 450ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc real care baby' and nature = 'vrac' limit 1) where id = 596; -- TALC REAL CARE BABY 60ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac talc real care baby' and nature = 'vrac' limit 1) where id = 594; -- TALC REAL CARE BABY 150 ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade c.d.v blanc' and nature = 'vrac' limit 1) where id = 440; -- Pommade C.D.V Blanc 300grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade c.d.v blanc' and nature = 'vrac' limit 1) where id = 620; -- Pommade C.D.V Blanc 140grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade c.d.v coco butteur' and nature = 'vrac' limit 1) where id = 441; -- Pommade C.D.V Coco Butteur 1000ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade c.d.v coco butteur' and nature = 'vrac' limit 1) where id = 442; -- Pommade C.D.V Coco Butteur 300grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade c.d.v rose' and nature = 'vrac' limit 1) where id = 443; -- Pommade C.D.V rose 1000ml
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade c.d.v rose' and nature = 'vrac' limit 1) where id = 444; -- Pommade C.D.V rose 300grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac pommade c.d.v rose' and nature = 'vrac' limit 1) where id = 621; -- Pommade C.D.V rose 140grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel anti mosquito baby' and nature = 'vrac' limit 1) where id = 669; -- GEL  ANTI MOSQUITO BABY 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac gel anti mosquito baby' and nature = 'vrac' limit 1) where id = 668; -- GEL ANTI MOSQUITO BABY 90ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac savon bbc' and nature = 'vrac' limit 1) where id = 538; -- Savon BBC 190grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac savon bbc' and nature = 'vrac' limit 1) where id = 536; -- Savon BBC 90grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac spray anti mosquito family night sky' and nature = 'vrac' limit 1) where id = 683; -- SPRAY ANTI MOSQUITO FAMILY NIGHT SKY 200ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac spray anti mosquito family night sky' and nature = 'vrac' limit 1) where id = 682; -- SPRAY ANTI MOSQUITO FAMILY NIGHT SKY 90ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac edc my family care lemon' and nature = 'vrac' limit 1) where id = 587; -- EDC MY FAMILY CARE LEMON 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac edc my family care lemon' and nature = 'vrac' limit 1) where id = 586; -- EDC MY FAMILY CARE LEMON 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac edc my family care lemon' and nature = 'vrac' limit 1) where id = 585; -- EDC MY FAMILY CARE LEMON 750ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac brume parfumee oriental scent black musk' and nature = 'vrac' limit 1) where id = 49; -- BRUME PARFUMEE ORIENTAL SCENT BLACK MUSK 450ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac brume parfumee oriental scent black musk' and nature = 'vrac' limit 1) where id = 50; -- BRUME PARFUMEE ORIENTAL SCENT BLACK MUSK 90ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac edc my family care almond' and nature = 'vrac' limit 1) where id = 175; -- EDC MY FAMILY CARE ALMOND 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac edc my family care almond' and nature = 'vrac' limit 1) where id = 176; -- EDC MY FAMILY CARE ALMOND 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac edc my family care almond' and nature = 'vrac' limit 1) where id = 177; -- EDC MY FAMILY CARE ALMOND 750ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac edc my family care aloe vera' and nature = 'vrac' limit 1) where id = 178; -- EDC MY FAMILY CARE ALOE VERA 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac edc my family care aloe vera' and nature = 'vrac' limit 1) where id = 179; -- EDC MY FAMILY CARE ALOE VERA 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac edc my family care aloe vera' and nature = 'vrac' limit 1) where id = 180; -- EDC MY FAMILY CARE ALOE VERA 750ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac savon perfect glow' and nature = 'vrac' limit 1) where id = 517; -- Savon PERFECT GLOW 190grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac savon perfect glow' and nature = 'vrac' limit 1) where id = 515; -- Savon PERFECT GLOW 90grs
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac edc my family care pomegranate' and nature = 'vrac' limit 1) where id = 591; -- EDC MY FAMILY CARE POMEGRANATE 250ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac edc my family care pomegranate' and nature = 'vrac' limit 1) where id = 590; -- EDC MY FAMILY CARE POMEGRANATE 500ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac edc my family care pomegranate' and nature = 'vrac' limit 1) where id = 589; -- EDC MY FAMILY CARE POMEGRANATE 750ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac brume parfumee oriental scent red amber' and nature = 'vrac' limit 1) where id = 52; -- BRUME PARFUMEE ORIENTAL SCENT RED AMBER 450ML
update public.articles set vrac_article_id = (select id from public.articles where nom_article = 'vrac brume parfumee oriental scent red amber' and nature = 'vrac' limit 1) where id = 53; -- BRUME PARFUMEE ORIENTAL SCENT RED AMBER 90ML
update public.articles set vrac_article_id = 6343 where id = 400; -- Lait WHITE SECRET 300ml
update public.articles set vrac_article_id = 6343 where id = 401; -- Lait WHITE SECRET 500ml

commit;

-- Verification
select count(*) as fini_avec_vrac from public.articles where nature != 'vrac' and vrac_article_id is not null;
select count(*) as total_vrac from public.articles where nature = 'vrac';
