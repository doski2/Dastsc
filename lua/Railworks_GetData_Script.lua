-- Place this file in your railworks plugins folder
-- Usually C:\Program Files (x86)\Steam\steamapps\common\railworks\plugins (for 64 bit windows)
-- or C:\Program Files\Steam\steamapps\common\railworks\plugins (for 32 bit windows)

--The command used to check if a certain control exists or not and if it does
-- retreive its value is:-

-- if Call("*:ControlExists", Name of control, 0) == 1 then
-- variable = Call( "*:GetControlValue", Name of control, 0 )
--end

--This code block as you will see is used throughout the script to retrieve
--the data for each control required and can easily be added to or deleted from.
--I have included in the files 'Railworks EngineData.pdf' which lists all the
--control names I have found along with their min/max/default values.
--I then use the local variable data to store the name of the control followed by a colon
-- and the return value and a new line. The data variable is added to as each control is read
-- throughout the script and at the end of the script we open the plugins/GetData.txt file
-- and write the whole data variable to the file ready for reading into your program.

--A word of warning, be careful with your syntax when editing lua script files because
--the only way you know something is wrong is when the script does not work. That is
--why I have included the line gCurrentTime = Call( "*:GetSimulationTime", 0 ). If your
--script is OK then the line at the end of the textbox display in my C# program will
--display "Current Time = :" followed by the time in seconds counting up. If this line
--is static then there is an error in your script. So my advice is make small changes
--and test your script regularly. 

-------------------  GetData function --------------------
gData = ""
delay = 5 
counter = 3 --Loop counter to only update every number of itterations set bt delay variable
dataread = 0
previousValues = {}
speedoType = 0 -- 0 = none, 1 = MPH, 2 = KPH
MPH = 2.23693629 -- 2.23694 --Convert meters per second to MPH
KPH = 3.60	--Convert meters per second to KPH
delete_Files = 1 --We need to delete the Getdata.txt and sendcommand.txt files on first run so updated data is received

function getdata ()
--If this is the first run then delete the getdata.txt and sendcommand.txt files
	if delete_Files == 1 then
		deleteFiles() --Delete old data first.
	end
	counter = counter + 1
	if counter >= delay then
		if Call ("GetIsEngineWithKey") == 1 then --Check we are driving the train.
			
			local speedMPS = Call("GetSpeed", 0) or 0
			local simTime = Call("GetSimulationTime", 0) or 0
			local grad = Call("GetGradient", 0) or 0
			local length = Call("GetConsistLength") or 0
			local mass = Call("GetConsistTotalMass") or 0
			local effort = Call("GetTractiveEffort") or 0
			-- --- SISTEMA DE POSICIONAMIENTO PARA G-LATERAL ---
			local posX, posY, posZ, heading = 0, 0, 0, 0
			-- Usamos GetNearPosition como indica el manual técnico (coordenadas x, y, z en metros)
            local curX, curY, curZ = Call("GetNearPosition")
            if curX then 
                posX, posY, posZ = curX, curY, curZ 
            else
                -- Fallback si GetNearPosition no está disponible
                curX, curY, curZ = Call("GetPosition")
                if curX then posX, posY, posZ = curX, curY, curZ end
            end
            
            -- Captura de Heading (orientación) para fallback si falla el posicionamiento
            if Call("ControlExists", "Heading", 0) == 1 then
                heading = Call("GetControlValue", "Heading", 0)
            end

            -- Limpieza de valores nulos para evitar crash en string.format
            if posX == nil then posX = 0 end
            if posY == nil then posY = 0 end
            if posZ == nil then posZ = 0 end
            if heading == nil then heading = 0 end

			-- Datos extra de Entorno (Basado en docs de ChrisTrains)
			local season = -1
			local dayTime = -1
			if SysCall then
				season = SysCall("ScenarioManager:GetSeason") or -1
				dayTime = SysCall("ScenarioManager:GetTimeOfDay") or -1
			end

			gData = "Season:" .. season .. "|DayTime:" .. string.format("%.0f", dayTime) .. "|"

			GetSpeedInfoSimple() 
			local currentFactor = MPH
			if speedoType == 2 then currentFactor = KPH end
			
			gData = gData .. string.format("Speed:%.2f|SimulationTime:%.2f|Gradient:%.2f|TrainLength:%.2f|TrainMass:%.2f|TractiveEffort:%.2f", 
				speedMPS * currentFactor, simTime, grad, length, mass, effort)

			-- Datos de posicionamiento para G-Lateral
			gData = gData .. string.format("|PosX:%.2f|PosY:%.2f|PosZ:%.2f|Heading:%.2f", posX, posY, posZ, heading)

			GetSpeedInfo() 
			GetControlData () 
			GetSpeedLimits () 
			GetSignalData () 
			-- GetScenarioData ya no hace falta llamarlo aquí
			WriteData () 
			SendData () 
		end
		counter = 0
		gData = ""
	end
