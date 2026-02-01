-- Ajout de la gestion TVA intracommunautaire pour les comptes professionnels UE
-- Permet la validation manuelle et l'application sécurisée de la TVA à 0%

-- Type ENUM pour le statut de validation TVA
DO $$ BEGIN
    CREATE TYPE vat_status_type AS ENUM ('none', 'pending_manual', 'validated', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Ajout des colonnes TVA intracommunautaire
ALTER TABLE users
ADD COLUMN IF NOT EXISTS company_country VARCHAR(2),
ADD COLUMN IF NOT EXISTS vat_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS vat_status vat_status_type NOT NULL DEFAULT 'none',
ADD COLUMN IF NOT EXISTS vat_validation_date TIMESTAMP;

-- Index pour recherche rapide des validations manuelles en attente
CREATE INDEX IF NOT EXISTS idx_users_vat_status ON users(vat_status) WHERE vat_status = 'pending_manual';

-- Commentaires
COMMENT ON COLUMN users.company_country IS 'Code pays ISO (ex: FR, BE, DE) pour TVA intracommunautaire';
COMMENT ON COLUMN users.vat_number IS 'Numéro de TVA intracommunautaire (ex: FR12345678901)';
COMMENT ON COLUMN users.vat_status IS 'Statut validation TVA: none (pas de demande), pending_manual (vérif manuelle), validated (TVA 0%), rejected (refusé)';
COMMENT ON COLUMN users.vat_validation_date IS 'Date de validation ou rejet du numéro TVA (pour audit)';
