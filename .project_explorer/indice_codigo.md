# Índice de código — Dastsc

- **Archivos indexados:** 827
- **Líneas de código:** 102,705

## Flujo de datos entre módulos

- `Dastsc-V3/backend/` → `Dastsc-V3/backend/core/` (9) — main.py→parser.py, main.py→profiles.py, main.py→raildriver.py, main.py→ocr_hud.py
- `Dastsc-V3/src/v3/core/` → `Dastsc-V3/src/v3/core/normalizers/` (8) — DataNormalizer.ts→Constants.ts, DataNormalizer.ts→PhysicsNormalizer.ts, DataNormalizer.ts→SignalingNormalizer.ts, DataNormalizer.ts→BrakeNormalizer.ts
- `Dastsc-V4/src/` → `Dastsc-V4/src/components/` (8) — App.tsx→AgentHeadline.tsx, App.tsx→ArmActionBar.tsx, App.tsx→AppShell.tsx, App.tsx→BrakePlanPanel.tsx
- `nexus-kernel/src/` → `nexus-kernel/src/normalizers/` (8) — DataNormalizer.ts→Constants.ts, DataNormalizer.ts→PhysicsNormalizer.ts, DataNormalizer.ts→SignalingNormalizer.ts, DataNormalizer.ts→BrakeNormalizer.ts
- `Dastsc-V3/backend/tests/` → `Dastsc-V3/backend/core/` (5) — test_brake_log.py→brake_log.py, test_command_bus.py→command_bus.py, test_ocr_hud.py→ocr_hud.py, test_parser.py→parser.py
- `Dastsc-V3/src/` → `Dastsc-V3/src/v3/components/shell/` (5) — App.tsx→AppHeader.tsx, App.tsx→AppTabBar.tsx, App.tsx→ConfigTab.tsx, App.tsx→PilotHudTab.tsx
- `nexus-agent/src/` → `nexus-agent/src/brake/` (5) — horizon.ts→signalUtils.ts, tick.ts→agentConfig.ts, tick.ts→physics.ts, tick.ts→signalUtils.ts
- `Dastsc-V4/src/` → `Dastsc-V4/src/hooks/` (3) — App.tsx→useManualOcrCapture.ts, App.tsx→useAgent.ts, App.tsx→useStationDistanceDebug.ts
- `(raíz)/` → `Dastsc-V3/backend/core/` (1) — raildriver-poc.py→ocr_hud.py
- `Dastsc-V3/backend/tests/` → `Dastsc-V3/backend/` (1) — test_main.py→main.py
- `Dastsc-V3/src/` → `Dastsc-V3/src/v3/bootstrap/` (1) — main.tsx→mountApp.tsx
- `Dastsc-V3/src/` → `Dastsc-V3/src/v3/core/` (1) — App.tsx→TelemetryContext.tsx
- `nexus-agent/src/` → `nexus-agent/src/command/` (1) — tick.ts→commandBus.ts

## Puntos de entrada

- `Dastsc-V3/backend/main.py`
- `Dastsc-V3/package.json`
- `Dastsc-V4/package.json`
- `docs/debug/README.md`
- `docs/debug/semana-01-lua-ipc/README.md`
- `docs/debug/semana-02-telemetria-kernel/README.md`
- `docs/debug/semana-03-backend-comandos/README.md`
- `docs/debug/semana-04-agente-frenado/README.md`
- `docs/debug/semana-05-agente-estacion/README.md`
- `docs/debug/semana-06-auto-v4/README.md`
- `docs/debug/semana-07-icet/README.md`
- `docs/debug/semana-08-class323/README.md`
- `docs/debug/semana-09-generico-nuevos/README.md`
- `docs/debug/semana-10-aceleracion-futuro/README.md`
- `ETCS-master/README.md`
- `nexus-agent/package.json`
- `nexus-agent/src/index.ts`
- `nexus-kernel/package.json`
- `nexus-kernel/src/index.ts`
- `package.json`
- `README.md`

## Por carpeta

### `(raíz)/` — 5,885 L
- **→ hacia:** `Dastsc-V3/backend/core/`

- `package-lock.json` (3116 L)
- `fix_markdownlint.py` (922 L) — load_md060_config, char_display_width, display_width, pad_to_display_width, pipe_columns
- `nexus-profile-wizard.py` (691 L) — NotchCaptureDialog, ProfileWizardApp, main
- `route-distance-poc.py` (468 L) — RouteStop, RouteMapping, RouteProfile, parse_getdata_line, haversine_m
- `raildriver-poc.py` (180 L) — load_api, decode_name, get_loco, get_controllers, try_ocr_miles
- `TAIL_PROTECTION_V6_README.md` (163 L)
- `nexus-debug.py` (120 L) — format_engine_line, render_debug_text, capture, watch_changes, main
- `Iniciar_Nexus_V3.bat` (38 L)
- `Iniciar_Nexus_V4.bat` (38 L)
- `PROJECT_MAP.md` (30 L)
- `README.md` (28 L)
- `flow_map.json` (26 L)
- `Asistente_Perfil.bat` (23 L)
- `package.json` (20 L)
- `check-addrs-out.txt` (8 L)
- `tsconfig.json` (8 L)
- `pyrightconfig.json` (6 L)

### `.project_explorer/` — 1,288 L

- `.project_explorer/indice_codigo.md` (1197 L)
- `.project_explorer/indice_codigo_Dastsc-V3_backend_Dastsc-V3_backend_.md` (68 L)
- `.project_explorer/indice_codigo_Dastsc-V3_backend_core.md` (23 L)

### `.vs/` — 18 L

- `.vs/VSWorkspaceState.json` (15 L)
- `.vs/ProjectSettings.json` (3 L)

### `Dastsc-V3/` — 3,008 L

- `Dastsc-V3/package-lock.json` (2658 L)
- `Dastsc-V3/PLAN_ARQUITECTURA_STD.md` (174 L)
- `Dastsc-V3/ROADMAP_EJECUCION_V3.md` (76 L)
- `Dastsc-V3/package.json` (34 L)
- `Dastsc-V3/tsconfig.json` (33 L)
- `Dastsc-V3/vite.config.ts` (21 L)
- `Dastsc-V3/tsconfig.node.json` (12 L)

### `Dastsc-V4/` — 76 L

- `Dastsc-V4/package.json` (27 L)
- `Dastsc-V4/tsconfig.json` (18 L)
- `Dastsc-V4/vite.config.ts` (18 L)
- `Dastsc-V4/tsconfig.node.json` (13 L)

### `docs/` — 2,462 L

- `docs/PENDIENTES_V4.md` (722 L)
- `docs/NEXUS_V4_ARQUITECTURA.md` (444 L)
- `docs/METRICAS_TELEMETRIA_V3.md` (370 L)
- `docs/GUIA_TECNICA_IPC.md` (259 L)
- `docs/COMPARATIVA_LUA_RAILDRIVER.md` (207 L)
- `docs/TIPOS_DE_FRENOS.md` (132 L)
- `docs/ESPECIFICACION_ULTRA_CORE_V4.md` (120 L)
- `docs/GUIA_PERFILES_V3.md` (113 L)
- `docs/DOCUMENTACION_PROYECTO.md` (95 L)

### `ETCS-master/` — 151 L

- `ETCS-master/gradlew.bat` (90 L)
- `ETCS-master/CMakeLists.txt` (56 L)
- `ETCS-master/README.md` (3 L)
- `ETCS-master/privacy-policy.md` (2 L)

### `lua/` — 518 L

- `lua/Railworks_GetData_Script.lua` (518 L)

### `nexus-agent/` — 43 L

- `nexus-agent/package.json` (22 L)
- `nexus-agent/tsconfig.json` (14 L)
- `nexus-agent/vitest.config.ts` (7 L)

### `nexus-kernel/` — 31 L

- `nexus-kernel/package.json` (18 L)
- `nexus-kernel/tsconfig.json` (13 L)

### `profiles/` — 2,078 L

