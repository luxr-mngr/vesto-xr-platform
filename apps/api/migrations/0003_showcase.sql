-- Demo-day public showcase support (ERS §11.4, ADR 0009):
-- a short artifact description, and an admin-controlled flag marking which
-- custom fields are safe to surface on the unauthenticated showcase page.

ALTER TABLE artifacts ADD COLUMN description TEXT;

ALTER TABLE custom_field_definitions
  ADD COLUMN is_public_showcase INTEGER NOT NULL DEFAULT 0 CHECK (is_public_showcase IN (0, 1));