end

function GetSpeedInfoSimple()
	if Call("ControlExists", "SpeedometerMPH", 0) == 1 or Call("ControlExists", "MySpeedometerMPH", 0) == 1 then
		speedoType = 1
	elseif Call("ControlExists", "SpeedometerKPH", 0) == 1 or Call("ControlExists", "MySpeedometerKPH", 0) == 1 then
		speedoType = 2
	else
		speedoType = 0
	end
end

function GetSpeedInfo()
	local ControlType = "Speed"
	local ControlName = ""
	local ControlMin = 0
	local ControlMax = 0
	local ControlValue = 0
	local cabSpeedVal = 0
	
	if Call("ControlExists", "SpeedometerMPH", 0) == 1 then
		speedoType = 1
		ControlName = "SpeedoType"
		cabSpeedVal = Call("GetControlValue", "SpeedometerMPH", 0)
		ControlMax = Call("GetControlMaximum", "SpeedometerMPH", 0)
		ControlValue = 1 -- MPH
		gData = gData .. "|" .. ControlName .. ":" .. ControlValue .. "|MaxSpeed:" .. ControlMax
	elseif Call("ControlExists", "MySpeedometerMPH", 0) == 1 then
		speedoType = 1
		ControlName = "SpeedoType"
		cabSpeedVal = Call("GetControlValue", "MySpeedometerMPH", 0)
		ControlMax = Call("GetControlMaximum", "MySpeedometerMPH", 0)
		ControlValue = 1 -- MPH
		gData = gData .. "|" .. ControlName .. ":" .. ControlValue .. "|MaxSpeed:" .. ControlMax
	elseif Call("ControlExists", "SpeedometerKPH", 0) == 1 then
		speedoType = 2
		ControlName = "SpeedoType"
		cabSpeedVal = Call("GetControlValue", "SpeedometerKPH", 0)
		ControlMax = Call("GetControlMaximum", "SpeedometerKPH", 0)
		ControlValue = 2 -- KPH
		gData = gData .. "|" .. ControlName .. ":" .. ControlValue .. "|MaxSpeed:" .. ControlMax
	elseif Call("ControlExists", "MySpeedometerKPH", 0) == 1 then
		speedoType = 2
		ControlName = "SpeedoType"
		cabSpeedVal = Call("GetControlValue", "MySpeedometerKPH", 0)
		ControlMax = Call("GetControlMaximum", "MySpeedometerKPH", 0)
		ControlValue = 2 -- KPH
		gData = gData .. "|" .. ControlName .. ":" .. ControlValue .. "|MaxSpeed:" .. ControlMax
	else
		speedoType = 0
		ControlName = "SpeedoType"
		cabSpeedVal = 0
		ControlMax = 0
		ControlValue = 0 -- No Speedo Fitted
		gData = gData .. "|" .. ControlName .. ":" .. ControlValue .. "|MaxSpeed:250"
	end

	gData = gData .. "|CabSpeed:" .. string.format("%.2f", cabSpeedVal)

	ControlName = "CurrentSpeed"
	ControlMin = 0
	ControlValue = Call("GetSpeed", 0)
	
	gData = gData .. "|" .. ControlName .. ":" .. string.format("%.4f", ControlValue)
	-- gData ya actualizado
end

