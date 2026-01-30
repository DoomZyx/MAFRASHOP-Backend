-- Workflow vérification comptes pro B2B : colonnes et statuts
-- À exécuter sur la base existante

-- 1. Ajouter les nouvelles colonnes
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS verification_mode VARCHAR(10) DEFAULT 'auto'
    CHECK (verification_mode IN ('auto', 'manual')),
  ADD COLUMN IF NOT EXISTS decision_source VARCHAR(10)
    CHECK (decision_source IS NULL OR decision_source IN ('auto', 'manual')),
  ADD COLUMN IF NOT EXISTS decision_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS reviewed_by_admin_id INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS last_verification_error VARCHAR(30)
    CHECK (last_verification_error IS NULL OR last_verification_error IN (
      'api_unavailable', 'api_timeout', 'invalid_siret', 'company_inactive'
    ));

-- 2. Étendre pro_status avec 'verified' et migrer 'validated' -> 'verified'
-- D'abord supprimer la contrainte (elle n'accepte que 'validated', pas 'verified')
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pro_status_check;
-- Puis migrer les données
UPDATE users SET pro_status = 'verified' WHERE pro_status = 'validated';
-- Recréer la contrainte avec la nouvelle valeur autorisée
ALTER TABLE users ADD CONSTRAINT users_pro_status_check
  CHECK (pro_status IN ('none', 'pending', 'verified', 'rejected'));

-- 3. Valeurs par défaut pour les nouvelles colonnes sur les lignes existantes
UPDATE users
SET
  verification_mode = COALESCE(verification_mode, 'auto'),
  decision_source = CASE
    WHEN pro_status = 'verified' THEN 'auto'
    WHEN pro_status = 'rejected' THEN 'auto'
    ELSE NULL
  END
WHERE verification_mode IS NULL OR (decision_source IS NULL AND pro_status IN ('verified', 'rejected'));