- `profiles/class350_expert_wcml.json` (112 L)
- `profiles/class390_expert.json` (102 L)
- `profiles/acelaexpressexpert.json` (98 L)
- `profiles/class377.json` (92 L)
- `profiles/xc_class323_expert.json` (28 L)
- `profiles/br442_mapper_expert.json` (27 L)
- `profiles/cc_class323_simple.json` (27 L)
- `profiles/class450_expert_pdl.json` (27 L)
- `profiles/br189expert.json` (26 L)
- `profiles/f7_expert.json` (19 L)
- `profiles/gp7_expert.json` (19 L)
- `profiles/sw10_expert.json` (19 L)
- `profiles/101_expert.json` (17 L)
- `profiles/442_expert.json` (17 L)
- `profiles/4f_expert.json` (17 L)
- `profiles/[cml]class465 9_expert.json` (17 L)
- `profiles/a2_expert.json` (17 L)
- `profiles/a4_expert.json` (17 L)
- `profiles/a4_intermediate.json` (17 L)
- `profiles/ac4400cw_expert.json` (17 L)
- `profiles/acs-64_mapper.json` (17 L)
- `profiles/alp46_expert.json` (17 L)
- `profiles/br101.json` (17 L)
- `profiles/br266_expert.json` (17 L)
- `profiles/br294.json` (17 L)
- `profiles/br423_expertinput.json` (17 L)
- `profiles/br442_mapper_expertt.json` (17 L)
- `profiles/br648_expert.json` (17 L)
- `profiles/cabcar_expert.json` (17 L)
- `profiles/cl166.json` (17 L)
- `profiles/class143loco_expert.json` (17 L)
- `profiles/class158loco_expert.json` (17 L)
- `profiles/class170expert.json` (17 L)
- `profiles/class175_inputexpert.json` (17 L)
- `profiles/class180_inputexpert.json` (17 L)
- `profiles/class221_expert.json` (17 L)
- `profiles/class375.json` (17 L)
- `profiles/class378.json` (17 L)
- `profiles/class395.json` (17 L)
- `profiles/class456loco_expert.json` (17 L)
- `profiles/class465_expert.json` (17 L)
- `profiles/class66_expert.json` (17 L)
- `profiles/class68_expert.json` (17 L)
- `profiles/class801.json` (17 L)
- `profiles/default_expert.json` (17 L)
- `profiles/default_intermediate.json` (17 L)
- `profiles/e8mapper.json` (17 L)
- `profiles/f40ph_expert.json` (17 L)
- `profiles/f59psloco_expert.json` (17 L)
- `profiles/genset remapper expert.json` (17 L)
- `profiles/german_expert.json` (17 L)
- `profiles/gp38mapper.json` (17 L)
- `profiles/hst.json` (17 L)
- `profiles/hst_expert.json` (17 L)
- `profiles/m7_mapper.json` (17 L)
- `profiles/ma_br101.json` (17 L)
- `profiles/mp36phdrivingcabmapper.json` (17 L)
- `profiles/mp36phmapper.json` (17 L)
- `profiles/p32mapper.json` (17 L)
- `profiles/p42mapper.json` (17 L)
- `profiles/sd70m_expert.json` (17 L)
- `profiles/stadler_flirt3_inputmapper_suwex.json` (17 L)
- `profiles/standard.json` (17 L)
- `profiles/tgv_expertinput.json` (17 L)
- `profiles/tgvr_expertinput.json` (17 L)
- `profiles/u36bmapper.json` (17 L)
- `profiles/u36cmapper.json` (17 L)
- `profiles/voithgravita_expert.json` (17 L)
- `profiles/442_stopgo.json` (16 L)
- `profiles/a4_stopgo.json` (16 L)
- `profiles/br442_mapper_stopgo.json` (16 L)
- `profiles/br442_mapper_stopgoo.json` (16 L)
- `profiles/class66_stopgo.json` (16 L)
- `profiles/class68_stopgo.json` (16 L)
- `profiles/default_stopgo.json` (16 L)
- `profiles/455_expert_pdl.json` (14 L)
- `profiles/br120_expertinput.json` (14 L)
- `profiles/br143_inputexpert.json` (14 L)
- `profiles/br152_inputexpert.json` (14 L)
- `profiles/br155_expertinput.json` (14 L)
- `profiles/br185expert.json` (14 L)
- `profiles/br186expert.json` (14 L)
- `profiles/br189 inputexpert.json` (14 L)
- `profiles/br204_expert.json` (14 L)
- `profiles/br407_expert.json` (14 L)
- `profiles/db146expert.json` (14 L)
- `profiles/er20_mapper.json` (14 L)
- `profiles/es44ac_expert.json` (14 L)
- `profiles/es44ac_expert_bnsf.json` (14 L)
- `profiles/gp38mapperln.json` (14 L)
- `profiles/gp40_expert.json` (14 L)
- `profiles/ice 3m inputexpert.json` (14 L)
- `profiles/ice2expert.json` (14 L)
- `profiles/obb1016_expertinput.json` (14 L)
- `profiles/obb2016_mapper.json` (14 L)
- `profiles/sd402_expert.json` (14 L)
- `profiles/sd40mapper.json` (14 L)
- `profiles/sd70mapper.json` (14 L)
- `profiles/alp46_simple.json` (12 L)
- `profiles/br52_stopgo.json` (12 L)
- `profiles/class350_simple_wcml.json` (12 L)
- `profiles/class450_simple_pdl.json` (12 L)
- `profiles/drive mode.json` (12 L)
- `profiles/editor mode.json` (12 L)
- `profiles/gp38mappersimple.json` (12 L)
- `profiles/voithgravita_simple.json` (12 L)

### `Dastsc-V3/backend/` — 908 L
- **→ hacia:** `Dastsc-V3/backend/core/`
- **← desde:** `Dastsc-V3/backend/tests/`

- `Dastsc-V3/backend/main.py` (899 L) — _telemetry_int, _telemetry_float_from_keys, _sanitize, _resolve_profiles_dir, _resolve_getdata_path
- `Dastsc-V3/backend/requirements.txt` (9 L)

### `Dastsc-V3/src/` — 56 L
- **→ hacia:** `Dastsc-V3/src/v3/components/shell/`, `Dastsc-V3/src/v3/bootstrap/`, `Dastsc-V3/src/v3/core/`

- `Dastsc-V3/src/App.tsx` (51 L)
- `Dastsc-V3/src/main.tsx` (4 L)
- `Dastsc-V3/src/vite-env.d.ts` (1 L)

### `Dastsc-V4/src/` — 128 L
- **→ hacia:** `Dastsc-V4/src/components/`, `Dastsc-V4/src/hooks/`

- `Dastsc-V4/src/App.tsx` (117 L)
- `Dastsc-V4/src/main.tsx` (10 L)
- `Dastsc-V4/src/vite-env.d.ts` (1 L)

### `docs/debug/` — 107 L

- `docs/debug/README.md` (107 L)

### `docs/ETCS/` — 107 L

- `docs/ETCS/INVESTIGACION_ETCS.md` (107 L)

### `ETCS-master/config/` — 6 L

- `ETCS-master/config/settings.ini` (6 L)

### `ETCS-master/DMI/` — 2,273 L

- `ETCS-master/DMI/stm_bombardier.json` (511 L)
- `ETCS-master/DMI/stm_ansaldo.json` (392 L)
- `ETCS-master/DMI/stm_hitachi.json` (229 L)
- `ETCS-master/DMI/stm_alstom.json` (221 L)
- `ETCS-master/DMI/stm_siemens.json` (221 L)
- `ETCS-master/DMI/stm_stadler.json` (221 L)
- `ETCS-master/DMI/stm_windows.json` (177 L)
- `ETCS-master/DMI/CMakeLists.txt` (126 L)
- `ETCS-master/DMI/monitor.cpp` (78 L)
- `ETCS-master/DMI/monitor.h` (52 L)
- `ETCS-master/DMI/init.cpp` (33 L)
- `ETCS-master/DMI/time_etcs.h` (9 L)
- `ETCS-master/DMI/settings.ini` (3 L)

### `ETCS-master/EVC/` — 1,990 L

- `ETCS-master/EVC/config.json` (1670 L)
- `ETCS-master/EVC/CMakeLists.txt` (110 L)
- `ETCS-master/EVC/optional.h` (97 L)
- `ETCS-master/EVC/evc.cpp` (92 L)
- `ETCS-master/EVC/evc.h` (21 L)

### `ETCS-master/include/` — 870 L

- `ETCS-master/include/moFileReader.hpp` (870 L)

### `ETCS-master/locales/` — 14 L

- `ETCS-master/locales/compile_locales.bat` (7 L)
- `ETCS-master/locales/compile_locales.sh` (7 L)

### `ETCS-master/platform/` — 4,703 L