function GetControlData()
	local ControlName = ""
	local ControlValue = 0
	
	ControlName = "TimeOfDay"
	ControlValue = SysCall("ScenarioManager:GetTimeOfDay")
	gData = gData .. "|" .. ControlName .. ":" .. ControlValue
	
	ControlName = "Acceleration"
	-- Devolvemos el valor real de aceleración (m/s^2). El HUD se encarga de la inversión de inercia.
	ControlValue = Call("GetAcceleration") or 0
	gData = gData .. "|" .. ControlName .. ":" .. ControlValue
	
	ControlName = "Gradient"
	-- El signo positivo en TS ya es Uphill (Subida)
	ControlValue = Call("GetGradient") or 0
	gData = gData .. "|" .. ControlName .. ":" .. ControlValue

	ControlName = "Curvature"
	-- Captura de curvatura usando GetCurvatureAhead(0) para obtener magnitud y DIRECCIÓN
	-- Positivo = derecha, Negativo = izquierda (según manual técnico)
	local curvature = Call("GetCurvatureAhead", 0) or 0
	
	-- Fallback si GetCurvatureAhead falla (el manual dice GetCurvature no lleva argumentos)
	if curvature == 0 then
		curvature = Call("GetCurvature") or 0
		-- Si GetCurvature es positivo pero CurvatureActual (AP/JT) existe, intentamos recuperar el signo
		if curvature ~= 0 and Call("ControlExists", "CurvatureActual", 0) == 1 then
			curvature = Call("GetControlValue", "CurvatureActual", 0)
		end
	end
	gData = gData .. "|" .. ControlName .. ":" .. string.format("%.6f", curvature)
	
	-- Captura Extendida de Controles para Dashboard Nexus v3.1 (Solo Modernos/Expert)
	local controlsToRead = {
		-- Tracción y Dinámica
		"Ammeter", "Effort", "TractiveEffort", "Regulator", "Reverser", "DynamicBrake",
		"SpeedometerMPH", "SpeedometerKPH",
		
		-- Sistemas de Freno (Presiones en BAR)
		"TrainBrakeCylinderPressureBAR", "TrainBrakePipePressureBAR", 
		"MainResPressureBAR", "EngineBrakeCylinderPressureBAR", "EqResPressureBAR",
		
		-- Mandos de Freno
		"TrainBrakeControl", "EngineBrakeControl", "DynamicBrakeControl", "HandBrake",
		
		-- Sistemas de Seguridad y Señalización
		"AWS", "AWSReset", "AWSWarning", "AWSWarnCount", "AWSWarnAudio", "VigilAlarm", "Vigilance", "DSD", "DVDAlarm", "DVDPedal", "TPWS", "EmergencyBrake", "DRA",
		"PZB_90", "PZB_Befehl40", "PZB_Frei", "PZB_Wachsam", "LZB_Fahrt", "LZB_H",
		
		-- Auxiliares y Cabina
		"Sander", "Pantograph", "DoorsOpenClose", "DoorsOpenCloseLeft", "DoorsOpenCloseRight",
		"Headlights", "CabLights", "Wipers", "WiperSpeed", "Horn", "Bell",
		"FuelLevel", "Gear", "MasterKey"
	}

	for _, name in ipairs(controlsToRead) do
		if Call("ControlExists", name, 0) == 1 then
			local val = Call("GetControlValue", name, 0)
			gData = gData .. "|" .. name .. ":" .. string.format("%.2f", val)
		end
	end
end

function GetSpeedLimits ()
	-- 1. Límite Actual
	local currentLimit = Call("GetCurrentSpeedLimit")
	local factor = (speedoType == 2) and KPH or MPH
	gData = gData .. "|CurrentSpeedLimit:" .. string.format("%.1f", currentLimit * factor)

	-- 2. Escaneo de múltiples límites próximos (Hasta 8 hitos para saltar duplicados)
	-- API CORRECTA: Call("GetNextSpeedLimit", dirección, índice)
	for i = 0, 7 do
		local lType, lSpeed, lDist = Call("GetNextSpeedLimit", 0, i)
		
		if lDist ~= nil and lDist > 0 and lDist < 15000 then
			if lSpeed > 1000 then lSpeed = 0 end 
			
			local prefix = "|NextLimit" .. i
			gData = gData .. prefix .. "Speed:" .. string.format("%.1f", lSpeed * factor)
			gData = gData .. prefix .. "Dist:" .. string.format("%.0f", lDist)
		end
	end
