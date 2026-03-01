-- station_extractor.lua
-- Script para extraer información de paradas en TSC

local logFile = "C:/Temp/tsc_stations.log" -- Cambia la ruta según tu sistema
local stations = {}

-- Función para escribir en el log
local function writeLog(message)
    local f = io.open(logFile, "a")
    if f then
        f:write(os.date("%Y-%m-%d %H:%M:%S") .. " - " .. message .. "\n")
        f:close()
    end
end

-- Función para extraer información de paradas
local function extractStations()
    writeLog("Iniciando extracción de paradas...")

    -- Intenta obtener el número de paradas en la ruta
    local numStations = Call("GetNumberOfStations")
    if numStations and numStations > 0 then
        writeLog(string.format("Número de paradas detectadas: %d", numStations))
        for i = 0, numStations-1 do
            local name = Call("GetStationName", i)
            local distance = Call("GetStationDistance", i)
            if name and distance then
                local stationInfo = string.format("Parada %d: %s (Distancia: %.2f m)", i, name, distance)
                writeLog(stationInfo)
                table.insert(stations, {index = i, name = name, distance = distance})
            end
        end
    else
        writeLog("No se pudieron detectar paradas con las funciones estándar.")
    end
end

-- Evento: Al iniciar el escenario
function OnInit()
    writeLog("Script de extracción de paradas iniciado.")
    extractStations()
end

-- Evento: Al pasar por una estación
function OnStationPassed(stationIndex)
    if stations[stationIndex+1] then
        local info = string.format("PASANDO POR: %s (Distancia: %.2f m)", stations[stationIndex+1].name, stations[stationIndex+1].distance)
        writeLog(info)
    end
end

-- Evento: Al detenerse en una estación
function OnStationStop(stationIndex)
    if stations[stationIndex+1] then
        local info = string.format("DETENIDO EN: %s (Distancia: %.2f m)", stations[stationIndex+1].name, stations[stationIndex+1].distance)
        writeLog(info)
    end
end

writeLog("Script de extracción de paradas cargado.")