- `ETCS-master/platform/sdl_platform.cpp` (755 L)
- `ETCS-master/platform/simrail_platform.cpp` (654 L)
- `ETCS-master/platform/platform_util.h` (620 L)
- `ETCS-master/platform/console_tools.cpp` (212 L)
- `ETCS-master/platform/bus_socket_server.cpp` (198 L)
- `ETCS-master/platform/console_platform.cpp` (192 L)
- `ETCS-master/platform/simrail_platform.h` (185 L)
- `ETCS-master/platform/bus_socket_impl.cpp` (183 L)
- `ETCS-master/platform/sdl_platform.h` (175 L)
- `ETCS-master/platform/platform.h` (162 L)
- `ETCS-master/platform/tcp_socket.cpp` (161 L)
- `ETCS-master/platform/ares_dns.h` (136 L)
- `ETCS-master/platform/bus_tcp_bridge.cpp` (130 L)
- `ETCS-master/platform/tcp_listener.cpp` (106 L)
- `ETCS-master/platform/local_bus_socket.cpp` (83 L)
- `ETCS-master/platform/orts_bridge.cpp` (74 L)
- `ETCS-master/platform/console_platform.h` (67 L)
- `ETCS-master/platform/console_fd_poller.cpp` (61 L)
- `ETCS-master/platform/bus_tcp_bridge.h` (57 L)
- `ETCS-master/platform/bus_socket_impl.h` (54 L)
- `ETCS-master/platform/local_bus_socket.h` (53 L)
- `ETCS-master/platform/bus_socket_server.h` (41 L)
- `ETCS-master/platform/tcp_socket.h` (41 L)
- `ETCS-master/platform/orts_bridge.h` (32 L)
- `ETCS-master/platform/dns.h` (30 L)
- `ETCS-master/platform/fstream_file_impl.cpp` (30 L)
- `ETCS-master/platform/tcp_listener.h` (30 L)
- `ETCS-master/platform/platform_runtime.cpp` (26 L)
- `ETCS-master/platform/local_bus_container.cpp` (24 L)
- `ETCS-master/platform/local_bus_container.h` (22 L)
- `ETCS-master/platform/libc_time_impl.cpp` (21 L)
- `ETCS-master/platform/platform_runtime.h` (19 L)
- `ETCS-master/platform/console_fd_poller.h` (17 L)
- `ETCS-master/platform/fstream_file_impl.h` (16 L)
- `ETCS-master/platform/libc_time_impl.h` (15 L)
- `ETCS-master/platform/console_tools.h` (12 L)
- `ETCS-master/platform/platform.cpp` (9 L)

### `ETCS-master/utils/` — 74 L

- `ETCS-master/utils/build_etcs.sh` (71 L)
- `ETCS-master/utils/ETCS.bat` (3 L)

### `logs/nexus-v4/` — 2 L

- `logs/nexus-v4/session_2026-08-17_02-52-08.json` (1 L)
- `logs/nexus-v4/session_2026-08-17_02-54-49.json` (1 L)

### `nexus-agent/src/` — 501 L
- **→ hacia:** `nexus-agent/src/brake/`, `nexus-agent/src/command/`

- `nexus-agent/src/tick.ts` (331 L)
- `nexus-agent/src/horizon.ts` (88 L)
- `nexus-agent/src/index.ts` (56 L)
- `nexus-agent/src/horizon.test.ts` (26 L)

### `nexus-kernel/src/` — 1,546 L
- **→ hacia:** `nexus-kernel/src/normalizers/`

- `nexus-kernel/src/dataNormalizerUtils.ts` (526 L)
- `nexus-kernel/src/DataNormalizer.ts` (254 L)
- `nexus-kernel/src/telemetryTypes.ts` (160 L)
- `nexus-kernel/src/types.ts` (131 L)
- `nexus-kernel/src/telemetryHubUtils.ts` (88 L)
- `nexus-kernel/src/toSnapshot.ts` (79 L)
- `nexus-kernel/src/limitUtils.ts` (77 L)
- `nexus-kernel/src/TelemetryHub.ts` (64 L)
- `nexus-kernel/src/mock.ts` (61 L)
- `nexus-kernel/src/index.ts` (53 L)
- `nexus-kernel/src/safetyUtils.ts` (31 L)
- `nexus-kernel/src/format.ts` (22 L)

### `profiles/nexus/` — 46 L

- `profiles/nexus/generic.json` (46 L)

### `scripts/debug/` — 13 L

- `scripts/debug/pre-vuelo-tests.bat` (13 L)

### `.vs/Dastsc.slnx/v18/` — 63 L

- `.vs/Dastsc.slnx/v18/DocumentLayout.backup.json` (40 L)
- `.vs/Dastsc.slnx/v18/DocumentLayout.json` (23 L)

### `Dastsc-V3/backend/core/` — 3,510 L
- **← desde:** `Dastsc-V3/backend/`, `Dastsc-V3/backend/tests/`, `(raíz)/`

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

### `Dastsc-V3/backend/data/` — 5,867 L

- `Dastsc-V3/backend/data/brake_events.json` (5867 L)

### `Dastsc-V3/backend/tests/` — 1,967 L
- **→ hacia:** `Dastsc-V3/backend/core/`, `Dastsc-V3/backend/`

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

### `Dastsc-V4/src/components/` — 1,345 L
- **← desde:** `Dastsc-V4/src/`

- `Dastsc-V4/src/components/BrakePlanPanel.tsx` (377 L)
- `Dastsc-V4/src/components/DriveHudBar.tsx` (174 L)
- `Dastsc-V4/src/components/ProfileSelector.tsx` (136 L)
- `Dastsc-V4/src/components/ConfigView.tsx` (114 L)
- `Dastsc-V4/src/components/ProfileCompletenessPanel.tsx` (96 L)
- `Dastsc-V4/src/components/ArmActionBar.tsx` (95 L)
- `Dastsc-V4/src/components/SessionLogsPanel.tsx` (85 L)
- `Dastsc-V4/src/components/AppShell.tsx` (83 L)
- `Dastsc-V4/src/components/PolicyModeSelector.tsx` (60 L)
- `Dastsc-V4/src/components/HorizonStrip.tsx` (50 L)
- `Dastsc-V4/src/components/AgentHeadline.tsx` (39 L)
- `Dastsc-V4/src/components/MiniHud.tsx` (36 L)

### `Dastsc-V4/src/hooks/` — 998 L
- **← desde:** `Dastsc-V4/src/`

- `Dastsc-V4/src/hooks/useAgent.ts` (382 L)
- `Dastsc-V4/src/hooks/useSessionDiagnostic.ts` (274 L)
- `Dastsc-V4/src/hooks/useAutoCommand.ts` (77 L)
- `Dastsc-V4/src/hooks/useBrakeLearning.ts` (73 L)
- `Dastsc-V4/src/hooks/useStationDistanceDebug.ts` (60 L)
- `Dastsc-V4/src/hooks/useManualOcrCapture.ts` (51 L)
- `Dastsc-V4/src/hooks/useTrainProfile.ts` (41 L)
- `Dastsc-V4/src/hooks/useBrakeStats.ts` (40 L)

### `Dastsc-V4/src/lib/` — 940 L

- `Dastsc-V4/src/lib/sessionDiagnostic.ts` (377 L)
- `Dastsc-V4/src/lib/brakeLearningUtils.ts` (259 L)
- `Dastsc-V4/src/lib/profileCompleteness.ts` (191 L)
- `Dastsc-V4/src/lib/profileBrake.ts` (65 L)
- `Dastsc-V4/src/lib/agentSettings.ts` (41 L)
- `Dastsc-V4/src/lib/commandTypes.ts` (7 L)

### `docs/debug/_plantillas/` — 96 L

- `docs/debug/_plantillas/sesion.md` (40 L)
- `docs/debug/_plantillas/issue.md` (35 L)
- `docs/debug/_plantillas/checklist-semana.md` (21 L)

### `docs/debug/semana-01-lua-ipc/` — 51 L

- `docs/debug/semana-01-lua-ipc/checklist.md` (24 L)
- `docs/debug/semana-01-lua-ipc/README.md` (17 L)
- `docs/debug/semana-01-lua-ipc/issues.md` (10 L)

### `docs/debug/semana-02-telemetria-kernel/` — 44 L

- `docs/debug/semana-02-telemetria-kernel/README.md` (22 L)
- `docs/debug/semana-02-telemetria-kernel/checklist.md` (21 L)
- `docs/debug/semana-02-telemetria-kernel/issues.md` (1 L)

### `docs/debug/semana-03-backend-comandos/` — 38 L

- `docs/debug/semana-03-backend-comandos/checklist.md` (23 L)
- `docs/debug/semana-03-backend-comandos/README.md` (14 L)
- `docs/debug/semana-03-backend-comandos/issues.md` (1 L)

