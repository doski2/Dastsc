# Índice de código — Dastsc — `Dastsc-V3/backend/core`

- **Archivos indexados:** 14
- **Líneas de código:** 3,510

## Por carpeta

### `core/` — 3,510 L

- `Dastsc-V3/backend/core/station_distance.py` (576 L) — mid_leg_checkpoint_count, normalize_lua_station_distance, StationDistanceSample, speed_ms_from_telemetry, should_clear_on_turnaround
- `Dastsc-V3/backend/core/notch_capture.py` (411 L) — _percent_notch_labels, _profile_match_key, describe_graduated_capture, capture_sequence_for_profile, preset_labels_for_profile
- `Dastsc-V3/backend/core/ocr_hud.py` (358 L) — _setup_tesseract, _detect_region, get_ocr_region, refresh_ocr_region, _sanitize_distance_m
- `Dastsc-V3/backend/core/profile_checklist.py` (344 L) — _item, _mapping_layout, _inherits, build_profile_checklist
- `Dastsc-V3/backend/core/profile_draft.py` (310 L) — pick_mapping, suggest_extends_base, control_layout, suggest_profile_template, build_profile_draft
- `Dastsc-V3/backend/core/profile_auto.py` (282 L) — _deep_merge_dict, resolve_profile_chain, normalize_token, _profile_tokens, _loco_tokens
- `Dastsc-V3/backend/core/session_log.py` (276 L) — _merge_session_meta, _session_dir, _log_json_pretty, _session_path, SessionLogStore
- `Dastsc-V3/backend/core/command_bus.py` (184 L) — _clamp, apply_flag_path, enable_lua_commands, purge_lua_commands, is_allowed_command
- `Dastsc-V3/backend/core/profiles.py` (168 L) — _profile_id_from_path, _load_profile_file, _iter_profile_files, ProfileManager
- `Dastsc-V3/backend/core/raildriver.py` (154 L) — ControllerInfo, RailDriverSnapshot, RailDriverClient, get_raildriver_client
- `Dastsc-V3/backend/core/brake_log.py` (152 L) — speed_band_from_ms, _as_float, _load, _save, _is_valid
- `Dastsc-V3/backend/core/profile_completeness.py` (130 L) — _total_brake_samples, _is_self_contained_gold, _score_level, assess_profile_completeness
- `Dastsc-V3/backend/core/cab_inference.py` (123 L) — CabInferenceState, _speed_ms, _reversal, _infer_from_motion, enrich_cab_telemetry
- `Dastsc-V3/backend/core/parser.py` (42 L) — _coerce_value, parse_telemetry_line