end

function GetSignalData()
    -- 1. Semáforo Inmediato (Cualquier estado)
    local state, distance = Call("GetNextSignalState", 0)
    if state == nil then state = -1 end
    if distance == nil then distance = -1 end
    
    -- 2. Semáforo Restrictivo (El próximo Amarillo/Rojo, aunque haya verdes en medio)
    -- result: >0 si encuentra, state: 1=Y, 2=R, proState: 1=Y, 2=YY, 3=R, 10=FY, 11=FYY
    local res, relState, relDist, proState = Call("GetNextRestrictiveSignal", 0, 0, 10000)
    if res == nil or res <= 0 then 
        proState = -1 
        relDist = -1
    end

    gData = gData .. "|NextSignalState:" .. state .. "|DistanceToNextSignal:" .. string.format("%.1f", distance)
    gData = gData .. "|RestrictiveState:" .. (proState or -1) .. "|RestrictiveDistance:" .. string.format("%.1f", relDist or -1)
    
    -- Soporte para InternalAspect (algunos trenes de UK lo usan para aspectos complejos)
    if Call("ControlExists", "InternalAspect", 0) == 1 then
        local intAspect = Call("GetControlValue", "InternalAspect", 0)
        gData = gData .. "|InternalAspect:" .. string.format("%.0f", intAspect)
    end
end

function WriteData()
	local file = io.open("plugins/GetData.txt", "w")
	if file then
		file:write(gData)
		file:close()
	end
end

function SendData ()

	-- Read file & send data to Railworks
	--1st we read a line from the SendCommand.txt file
	for line in io.lines("plugins/SendCommand.txt") do 
		--Check to make sure it isn't a blank line
		if line ~= "" then
			--it isn't blank so create a table(array) to hold the variables
			t = {}
			i = 1
			--Look for the colon(:) in the file that separates the control name
			-- from the value to send
			for str in string.gfind(line, "[^:]+") do
				--Place the control name in t[1] then increment i
				--and place the value for the control in t[2]
				t[i] = str
				i = i + 1
			end
			
			--Force controls to 0 on first run
			if dataread == 0 then
				previousValues[t[1]] = -1
				t[2] = 0
			end

			if t[1]~= "Wipers" and t[1] ~= "WiperSpeed" and t[1] ~= "swDriverWiper" then
				if previousValues[t[1]] ~= t[2] then
					--Send the command to railworks. The format is:-
					--Call("*:SetControlValue", Control name, 0 (for lead engine), value for the control)
					if OnControlValueChange then
						OnControlValueChange(t[1], 0, tonumber(t[2]))
					else
						Call( "SetControlValue", t[1], 0, tonumber(t[2])) 
					end
					Call("SetControlTargetValue", t[1], 0, tonumber(t[2]))
					previousValues[t[1]] = t[2]
				end
			end
			
			if t[1] == "Wipers" or t[1] == "WiperSpeed" or t[1] == "swDriverWiper" then
				if previousValues[t[1]] ~= 0 or previousValues[t[1]] ~= t[2] then 
					--Send the command to railworks. The format is:-
					--Call("SetControlValue", Control name, 0 (for lead engine), value for the control)
					if OnControlValueChange then
						OnControlValueChange(t[1], 0, tonumber(t[2]))
					else
						Call( "SetControlValue", t[1], 0, tonumber(t[2])) 
					end
					Call("SetControlTargetValue", t[1], 0, tonumber(t[2]))
				end
				previousValues[t[1]] = t[2]
			end
		end
	end
	dataread = 1
end

function deleteFiles()
	os.remove("plugins/GetData.txt")
	os.remove("plugins/SendCommand.txt")
	delete_Files = 0
end

function Update(time)
	getdata()
end