### `docs/debug/semana-04-agente-frenado/` — 260 L

- `docs/debug/semana-04-agente-frenado/brake-module.md` (179 L)
- `docs/debug/semana-04-agente-frenado/checklist.md` (38 L)
- `docs/debug/semana-04-agente-frenado/README.md` (29 L)
- `docs/debug/semana-04-agente-frenado/issues.md` (14 L)

### `docs/debug/semana-05-agente-estacion/` — 80 L

- `docs/debug/semana-05-agente-estacion/checklist.md` (42 L)
- `docs/debug/semana-05-agente-estacion/README.md` (33 L)
- `docs/debug/semana-05-agente-estacion/issues.md` (5 L)

### `docs/debug/semana-06-auto-v4/` — 38 L

- `docs/debug/semana-06-auto-v4/checklist.md` (19 L)
- `docs/debug/semana-06-auto-v4/README.md` (18 L)
- `docs/debug/semana-06-auto-v4/issues.md` (1 L)

### `docs/debug/semana-07-icet/` — 38 L

- `docs/debug/semana-07-icet/checklist.md` (23 L)
- `docs/debug/semana-07-icet/README.md` (14 L)
- `docs/debug/semana-07-icet/issues.md` (1 L)

### `docs/debug/semana-08-class323/` — 42 L

- `docs/debug/semana-08-class323/checklist.md` (32 L)
- `docs/debug/semana-08-class323/README.md` (9 L)
- `docs/debug/semana-08-class323/issues.md` (1 L)

### `docs/debug/semana-09-generico-nuevos/` — 40 L

- `docs/debug/semana-09-generico-nuevos/README.md` (21 L)
- `docs/debug/semana-09-generico-nuevos/checklist.md` (18 L)
- `docs/debug/semana-09-generico-nuevos/issues.md` (1 L)

### `docs/debug/semana-10-aceleracion-futuro/` — 23 L

- `docs/debug/semana-10-aceleracion-futuro/README.md` (17 L)
- `docs/debug/semana-10-aceleracion-futuro/checklist.md` (5 L)
- `docs/debug/semana-10-aceleracion-futuro/issues.md` (1 L)

### `ETCS-master/.github/workflows/` — 148 L

- `ETCS-master/.github/workflows/ci.yml` (148 L)

### `ETCS-master/DMI/Config/` — 59 L

- `ETCS-master/DMI/Config/config.cpp` (48 L)
- `ETCS-master/DMI/Config/config.h` (11 L)

### `ETCS-master/DMI/control/` — 281 L

- `ETCS-master/DMI/control/control.cpp` (214 L)
- `ETCS-master/DMI/control/control.h` (67 L)

### `ETCS-master/DMI/distance/` — 119 L

- `ETCS-master/DMI/distance/distance.cpp` (106 L)
- `ETCS-master/DMI/distance/distance.h` (13 L)

### `ETCS-master/DMI/fonts/` — 195 L

- `ETCS-master/DMI/fonts/LiberationSans.txt` (102 L)
- `ETCS-master/DMI/fonts/NotoSans.txt` (93 L)

### `ETCS-master/DMI/graphics/` — 1,221 L

- `ETCS-master/DMI/graphics/component.cpp` (279 L)
- `ETCS-master/DMI/graphics/layout.cpp` (115 L)
- `ETCS-master/DMI/graphics/component.h` (102 L)
- `ETCS-master/DMI/graphics/display.cpp` (73 L)
- `ETCS-master/DMI/graphics/drawing.cpp` (68 L)
- `ETCS-master/DMI/graphics/color.h` (66 L)
- `ETCS-master/DMI/graphics/layout.h` (64 L)
- `ETCS-master/DMI/graphics/icon_button.cpp` (43 L)
- `ETCS-master/DMI/graphics/text_button.cpp` (32 L)
- `ETCS-master/DMI/graphics/text_button.h` (30 L)
- `ETCS-master/DMI/graphics/button.h` (29 L)
- `ETCS-master/DMI/graphics/button.cpp` (28 L)
- `ETCS-master/DMI/graphics/graphic.h` (27 L)
- `ETCS-master/DMI/graphics/radius.h` (27 L)
- `ETCS-master/DMI/graphics/texture.h` (27 L)
- `ETCS-master/DMI/graphics/icon_button.h` (26 L)
- `ETCS-master/DMI/graphics/line.h` (25 L)
- `ETCS-master/DMI/graphics/text_graphic.h` (24 L)
- `ETCS-master/DMI/graphics/rectangle.h` (23 L)
- `ETCS-master/DMI/graphics/image_graphic.h` (22 L)
- `ETCS-master/DMI/graphics/flash.cpp` (21 L)
- `ETCS-master/DMI/graphics/circle.h` (20 L)
- `ETCS-master/DMI/graphics/drawing.h` (20 L)
- `ETCS-master/DMI/graphics/display.h` (17 L)
- `ETCS-master/DMI/graphics/flash.h` (13 L)

### `ETCS-master/DMI/language/` — 66 L

- `ETCS-master/DMI/language/language.cpp` (52 L)
- `ETCS-master/DMI/language/language.h` (14 L)

### `ETCS-master/DMI/messages/` — 284 L

- `ETCS-master/DMI/messages/messages.cpp` (178 L)
- `ETCS-master/DMI/messages/messages.h` (67 L)
- `ETCS-master/DMI/messages/text_strings.h` (39 L)

### `ETCS-master/DMI/planning/` — 350 L

- `ETCS-master/DMI/planning/planning.cpp` (298 L)
- `ETCS-master/DMI/planning/planning.h` (52 L)

### `ETCS-master/DMI/softkeys/` — 93 L

- `ETCS-master/DMI/softkeys/softkey.h` (48 L)
- `ETCS-master/DMI/softkeys/softkey.cpp` (45 L)

### `ETCS-master/DMI/sound/` — 125 L

- `ETCS-master/DMI/sound/sound.cpp` (93 L)
- `ETCS-master/DMI/sound/sound.h` (32 L)

### `ETCS-master/DMI/speed/` — 494 L

- `ETCS-master/DMI/speed/gauge.cpp` (479 L)
- `ETCS-master/DMI/speed/gauge.h` (15 L)

### `ETCS-master/DMI/state/` — 683 L

- `ETCS-master/DMI/state/acks.cpp` (229 L)
- `ETCS-master/DMI/state/mode.cpp` (81 L)
- `ETCS-master/DMI/state/level.cpp` (68 L)
- `ETCS-master/DMI/state/conditions.cpp` (55 L)
- `ETCS-master/DMI/state/gps_pos.cpp` (54 L)
- `ETCS-master/DMI/state/radio.cpp` (32 L)
- `ETCS-master/DMI/state/brake.cpp` (26 L)
- `ETCS-master/DMI/state/time_hour.cpp` (25 L)
- `ETCS-master/DMI/state/acks.h` (24 L)
- `ETCS-master/DMI/state/override.cpp` (20 L)
- `ETCS-master/DMI/state/gps_pos.h` (17 L)
- `ETCS-master/DMI/state/time_hour.h` (14 L)
- `ETCS-master/DMI/state/level.h` (13 L)
- `ETCS-master/DMI/state/override.h` (13 L)
- `ETCS-master/DMI/state/mode.h` (12 L)
- `ETCS-master/DMI/state/info_window.h` (0 L)

### `ETCS-master/DMI/STM/` — 748 L

- `ETCS-master/DMI/STM/stm_objects.cpp` (548 L)
- `ETCS-master/DMI/STM/stm_objects.h` (200 L)

### `ETCS-master/DMI/tcp/` — 362 L

- `ETCS-master/DMI/tcp/server.cpp` (348 L)
- `ETCS-master/DMI/tcp/server.h` (14 L)

### `ETCS-master/DMI/window/` — 2,542 L

