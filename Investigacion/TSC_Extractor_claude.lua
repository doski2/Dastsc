-- ============================================================
--  TSC_Extractor.lua
--  Extractor de Paradas y Métricas - Train Simulator Classic
--  Autor: Generado para diagnóstico
--  Uso: Colocar en la cabina del engine o como script de escenario
-- ============================================================

local LOG_FILE    = "TSC_Extractor_Log.txt"
local LOG_ENABLED = true
local UPDATE_INTERVAL = 2.0   -- segundos entre cada lectura

local _timer      = 0
local _logHandle  = nil
local _iteration  = 0

-- ============================================================
--  UTILIDADES DE LOG
-- ============================================================

local function openLog()
    if LOG_ENABLED then
        _logHandle = io.open(LOG_FILE, "w")
        if _logHandle then
            _logHandle:write("============================================================\n")
            _logHandle:write("  TSC EXTRACTOR LOG - " .. os.date("%Y-%m-%d %H:%M:%S") .. "\n")
            _logHandle:write("============================================================\n\n")
            _logHandle:flush()
        end
    end
end

local function log(msg)
    local line = "[" .. string.format("%06d", _iteration) .. "] " .. msg
    print(line)
    if _logHandle then
        _logHandle:write(line .. "\n")
        _logHandle:flush()
    end
end

