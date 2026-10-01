-- ADR 0016: detection tuning chosen on the held-out evaluation (section 10):
-- threshold 0.9 with 2 consecutive 80 ms chunks gave 0 false activations in
-- 17.3 h and fewer misses than 0.95. Only the platform default changes;
-- organization or account overrides (none yet) are kept.
update dk_features
set default_settings = default_settings || '{"threshold": 0.9, "confirm_frames": 2}'
where key = 'voice_wake_word';