- `ETCS-master/DMI/window/data_entry.cpp` (334 L)
- `ETCS-master/DMI/window/keyboard.cpp` (271 L)
- `ETCS-master/DMI/window/input_data.cpp` (147 L)
- `ETCS-master/DMI/window/window.cpp` (113 L)
- `ETCS-master/DMI/window/menu.cpp` (109 L)
- `ETCS-master/DMI/window/window_main.cpp` (107 L)
- `ETCS-master/DMI/window/data_validation.h` (103 L)
- `ETCS-master/DMI/window/nav_buttons.cpp` (93 L)
- `ETCS-master/DMI/window/menu_main.cpp` (82 L)
- `ETCS-master/DMI/window/data_view.h` (76 L)
- `ETCS-master/DMI/window/input_data.h` (75 L)
- `ETCS-master/DMI/window/subwindow.cpp` (71 L)
- `ETCS-master/DMI/window/brightness.cpp` (61 L)
- `ETCS-master/DMI/window/volume.cpp` (61 L)
- `ETCS-master/DMI/window/window.h` (57 L)
- `ETCS-master/DMI/window/menu_radio.cpp` (51 L)
- `ETCS-master/DMI/window/menu_settings.cpp` (47 L)
- `ETCS-master/DMI/window/menu_spec.cpp` (47 L)
- `ETCS-master/DMI/window/fixed_train_data.cpp` (46 L)
- `ETCS-master/DMI/window/train_data.cpp` (46 L)
- `ETCS-master/DMI/window/driver_id.cpp` (43 L)
- `ETCS-master/DMI/window/data_entry.h` (40 L)
- `ETCS-master/DMI/window/menu.h` (35 L)
- `ETCS-master/DMI/window/track_ahead_free.cpp` (35 L)
- `ETCS-master/DMI/window/menu_ntc.cpp` (34 L)
- `ETCS-master/DMI/window/subwindow.h` (32 L)
- `ETCS-master/DMI/window/menu_override.cpp` (23 L)
- `ETCS-master/DMI/window/fixed_train_data.h` (22 L)
- `ETCS-master/DMI/window/train_data.h` (22 L)
- `ETCS-master/DMI/window/data_validation.cpp` (21 L)
- `ETCS-master/DMI/window/driver_id.h` (21 L)
- `ETCS-master/DMI/window/nav_buttons.h` (21 L)
- `ETCS-master/DMI/window/keyboard.h` (20 L)
- `ETCS-master/DMI/window/brightness.h` (19 L)
- `ETCS-master/DMI/window/menu_ntc.h` (19 L)
- `ETCS-master/DMI/window/volume.h` (19 L)
- `ETCS-master/DMI/window/keyboards.h` (18 L)
- `ETCS-master/DMI/window/menu_main.h` (18 L)
- `ETCS-master/DMI/window/menu_override.h` (18 L)
- `ETCS-master/DMI/window/menu_radio.h` (18 L)
- `ETCS-master/DMI/window/menu_settings.h` (18 L)
- `ETCS-master/DMI/window/menu_spec.h` (18 L)
- `ETCS-master/DMI/window/track_ahead_free.h` (11 L)

### `ETCS-master/EVC/Config/` — 170 L

- `ETCS-master/EVC/Config/config.cpp` (159 L)
- `ETCS-master/EVC/Config/config.h` (11 L)

### `ETCS-master/EVC/DMI/` — 2,506 L

- `ETCS-master/EVC/DMI/windows.cpp` (1657 L)
- `ETCS-master/EVC/DMI/dmi.cpp` (456 L)
- `ETCS-master/EVC/DMI/text_messages.cpp` (179 L)
- `ETCS-master/EVC/DMI/text_message.h` (49 L)
- `ETCS-master/EVC/DMI/track_ahead_free.cpp` (41 L)
- `ETCS-master/EVC/DMI/acks.cpp` (40 L)
- `ETCS-master/EVC/DMI/windows.h` (40 L)
- `ETCS-master/EVC/DMI/track_ahead_free.h` (17 L)
- `ETCS-master/EVC/DMI/dmi.h` (15 L)
- `ETCS-master/EVC/DMI/acks.h` (12 L)

### `ETCS-master/EVC/Euroradio/` — 1,989 L

- `ETCS-master/EVC/Euroradio/session.cpp` (636 L)
- `ETCS-master/EVC/Euroradio/tcp_cfm.cpp` (469 L)
- `ETCS-master/EVC/Euroradio/safe_radio_connection.cpp` (221 L)
- `ETCS-master/EVC/Euroradio/radio_connection.cpp` (154 L)
- `ETCS-master/EVC/Euroradio/radio_connection.h` (98 L)
- `ETCS-master/EVC/Euroradio/session.h` (97 L)
- `ETCS-master/EVC/Euroradio/tcp_cfm.h` (75 L)
- `ETCS-master/EVC/Euroradio/terminal.cpp` (75 L)
- `ETCS-master/EVC/Euroradio/cfm.cpp` (62 L)
- `ETCS-master/EVC/Euroradio/terminal.h` (52 L)
- `ETCS-master/EVC/Euroradio/cfm.h` (50 L)

### `ETCS-master/EVC/language/` — 70 L

- `ETCS-master/EVC/language/language.cpp` (55 L)
- `ETCS-master/EVC/language/language.h` (15 L)

### `ETCS-master/EVC/LX/` — 110 L

- `ETCS-master/EVC/LX/level_crossing.cpp` (68 L)
- `ETCS-master/EVC/LX/level_crossing.h` (42 L)

### `ETCS-master/EVC/MA/` — 771 L

- `ETCS-master/EVC/MA/movement_authority.cpp` (442 L)
- `ETCS-master/EVC/MA/mode_profile.cpp` (162 L)
- `ETCS-master/EVC/MA/movement_authority.h` (131 L)
- `ETCS-master/EVC/MA/mode_profile.h` (36 L)

### `ETCS-master/EVC/NationalFN/` — 255 L

- `ETCS-master/EVC/NationalFN/asfa.cpp` (215 L)
- `ETCS-master/EVC/NationalFN/nationalfn.cpp` (18 L)
- `ETCS-master/EVC/NationalFN/asfa.h` (11 L)
- `ETCS-master/EVC/NationalFN/nationalfn.h` (11 L)

### `ETCS-master/EVC/OR_interface/` — 554 L

- `ETCS-master/EVC/OR_interface/interface.cpp` (470 L)
- `ETCS-master/EVC/OR_interface/orts_server.cpp` (49 L)
- `ETCS-master/EVC/OR_interface/orts_wrapper.h` (22 L)
- `ETCS-master/EVC/OR_interface/interface.h` (13 L)

### `ETCS-master/EVC/Packets/` — 7,812 L

- `ETCS-master/EVC/Packets/variables.h` (2172 L)
- `ETCS-master/EVC/Packets/messages.cpp` (1451 L)
- `ETCS-master/EVC/Packets/radio.h` (666 L)
- `ETCS-master/EVC/Packets/information.cpp` (567 L)
- `ETCS-master/EVC/Packets/radio.cpp` (382 L)
- `ETCS-master/EVC/Packets/information.h` (246 L)
- `ETCS-master/EVC/Packets/packets.cpp` (160 L)
- `ETCS-master/EVC/Packets/3.h` (152 L)
- `ETCS-master/EVC/Packets/types.h` (114 L)
- `ETCS-master/EVC/Packets/messages.h` (85 L)
- `ETCS-master/EVC/Packets/12.h` (82 L)
- `ETCS-master/EVC/Packets/15.h` (80 L)
- `ETCS-master/EVC/Packets/packets.h` (80 L)
- `ETCS-master/EVC/Packets/vbc.cpp` (80 L)
- `ETCS-master/EVC/Packets/72.h` (63 L)
- `ETCS-master/EVC/Packets/51.h` (62 L)
- `ETCS-master/EVC/Packets/27.h` (61 L)
- `ETCS-master/EVC/Packets/76.h` (58 L)
- `ETCS-master/EVC/Packets/70.h` (53 L)
- `ETCS-master/EVC/Packets/52.h` (50 L)
- `ETCS-master/EVC/Packets/69.h` (47 L)
- `ETCS-master/EVC/Packets/79.h` (46 L)
- `ETCS-master/EVC/Packets/68.h` (45 L)
- `ETCS-master/EVC/Packets/80.h` (45 L)
- `ETCS-master/EVC/Packets/5.h` (44 L)
- `ETCS-master/EVC/Packets/41.h` (41 L)
- `ETCS-master/EVC/Packets/etcs_information.h` (41 L)
- `ETCS-master/EVC/Packets/logging.cpp` (40 L)
- `ETCS-master/EVC/Packets/58.h` (39 L)
- `ETCS-master/EVC/Packets/21.h` (36 L)
- `ETCS-master/EVC/Packets/46.h` (36 L)
- `ETCS-master/EVC/Packets/67.h` (36 L)
- `ETCS-master/EVC/Packets/88.h` (35 L)
- `ETCS-master/EVC/Packets/49.h` (32 L)
- `ETCS-master/EVC/Packets/63.h` (32 L)
- `ETCS-master/EVC/Packets/133.h` (30 L)
- `ETCS-master/EVC/Packets/65.h` (26 L)
- `ETCS-master/EVC/Packets/42.h` (25 L)
- `ETCS-master/EVC/Packets/131.h` (24 L)
- `ETCS-master/EVC/Packets/44.h` (24 L)
- `ETCS-master/EVC/Packets/vbc.h` (24 L)
- `ETCS-master/EVC/Packets/39.h` (23 L)
- `ETCS-master/EVC/Packets/143.h` (22 L)
- `ETCS-master/EVC/Packets/71.h` (21 L)
- `ETCS-master/EVC/Packets/6.h` (20 L)
- `ETCS-master/EVC/Packets/40.h` (19 L)
- `ETCS-master/EVC/Packets/57.h` (19 L)
- `ETCS-master/EVC/Packets/90.h` (19 L)
- `ETCS-master/EVC/Packets/136.h` (18 L)
- `ETCS-master/EVC/Packets/138.h` (18 L)
- `ETCS-master/EVC/Packets/139.h` (18 L)
- `ETCS-master/EVC/Packets/66.h` (18 L)
- `ETCS-master/EVC/Packets/180.h` (17 L)
- `ETCS-master/EVC/Packets/45.h` (17 L)
- `ETCS-master/EVC/Packets/132.h` (16 L)
- `ETCS-master/EVC/Packets/140.h` (15 L)
- `ETCS-master/EVC/Packets/141.h` (15 L)
- `ETCS-master/EVC/Packets/16.h` (15 L)
- `ETCS-master/EVC/Packets/137.h` (14 L)
- `ETCS-master/EVC/Packets/2.h` (14 L)
- `ETCS-master/EVC/Packets/logging.h` (14 L)
- `ETCS-master/EVC/Packets/64.h` (13 L)
- `ETCS-master/EVC/Packets/181.h` (12 L)
- `ETCS-master/EVC/Packets/254.h` (12 L)
- `ETCS-master/EVC/Packets/0.h` (11 L)

