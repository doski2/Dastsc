-- Variables de control
local lastLogTime = 0
local logInterval = 1.0 -- Loguear cada 1 segundo

function OnScenarioUpdate(time)
    -- Control de tiempo para no saturar el procesador
    if (time > lastLogTime + logInterval) then
        lastLogTime = time
        
        -- 1. Intentar extraer distancia a la próxima parada
        -- Devuelve la distancia en metros
        local distance = SysCall("ScenarioManager:GetDistanceToNextStop")
        
        -- 2. Intentar obtener el nombre de la próxima parada
        -- Nota: No siempre está disponible en todas las rutas, depende de los marcadores
        local nextStop = SysCall("ScenarioManager:GetNextStopName")
        
        -- 3. Obtener estado del reloj del escenario
        local gameTime = SysCall("ScenarioManager:GetTime")
        
        -- 4. Formatear el mensaje
        local logMsg = string.format("Time: %.2f | Stop: %s | Distance: %.2f m", 
                                     gameTime, 
                                     nextStop or "Desconocida", 
                                     distance)
        
        -- 5. Escribir al log y a la consola de debug del juego
        PrintLog(logMsg)
        
        -- 6. OPCIONAL: Enviar estos datos al Engine (si tu extractor lee el .lua de la locomotora)
        -- Esto envía la distancia al ControlValue "NextStopDistance" de la locomotora
        SysCall("PlayerEngine:SendMessage", "UpdateDistance", distance, 0)
    end
end

-- Función para escribir en un archivo físico
function PrintLog(message)
    -- El archivo se creará en la carpeta principal de RailWorks (Train Simulator)
    local file = io.open("TSC_Metrics_Log.txt", "a")
    if file then
        file:write(os.date("%Y-%m-%d %H:%M:%S") .. " [INFO] " .. message .. "\n")
        file:close()
    end
    -- También lo mostramos en la consola LogMate (si la tienes abierta)
    Print(message)
end

function OnScenarioStart()
    PrintLog("--- Inicio de Escenario: Extracción Activada ---")
end