local function logSection(title)
    local sep = "--- " .. title .. " " .. string.rep("-", 40 - #title)
    log(sep)
end

-- ============================================================
--  LLAMADAS SEGURAS (evita crash si la SysCall no existe)
-- ============================================================

local function safeSysCall(name, ...)
    local ok, result = pcall(SysCall, name, ...)
    if ok then
        return result
    else
        return nil, "ERROR: " .. tostring(result)
    end
end

-- ============================================================
--  BLOQUE 1: SCENARIO MANAGER - TARGETS / PARADAS
-- ============================================================

local function extractScenarioTargets()
    logSection("ScenarioManager Targets")

    -- Número de targets / paradas
    local numTargets, err = safeSysCall("ScenarioManager::GetTargetCount")
    log("GetTargetCount          = " .. tostring(numTargets) .. (err and (" | " .. err) or ""))

    -- Objetivo actual
    local currentTarget, err2 = safeSysCall("ScenarioManager::GetCurrentTarget")
    log("GetCurrentTarget        = " .. tostring(currentTarget) .. (err2 and (" | " .. err2) or ""))

    -- Distancia al siguiente stop
    local distNext, err3 = safeSysCall("ScenarioManager::GetDistanceToNextStop")
    log("GetDistanceToNextStop   = " .. tostring(distNext) .. (err3 and (" | " .. err3) or ""))

    -- Iterar por índice si hay targets
    local count = tonumber(numTargets) or 5  -- probar al menos 5 slots
    for i = 0, count - 1 do
        log("  [Target " .. i .. "]")

        local name  = safeSysCall("ScenarioManager::GetTargetName",     i)
        local dist  = safeSysCall("ScenarioManager::GetTargetDistance", i)
        local state = safeSysCall("ScenarioManager::GetTargetState",    i)
        local time  = safeSysCall("ScenarioManager::GetTargetTime",     i)
        local sched = safeSysCall("ScenarioManager::GetTargetScheduledTime", i)

        log("    Name      = " .. tostring(name))
        log("    Distance  = " .. tostring(dist))
        log("    State     = " .. tostring(state))
        log("    Time      = " .. tostring(time))
        log("    Scheduled = " .. tostring(sched))
    end
end

-- ============================================================
--  BLOQUE 2: PARADAS - LLAMADAS ALTERNATIVAS
-- ============================================================

local function extractStopAlternatives()
    logSection("Stop Alternatives")

    local calls = {
        "ScenarioManager::GetNextStopName",
        "ScenarioManager::GetNextStopDistance",
        "ScenarioManager::GetNextTarget",
        "ScenarioManager::GetStationName",
        "ScenarioManager::GetStationDistance",
        "ScenarioManager::GetCurrentStopName",
        "ScenarioManager::GetPassengerStopName",
        "ScenarioManager::GetObjectiveName",
        "ScenarioManager::GetObjectiveDistance",
    }

    for _, callName in ipairs(calls) do
        local result, err = safeSysCall(callName)
        log(string.format("  %-50s = %s", callName, tostring(result) .. (err and (" | " .. err) or "")))
    end
end

-- ============================================================
--  BLOQUE 3: TRAIN / ENGINE INFO
-- ============================================================

local function extractTrainInfo()
    logSection("Train / Engine Info")

    local calls = {
        {"ScenarioManager::GetSpeed",                nil},
        {"ScenarioManager::GetPlayerTrainSpeed",     nil},
        {"ScenarioManager::GetDistanceTravelled",    nil},
        {"ScenarioManager::GetTotalDistance",        nil},
        {"ScenarioManager::GetMilepost",             nil},
        {"Train::GetSpeed",                          nil},
        {"Train::GetDistanceTravelled",              nil},
    }

    for _, entry in ipairs(calls) do
        local result, err = safeSysCall(entry[1])
        log(string.format("  %-50s = %s", entry[1], tostring(result) .. (err and (" | " .. err) or "")))
    end
end

-- ============================================================
--  BLOQUE 4: SCENARIO PROPERTIES GENERALES
-- ============================================================

local function extractScenarioProperties()
    logSection("Scenario Properties")

    local calls = {
        "ScenarioManager::GetScenarioName",
        "ScenarioManager::GetRouteName",
        "ScenarioManager::GetCurrentTime",
        "ScenarioManager::GetElapsedTime",
        "ScenarioManager::GetScore",
        "ScenarioManager::GetMaxScore",
        "ScenarioManager::GetWeather",
    }

    for _, callName in ipairs(calls) do
        local result, err = safeSysCall(callName)
        log(string.format("  %-50s = %s", callName, tostring(result) .. (err and (" | " .. err) or "")))
    end
end

-- ============================================================
--  BLOQUE 5: PROBAR NAMESPACES ALTERNATIVOS
-- ============================================================

local function extractAlternativeNamespaces()
    logSection("Alternative Namespaces (brute-force)")

    local prefixes = {
        "PlayerTrain",
        "Scenario",
        "RailDriver",
        "Loco",
        "Consist",
    }
    local methods = {
        "GetStopName", "GetStationName", "GetNextStop",
        "GetDistance", "GetSpeed", "GetName",
    }

    for _, prefix in ipairs(prefixes) do
        for _, method in ipairs(methods) do
            local callName = prefix .. "::" .. method
            local result, err = safeSysCall(callName)
            if result ~= nil then
                -- Solo loggear si devuelve ALGO (filtrar nulos)
                log("  [HIT] " .. callName .. " = " .. tostring(result))
            end
        end
    end
end

-- ============================================================
--  CICLO PRINCIPAL
-- ============================================================

function Initialise()
    openLog()
    log("=== INICIALIZANDO TSC EXTRACTOR ===")
    log("Intervalo de muestreo: " .. UPDATE_INTERVAL .. "s")
    log("")

    -- Primera extracción al arrancar
    extractScenarioProperties()
    extractScenarioTargets()
    extractStopAlternatives()
    extractTrainInfo()
    extractAlternativeNamespaces()

    log("")
    log("=== INIT COMPLETO - Comenzando ciclo de update ===\n")
end

function Update(dt)
    _timer = _timer + dt

    if _timer >= UPDATE_INTERVAL then
        _timer = 0
        _iteration = _iteration + 1

        log("\n>>> UPDATE #" .. _iteration .. " | dt=" .. string.format("%.3f", dt) .. "s")

        -- En updates solo refrescar valores dinámicos
        logSection("Dynamic Values")

        local speed  = safeSysCall("ScenarioManager::GetDistanceToNextStop")
        local dist   = safeSysCall("ScenarioManager::GetDistanceTravelled")
        local target = safeSysCall("ScenarioManager::GetCurrentTarget")
        local tname  = safeSysCall("ScenarioManager::GetTargetName", tonumber(target) or 0)
        local tdist  = safeSysCall("ScenarioManager::GetTargetDistance", tonumber(target) or 0)
        local tstate = safeSysCall("ScenarioManager::GetTargetState", tonumber(target) or 0)

        log("  DistToNextStop   = " .. tostring(speed))
        log("  DistTravelled    = " .. tostring(dist))
        log("  CurrentTarget    = " .. tostring(target))
        log("  TargetName       = " .. tostring(tname))
        log("  TargetDistance   = " .. tostring(tdist))
        log("  TargetState      = " .. tostring(tstate))
    end
end

-- Cierre limpio (si el entorno lo soporta)
function Shutdown()
    log("\n=== SHUTDOWN - Cerrando log ===")
    if _logHandle then
        _logHandle:close()
    end
end