### `ETCS-master/EVC/Position/` — 1,017 L

- `ETCS-master/EVC/Position/linking.cpp` (495 L)
- `ETCS-master/EVC/Position/distance.cpp` (219 L)
- `ETCS-master/EVC/Position/distance.h` (158 L)
- `ETCS-master/EVC/Position/geographical.cpp` (56 L)
- `ETCS-master/EVC/Position/linking.h` (54 L)
- `ETCS-master/EVC/Position/geographical.h` (35 L)

### `ETCS-master/EVC/Procedures/` — 1,668 L

- `ETCS-master/EVC/Procedures/mode_transition.cpp` (571 L)
- `ETCS-master/EVC/Procedures/level_transition.cpp` (293 L)
- `ETCS-master/EVC/Procedures/start.cpp` (232 L)
- `ETCS-master/EVC/Procedures/train_trip.cpp` (92 L)
- `ETCS-master/EVC/Procedures/override.cpp` (84 L)
- `ETCS-master/EVC/Procedures/stored_information.cpp` (79 L)
- `ETCS-master/EVC/Procedures/mode_transition.h` (77 L)
- `ETCS-master/EVC/Procedures/level_transition.h` (60 L)
- `ETCS-master/EVC/Procedures/start.h` (56 L)
- `ETCS-master/EVC/Procedures/reversing.cpp` (32 L)
- `ETCS-master/EVC/Procedures/reversing.h` (27 L)
- `ETCS-master/EVC/Procedures/procedures.h` (22 L)
- `ETCS-master/EVC/Procedures/override.h` (17 L)
- `ETCS-master/EVC/Procedures/train_trip.h` (14 L)
- `ETCS-master/EVC/Procedures/stored_information.h` (12 L)

### `ETCS-master/EVC/SSP/` — 88 L

- `ETCS-master/EVC/SSP/ssp.h` (48 L)
- `ETCS-master/EVC/SSP/ssp.cpp` (40 L)

### `ETCS-master/EVC/STM/` — 948 L

- `ETCS-master/EVC/STM/stm.cpp` (802 L)
- `ETCS-master/EVC/STM/stm.h` (125 L)
- `ETCS-master/EVC/STM/stm_state.h` (21 L)

### `ETCS-master/EVC/Supervision/` — 3,123 L

- `ETCS-master/EVC/Supervision/supervision.cpp` (628 L)
- `ETCS-master/EVC/Supervision/targets.cpp` (378 L)
- `ETCS-master/EVC/Supervision/conversion_model.cpp` (375 L)
- `ETCS-master/EVC/Supervision/speed_profile.cpp` (347 L)
- `ETCS-master/EVC/Supervision/national_values.cpp` (249 L)
- `ETCS-master/EVC/Supervision/train_data.cpp` (127 L)
- `ETCS-master/EVC/Supervision/speed_profile.h` (113 L)
- `ETCS-master/EVC/Supervision/curve_calc.cpp` (108 L)
- `ETCS-master/EVC/Supervision/targets.h` (98 L)
- `ETCS-master/EVC/Supervision/sb_feedback.cpp` (89 L)
- `ETCS-master/EVC/Supervision/national_values.h` (82 L)
- `ETCS-master/EVC/Supervision/train_data.h` (79 L)
- `ETCS-master/EVC/Supervision/common.h` (58 L)
- `ETCS-master/EVC/Supervision/track_pbd.h` (56 L)
- `ETCS-master/EVC/Supervision/fixed_values.cpp` (48 L)
- `ETCS-master/EVC/Supervision/fixed_values.h` (47 L)
- `ETCS-master/EVC/Supervision/conversion_model.h` (38 L)
- `ETCS-master/EVC/Supervision/supervision.h` (37 L)
- `ETCS-master/EVC/Supervision/acceleration.h` (32 L)
- `ETCS-master/EVC/Supervision/emergency_stop.cpp` (31 L)
- `ETCS-master/EVC/Supervision/acceleration.cpp` (26 L)
- `ETCS-master/EVC/Supervision/emergency_stop.h` (16 L)
- `ETCS-master/EVC/Supervision/supervision_targets.h` (14 L)
- `ETCS-master/EVC/Supervision/curve_calc.h` (12 L)
- `ETCS-master/EVC/Supervision/locomotive_data.cpp` (12 L)
- `ETCS-master/EVC/Supervision/locomotive_data.h` (12 L)
- `ETCS-master/EVC/Supervision/sb_feedback.h` (11 L)

### `ETCS-master/EVC/Time/` — 43 L

- `ETCS-master/EVC/Time/clock.cpp` (25 L)
- `ETCS-master/EVC/Time/clock.h` (18 L)

### `ETCS-master/EVC/TrackConditions/` — 780 L

- `ETCS-master/EVC/TrackConditions/track_conditions.cpp` (516 L)
- `ETCS-master/EVC/TrackConditions/track_condition.h` (166 L)
- `ETCS-master/EVC/TrackConditions/route_suitability.cpp` (84 L)
- `ETCS-master/EVC/TrackConditions/route_suitability.h` (14 L)

### `ETCS-master/EVC/TrainSubsystems/` — 664 L

- `ETCS-master/EVC/TrainSubsystems/train_interface.cpp` (209 L)
- `ETCS-master/EVC/TrainSubsystems/brake.cpp` (189 L)
- `ETCS-master/EVC/TrainSubsystems/cold_movement.cpp` (63 L)
- `ETCS-master/EVC/TrainSubsystems/asc.cpp` (40 L)
- `ETCS-master/EVC/TrainSubsystems/train_interface.h` (39 L)
- `ETCS-master/EVC/TrainSubsystems/power.h` (32 L)
- `ETCS-master/EVC/TrainSubsystems/power.cpp` (29 L)
- `ETCS-master/EVC/TrainSubsystems/brake.h` (21 L)
- `ETCS-master/EVC/TrainSubsystems/cold_movement.h` (21 L)
- `ETCS-master/EVC/TrainSubsystems/subsystems.h` (18 L)
- `ETCS-master/EVC/TrainSubsystems/asc.h` (3 L)

### `ETCS-master/EVC/Version/` — 508 L

- `ETCS-master/EVC/Version/translate.cpp` (437 L)
- `ETCS-master/EVC/Version/version.cpp` (40 L)
- `ETCS-master/EVC/Version/version.h` (17 L)
- `ETCS-master/EVC/Version/translate.h` (14 L)

### `ETCS-master/include/nlohmann/` — 24,596 L

- `ETCS-master/include/nlohmann/json.hpp` (24596 L)

### `ETCS-master/platform/sdl_gfx/` — 883 L

- `ETCS-master/platform/sdl_gfx/gfx_primitives.cpp` (861 L)
- `ETCS-master/platform/sdl_gfx/gfx_primitives.h` (22 L)

