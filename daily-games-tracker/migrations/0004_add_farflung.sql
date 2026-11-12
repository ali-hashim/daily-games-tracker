-- Add Farflung (farflung.game): five prompts, tiered distance points; the score is their sum.
INSERT INTO games (id, key, display_name, active, round_count, config_json) VALUES
  (
    'farflung',
    'farflung',
    'Farflung',
    1,
    5,
    '{"icon":"🧭","parserVersion":"farflung.v1","allowedScores":[0,40,55,70,85,100],"tiers":{"100":"Farflung","85":"Elusive","70":"Rare","55":"Uncommon","40":"Common","0":"Miss"},"placementBadges":["🧭","🏔️","🗺️","🎒","🥾","⛺","🛶","🐢"]}'
  );

UPDATE app_meta
SET value = '4', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE key = 'schema_version';
