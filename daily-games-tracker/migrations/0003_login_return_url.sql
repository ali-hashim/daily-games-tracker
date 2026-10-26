-- Persist the browser destination for each short-lived login challenge.
ALTER TABLE login_challenges
  ADD COLUMN return_url TEXT NOT NULL DEFAULT '/user';

UPDATE app_meta
SET value = '3', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE key = 'schema_version';