### `ETCS-master/platform/stb/` — 7,990 L

- `ETCS-master/platform/stb/stb_image.h` (7987 L)
- `ETCS-master/platform/stb/stb.c` (3 L)

### `nexus-agent/src/brake/` — 2,641 L
- **← desde:** `nexus-agent/src/`

- `nexus-agent/src/brake/planBrake.ts` (918 L)
- `nexus-agent/src/brake/planBrake.test.ts` (479 L)
- `nexus-agent/src/brake/stationBrake.test.ts` (289 L)
- `nexus-agent/src/brake/planBrake.golden.test.ts` (242 L)
- `nexus-agent/src/brake/types.ts` (123 L)
- `nexus-agent/src/brake/agentConfig.ts` (107 L)
- `nexus-agent/src/brake/signalBrake.test.ts` (83 L)
- `nexus-agent/src/brake/brakeLearning.ts` (82 L)
- `nexus-agent/src/brake/schedule.ts` (82 L)
- `nexus-agent/src/brake/physics.ts` (77 L)
- `nexus-agent/src/brake/brakeLearning.test.ts` (60 L)
- `nexus-agent/src/brake/brakeStats.ts` (37 L)
- `nexus-agent/src/brake/brakeStats.test.ts` (33 L)
- `nexus-agent/src/brake/agentConfig.test.ts` (25 L)
- `nexus-agent/src/brake/signalUtils.ts` (4 L)

### `nexus-agent/src/command/` — 1,052 L
- **← desde:** `nexus-agent/src/`

- `nexus-agent/src/command/commandBus.test.ts` (649 L)
- `nexus-agent/src/command/commandBus.ts` (403 L)

### `nexus-kernel/src/normalizers/` — 455 L
- **← desde:** `nexus-kernel/src/`

- `nexus-kernel/src/normalizers/PhysicsNormalizer.ts` (169 L)
- `nexus-kernel/src/normalizers/BrakeNormalizer.ts` (141 L)
- `nexus-kernel/src/normalizers/SignalingNormalizer.ts` (128 L)
- `nexus-kernel/src/normalizers/Constants.ts` (17 L)

### `nexus-kernel/src/tail/` — 175 L

- `nexus-kernel/src/tail/tailProtectionUtils.ts` (136 L)
- `nexus-kernel/src/tail/TailProtectionService.ts` (39 L)

### `nexus-kernel/src/tests/` — 469 L

- `nexus-kernel/src/tests/normalize.test.ts` (297 L)
- `nexus-kernel/src/tests/inferActiveCab.test.ts` (74 L)
- `nexus-kernel/src/tests/limitUtils.test.ts` (59 L)
- `nexus-kernel/src/tests/safety.test.ts` (39 L)

### `profiles/nexus/genres/` — 117 L

- `profiles/nexus/genres/passenger.json` (59 L)
- `profiles/nexus/genres/high_speed_express.json` (33 L)
- `profiles/nexus/genres/regional_commuter.json` (25 L)

### `profiles/nexus/trains/` — 176 L

- `profiles/nexus/trains/icet.json` (94 L)
- `profiles/nexus/trains/class323.json` (82 L)

### `Dastsc-V3/src/v3/bootstrap/` — 35 L
- **← desde:** `Dastsc-V3/src/`

- `Dastsc-V3/src/v3/bootstrap/mountApp.tsx` (15 L)
- `Dastsc-V3/src/v3/bootstrap/AppProviders.tsx` (11 L)
- `Dastsc-V3/src/v3/bootstrap/appMountUtils.ts` (9 L)

### `Dastsc-V3/src/v3/core/` — 1,087 L
- **→ hacia:** `Dastsc-V3/src/v3/core/normalizers/`
- **← desde:** `Dastsc-V3/src/`

- `Dastsc-V3/src/v3/core/dataNormalizerUtils.ts` (383 L)
- `Dastsc-V3/src/v3/core/TelemetryContext.tsx` (382 L)
- `Dastsc-V3/src/v3/core/DataNormalizer.ts` (243 L)
- `Dastsc-V3/src/v3/core/telemetryHubUtils.ts` (79 L)

### `Dastsc-V3/src/v3/hooks/` — 673 L

- `Dastsc-V3/src/v3/hooks/brakeLearningUtils.ts` (243 L)
- `Dastsc-V3/src/v3/hooks/telemetrySmoothingUtils.ts` (113 L)
- `Dastsc-V3/src/v3/hooks/useSmoothValue.ts` (108 L)
- `Dastsc-V3/src/v3/hooks/useBrakeLearning.ts` (85 L)
- `Dastsc-V3/src/v3/hooks/smoothValueUtils.ts` (52 L)
- `Dastsc-V3/src/v3/hooks/useTelemetrySmoothing.ts` (44 L)
- `Dastsc-V3/src/v3/hooks/useBrakeStats.ts` (28 L)

### `Dastsc-V3/src/v3/services/` — 175 L

- `Dastsc-V3/src/v3/services/tailProtectionUtils.ts` (136 L)
- `Dastsc-V3/src/v3/services/TailProtectionService.ts` (39 L)

### `docs/debug/semana-01-lua-ipc/sesiones/` — 51 L

- `docs/debug/semana-01-lua-ipc/sesiones/2026-08-08.md` (51 L)

### `docs/debug/semana-02-telemetria-kernel/sesiones/` — 55 L

- `docs/debug/semana-02-telemetria-kernel/sesiones/2026-08-09.md` (55 L)

### `ETCS-master/app/src/main/` — 69 L

- `ETCS-master/app/src/main/AndroidManifest.xml` (69 L)

### `ETCS-master/EVC/Packets/io/` — 341 L

- `ETCS-master/EVC/Packets/io/base64.cpp` (286 L)
- `ETCS-master/EVC/Packets/io/base64.h` (35 L)
- `ETCS-master/EVC/Packets/io/io.cpp` (20 L)

### `ETCS-master/EVC/Packets/STM/` — 1,199 L

- `ETCS-master/EVC/Packets/STM/stm_variables.h` (392 L)
- `ETCS-master/EVC/Packets/STM/message.cpp` (81 L)
- `ETCS-master/EVC/Packets/STM/179.h` (60 L)
- `ETCS-master/EVC/Packets/STM/46.h` (46 L)
- `ETCS-master/EVC/Packets/STM/175.h` (45 L)
- `ETCS-master/EVC/Packets/STM/183.h` (44 L)
- `ETCS-master/EVC/Packets/STM/43.h` (44 L)
- `ETCS-master/EVC/Packets/STM/32.h` (41 L)
- `ETCS-master/EVC/Packets/STM/35.h` (40 L)
- `ETCS-master/EVC/Packets/STM/180.h` (39 L)
- `ETCS-master/EVC/Packets/STM/34.h` (35 L)
- `ETCS-master/EVC/Packets/STM/message.h` (31 L)
- `ETCS-master/EVC/Packets/STM/38.h` (25 L)
- `ETCS-master/EVC/Packets/STM/5.h` (22 L)
- `ETCS-master/EVC/Packets/STM/1.h` (19 L)
- `ETCS-master/EVC/Packets/STM/129.h` (19 L)
- `ETCS-master/EVC/Packets/STM/130.h` (19 L)
- `ETCS-master/EVC/Packets/STM/14.h` (17 L)
- `ETCS-master/EVC/Packets/STM/184.h` (17 L)
- `ETCS-master/EVC/Packets/STM/30.h` (17 L)
- `ETCS-master/EVC/Packets/STM/7.h` (16 L)
- `ETCS-master/EVC/Packets/STM/128.h` (15 L)
- `ETCS-master/EVC/Packets/STM/17.h` (15 L)
- `ETCS-master/EVC/Packets/STM/182.h` (15 L)
- `ETCS-master/EVC/Packets/STM/13.h` (13 L)
- `ETCS-master/EVC/Packets/STM/15.h` (13 L)
- `ETCS-master/EVC/Packets/STM/16.h` (13 L)
- `ETCS-master/EVC/Packets/STM/181.h` (13 L)
- `ETCS-master/EVC/Packets/STM/39.h` (13 L)
- `ETCS-master/EVC/Packets/STM/18.h` (10 L)
- `ETCS-master/EVC/Packets/STM/6.h` (10 L)

### `ETCS-master/EVC/Packets/TrainToTrack/` — 236 L

