-- User-approved duplicate policy: one saved result per player/game/day.
-- All repeat attempts get the same already-saved notice; no game-result digest is needed.
-- Preserve the original migration and all submission/round data, indexes and foreign keys.
ALTER TABLE submissions DROP COLUMN result_hash;
UPDATE app_meta SET value = '2', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE key = 'schema_version';
