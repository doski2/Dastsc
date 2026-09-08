# Índice de código — Dastsc — `Dastsc-V3/backend/core | Dastsc-V3/backend`

- **Archivos indexados:** 31
- **Líneas de código:** 6,376

## Carpetas incluidas

- `Dastsc-V3/backend/core`
- `Dastsc-V3/backend`

## Flujo de datos entre módulos

- `Dastsc-V3/backend/` → `Dastsc-V3/backend/core/` (9) — main.py→parser.py, main.py→profiles.py, main.py→raildriver.py, main.py→ocr_hud.py
- `Dastsc-V3/backend/tests/` → `Dastsc-V3/backend/core/` (5) — test_brake_log.py→brake_log.py, test_command_bus.py→command_bus.py, test_ocr_hud.py→ocr_hud.py, test_parser.py→parser.py
- `Dastsc-V3/backend/tests/` → `Dastsc-V3/backend/` (1) — test_main.py→main.py

## Puntos de entrada

- `Dastsc-V3/backend/main.py`

## Por carpeta

### `backend/` — 908 L
- **→ hacia:** `core/`
- **← desde:** `tests/`

- `Dastsc-V3/backend/main.py` (899 L) — _telemetry_int, _telemetry_float_from_keys, _sanitize, _resolve_profiles_dir, _resolve_getdata_path
- `Dastsc-V3/backend/requirements.txt` (9 L)

### `core/` — 3,510 L
- **← desde:** `backend/`, `tests/`

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

### `data/` — 5,867 L

- `Dastsc-V3/backend/data/brake_events.json` (5867 L)

### `tests/` — 1,967 L
- **→ hacia:** `core/`, `backend/`

- `Dastsc-V3/backend/tests/test_station_distance.py` (432 L) — TestStationDistanceTracker
- `Dastsc-V3/backend/tests/test_main.py` (220 L) — TestMainHelpers, TestTelemetryManager, _suppress_create_task, TestBrakeApi, TestOcrCaptureApi
- `Dastsc-V3/backend/tests/test_profiles_nexus.py` (191 L) — TestNexusProfiles, TestNexusProfilesIsolated
- `Dastsc-V3/backend/tests/test_brake_log.py` (159 L) — _valid_event, TestBrakeLog
- `Dastsc-V3/backend/tests/test_notch_capture.py` (154 L) — TestNotchCapture
- `Dastsc-V3/backend/tests/test_ocr_hud.py` (128 L) — TestOCRHud
- `Dastsc-V3/backend/tests/test_session_log.py` (121 L) — TestSessionLog
- `Dastsc-V3/backend/tests/test_profile_auto.py` (120 L) — TestProfileAuto
- `Dastsc-V3/backend/tests/test_command_bus.py` (112 L) — TestCommandBus
- `Dastsc-V3/backend/tests/test_profiles.py` (101 L) — TestProfiles
- `Dastsc-V3/backend/tests/test_profile_checklist.py` (94 L) — TestProfileChecklist
- `Dastsc-V3/backend/tests/test_profile_completeness.py` (71 L) — TestProfileCompleteness
- `Dastsc-V3/backend/tests/test_parser.py` (64 L) — TestParser
- `Dastsc-V3/backend/tests/__init__.py` (0 L)
