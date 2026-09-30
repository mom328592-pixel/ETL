-- Document-alignment migration for an existing database.
-- Run this once on an existing SIM database before deploying the aligned application.
SET FOREIGN_KEY_CHECKS = 0;

-- Internal roles required by the project document.
UPDATE roles SET role_name='Admin' WHERE id_role=1;
UPDATE roles SET role_name='Staff' WHERE id_role=2;
UPDATE roles SET role_name='Manager' WHERE id_role=3;

-- Agent-specific public registration link.
ALTER TABLE agents ADD COLUMN public_token VARCHAR(64) NULL AFTER address;
UPDATE agents
SET public_token = CONCAT('agent_', id_agent, '_', REPLACE(UUID(), '-', ''))
WHERE public_token IS NULL;
ALTER TABLE agents MODIFY public_token VARCHAR(64) NOT NULL;
ALTER TABLE agents ADD UNIQUE INDEX uk_agents_public_token (public_token);

-- Remove Package/Payment features that are not in the project document.
ALTER TABLE registrations DROP FOREIGN KEY fk_reg_package;
ALTER TABLE registrations DROP INDEX fk_reg_package;
ALTER TABLE registrations DROP COLUMN id_package;

ALTER TABLE sim_cards DROP FOREIGN KEY fk_sim_cards_package;
ALTER TABLE sim_cards DROP INDEX fk_sim_cards_package;
ALTER TABLE sim_cards DROP COLUMN id_package;
ALTER TABLE sim_cards DROP COLUMN package;
ALTER TABLE sim_cards DROP COLUMN link_url;
ALTER TABLE customers DROP COLUMN selfie_photo;

DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS packages;
DROP TABLE IF EXISTS notifications;

SET FOREIGN_KEY_CHECKS = 1;
