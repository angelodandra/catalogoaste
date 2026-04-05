-- Migrazione: aggiunge numero_interno_cassa alla tabella products
-- Eseguire nel pannello Supabase → SQL Editor

ALTER TABLE products
ADD COLUMN IF NOT EXISTS numero_interno_cassa TEXT;

-- Commento: numero/codice cassa assegnato dalla cooperativa delle aste.
-- Importato dalla 4ª colonna del file XLSX pesi (progressivo, peso, specie, num_coop).
-- Tipo TEXT per supportare valori alfanumerici (es. "A123", "656", "00B7").
