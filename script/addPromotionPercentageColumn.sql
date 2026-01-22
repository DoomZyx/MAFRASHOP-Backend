-- Ajouter la colonne promotion_percentage à la table products
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS promotion_percentage INTEGER DEFAULT NULL;

-- Ajouter une contrainte pour s'assurer que le pourcentage est entre 0 et 100
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_promotion_percentage'
  ) THEN
    ALTER TABLE products
    ADD CONSTRAINT check_promotion_percentage 
    CHECK (promotion_percentage IS NULL OR (promotion_percentage >= 0 AND promotion_percentage <= 100));
  END IF;
END $$;