- `ETCS-master/EVC/Packets/TrainToTrack/11.h` (53 L)
- `ETCS-master/EVC/Packets/TrainToTrack/1.h` (52 L)
- `ETCS-master/EVC/Packets/TrainToTrack/0.h` (50 L)
- `ETCS-master/EVC/Packets/TrainToTrack/2.h` (27 L)
- `ETCS-master/EVC/Packets/TrainToTrack/4.h` (18 L)
- `ETCS-master/EVC/Packets/TrainToTrack/5.h` (18 L)
- `ETCS-master/EVC/Packets/TrainToTrack/9.h` (18 L)

### `ETCS-master/EVC/Packets/V1/` — 473 L

- `ETCS-master/EVC/Packets/V1/variables.h` (67 L)
- `ETCS-master/EVC/Packets/V1/51.h` (65 L)
- `ETCS-master/EVC/Packets/V1/3.h` (62 L)
- `ETCS-master/EVC/Packets/V1/27.h` (57 L)
- `ETCS-master/EVC/Packets/V1/203.h` (55 L)
- `ETCS-master/EVC/Packets/V1/79.h` (49 L)
- `ETCS-master/EVC/Packets/V1/80.h` (46 L)
- `ETCS-master/EVC/Packets/V1/72.h` (35 L)
- `ETCS-master/EVC/Packets/V1/39.h` (21 L)
- `ETCS-master/EVC/Packets/V1/200.h` (16 L)

### `ETCS-master/EVC/TrainData/DB/` — 348 L

- `ETCS-master/EVC/TrainData/DB/traindata_406.json` (184 L)
- `ETCS-master/EVC/TrainData/DB/traindata_403.json` (164 L)

### `ETCS-master/EVC/TrainData/France/` — 180 L

- `ETCS-master/EVC/TrainData/France/traindata_tgv.json` (180 L)

### `ETCS-master/EVC/TrainData/Italy/` — 448 L

- `ETCS-master/EVC/TrainData/Italy/traindata_ETR1000.json` (172 L)
- `ETCS-master/EVC/TrainData/Italy/traindata_agv.json` (138 L)
- `ETCS-master/EVC/TrainData/Italy/traindata_agvI.json` (138 L)

### `ETCS-master/EVC/TrainData/SimRail/` — 477 L

- `ETCS-master/EVC/TrainData/SimRail/E186.json` (84 L)
- `ETCS-master/EVC/TrainData/SimRail/E6ACTad.json` (84 L)
- `ETCS-master/EVC/TrainData/SimRail/ED250.json` (84 L)
- `ETCS-master/EVC/TrainData/SimRail/F160.json` (84 L)
- `ETCS-master/EVC/TrainData/SimRail/36wed.json` (76 L)
- `ETCS-master/EVC/TrainData/SimRail/pendolino.json` (65 L)

### `ETCS-master/EVC/TrainData/Spain/` — 7,235 L

- `ETCS-master/EVC/TrainData/Spain/traindata_465.json` (530 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_CiviaA.json` (530 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_105.json` (482 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_109.json` (446 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_CiviaC.json` (266 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_100.json` (242 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_102.json` (236 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_112.json` (236 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_730.json` (236 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_130.json` (233 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_104.json` (224 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_114.json` (224 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_490.json` (218 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_451.json` (200 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_106.json` (167 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_107.json` (167 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_108.json` (162 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_103.json` (160 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_1126.json` (158 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_1127.json` (158 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_1302.json` (150 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_120.json` (146 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_121.json` (146 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_kiss.json` (146 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_355.json` (144 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_355c.json` (144 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_449.json` (142 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_446.json` (134 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_447.json` (134 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_450.json` (134 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_599.json` (132 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_162.json` (85 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_1305.json` (82 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_102adif.json` (80 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_16212.json` (73 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_470.json` (58 L)
- `ETCS-master/EVC/TrainData/Spain/traindata_448.json` (30 L)

### `Dastsc-V3/src/v3/components/display/` — 1,895 L

- `Dastsc-V3/src/v3/components/display/BrakingCurve.tsx` (588 L)
- `Dastsc-V3/src/v3/components/display/brakingCurveUtils.ts` (354 L)
- `Dastsc-V3/src/v3/components/display/trackProfileUtils.ts` (268 L)
- `Dastsc-V3/src/v3/components/display/speedometerUtils.ts` (215 L)
- `Dastsc-V3/src/v3/components/display/Speedometer.tsx` (176 L)
- `Dastsc-V3/src/v3/components/display/ProfileSelector.tsx` (156 L)
- `Dastsc-V3/src/v3/components/display/CanvasLayer.tsx` (82 L)
- `Dastsc-V3/src/v3/components/display/TrackProfile.tsx` (56 L)

### `Dastsc-V3/src/v3/components/shell/` — 417 L
- **← desde:** `Dastsc-V3/src/`

- `Dastsc-V3/src/v3/components/shell/appUtils.ts` (56 L)
- `Dastsc-V3/src/v3/components/shell/SafetyIndicators.tsx` (55 L)
- `Dastsc-V3/src/v3/components/shell/AdaptiveTelemetryPanel.tsx` (43 L)
- `Dastsc-V3/src/v3/components/shell/PilotHudTab.tsx` (41 L)
- `Dastsc-V3/src/v3/components/shell/PilotInfoBar.tsx` (40 L)
- `Dastsc-V3/src/v3/components/shell/PhysicsHubPanel.tsx` (39 L)
- `Dastsc-V3/src/v3/components/shell/ConfigTab.tsx` (37 L)
- `Dastsc-V3/src/v3/components/shell/UiPrimitives.tsx` (37 L)
- `Dastsc-V3/src/v3/components/shell/AppHeader.tsx` (36 L)
- `Dastsc-V3/src/v3/components/shell/AppTabBar.tsx` (33 L)

### `Dastsc-V3/src/v3/core/normalizers/` — 457 L
- **← desde:** `Dastsc-V3/src/v3/core/`

- `Dastsc-V3/src/v3/core/normalizers/PhysicsNormalizer.ts` (169 L)
- `Dastsc-V3/src/v3/core/normalizers/BrakeNormalizer.ts` (141 L)
- `Dastsc-V3/src/v3/core/normalizers/SignalingNormalizer.ts` (130 L)
- `Dastsc-V3/src/v3/core/normalizers/Constants.ts` (17 L)

### `ETCS-master/app/src/main/assets/` — 7 L

- `ETCS-master/app/src/main/assets/settings.ini` (7 L)
- `ETCS-master/app/src/main/assets/config.json` (0 L)
- `ETCS-master/app/src/main/assets/stm_bombardier.json` (0 L)
- `ETCS-master/app/src/main/assets/stm_siemens.json` (0 L)
- `ETCS-master/app/src/main/assets/stm_windows.json` (0 L)

### `ETCS-master/EVC/Packets/TrainToTrack/V1/` — 66 L

- `ETCS-master/EVC/Packets/TrainToTrack/V1/11.h` (39 L)
- `ETCS-master/EVC/Packets/TrainToTrack/V1/3.h` (27 L)

### `ETCS-master/app/src/main/res/values/` — 17 L

- `ETCS-master/app/src/main/res/values/styles.xml` (8 L)
- `ETCS-master/app/src/main/res/values/colors.xml` (6 L)
- `ETCS-master/app/src/main/res/values/strings.xml` (3 L)

### `ETCS-master/app/src/main/java/com/etcs/dmi/` — 143 L

- `ETCS-master/app/src/main/java/com/etcs/dmi/DMI.java` (125 L)
- `ETCS-master/app/src/main/java/com/etcs/dmi/EVC.java` (18 L)

### `ETCS-master/app/src/main/java/org/libsdl/app/` — 5,664 L

- `ETCS-master/app/src/main/java/org/libsdl/app/SDLActivity.java` (2120 L)
- `ETCS-master/app/src/main/java/org/libsdl/app/SDLControllerManager.java` (856 L)
- `ETCS-master/app/src/main/java/org/libsdl/app/HIDDeviceManager.java` (698 L)
- `ETCS-master/app/src/main/java/org/libsdl/app/HIDDeviceBLESteamController.java` (650 L)
- `ETCS-master/app/src/main/java/org/libsdl/app/SDLAudioManager.java` (514 L)
- `ETCS-master/app/src/main/java/org/libsdl/app/SDLSurface.java` (405 L)
- `ETCS-master/app/src/main/java/org/libsdl/app/HIDDeviceUSB.java` (309 L)
- `ETCS-master/app/src/main/java/org/libsdl/app/SDL.java` (90 L)
- `ETCS-master/app/src/main/java/org/libsdl/app/HIDDevice.java` (22 L)
