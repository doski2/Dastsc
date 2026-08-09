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
local NEXUS_LUA_VERSION = 11
local gData = ""
local delay = 5 
local counter = 0
local dataread = 0
local previousValues = {}
local speedoType = 0 
local MPH = 2.236936
local KPH = 3.60
local delete_Files = 1 
local gActiveCab = 1 -- OnCameraEnter (no fiable en plugins/)
local gLatchedCab = 0 -- 0=sin latch, 1 o 2 tras inferir en marcha
local gCarriageCam = 0

-- OnCameraEnter solo se dispara en scripts embebidos del vehículo/escenario,
-- no en plugins globales. Usamos polling de mandos del motor como respaldo.
local CAB_CONTROL_NAMES = {
	"ActiveCab", "CabEnd", "CabEndWithKey", "DriverCab", "LeadingCab",
	"CabSelector", "SecondCab", "EngineCab", "Cab",
}

function readControlValue(name)
	if Call("ControlExists", name, 0) == 1 then
		return Call("GetControlValue", name, 0)
	end
	return nil
end

function cabFromControlValue(value)
	if value == nil then return nil end
	if value >= 1 and value <= 2 then return math.floor(value + 0.5) end
	if value > 0.75 then return 2 end
	if value < 0.25 then return 1 end
	return nil
end

function cabFromNamedControls()
	for _, name in ipairs(CAB_CONTROL_NAMES) do
		local cab = cabFromControlValue(readControlValue(name))
		if cab ~= nil then return cab end
	end
	return nil
end

function resolveActiveCab(reverser, speedMS)
	local wheelSpeedMS = readControlValue("WheelSpeedAbsMS")
	local trackMPH = readControlValue("TrackMPH")

	local controlCab = cabFromNamedControls()
	if controlCab ~= nil then
		gLatchedCab = controlCab
		return controlCab, wheelSpeedMS, trackMPH
	end

	if gActiveCab == 2 then
		gLatchedCab = 2
		return 2, wheelSpeedMS, trackMPH
	end

	if speedMS > 0.5 then
		if reverser > 0.05 then
			if wheelSpeedMS ~= nil and wheelSpeedMS < -0.15 then
				gLatchedCab = 2
				return 2, wheelSpeedMS, trackMPH
			end
			if trackMPH ~= nil and trackMPH < -0.3 then
				gLatchedCab = 2
				return 2, wheelSpeedMS, trackMPH
			end
			if wheelSpeedMS ~= nil and wheelSpeedMS > 0.15 then
				gLatchedCab = 1
			end
		elseif reverser < -0.05 then
			if wheelSpeedMS ~= nil and wheelSpeedMS > 0.15 then
				gLatchedCab = 2
				return 2, wheelSpeedMS, trackMPH
			end
			if trackMPH ~= nil and trackMPH > 0.3 then
				gLatchedCab = 2
				return 2, wheelSpeedMS, trackMPH
			end
			if wheelSpeedMS ~= nil and wheelSpeedMS < -0.15 then
				gLatchedCab = 1
			end
		end
	end

	if gLatchedCab == 1 or gLatchedCab == 2 then
		return gLatchedCab, wheelSpeedMS, trackMPH
	end

	return gActiveCab, wheelSpeedMS, trackMPH
end

function OnCameraEnter(cabEndWithCamera, carriageCam)
	-- cabEndWithCamera: 1 = Front, 2 = Back (convención TSC)
	if cabEndWithCamera ~= nil and cabEndWithCamera >= 1 and cabEndWithCamera <= 2 then
		gActiveCab = cabEndWithCamera
		gCarriageCam = carriageCam or 0
	end
end

function OnCameraLeave()
	gCarriageCam = 0
end

-- TSC llama Update cada frame en scripts de engine/plugin.
function Update(frameDeltaTime)
	getdata()
end

function getdata ()
	local ok, err = pcall(function()
		if delete_Files == 1 then
			deleteFiles()
		end

		
		counter = counter + 1
		if counter >= delay then
			local isEngineWithKey = Call("GetIsEngineWithKey")
			if isEngineWithKey == 1 then 
				gData = "" 
				GetSpeedInfo()
				GetControlData() 
				GetSpeedLimits() 
				WriteData() 
				SendData() 
			end
			counter = 0
		end
	end)
	if not ok and err then
		local ef = io.open("plugins/GetData_Error.txt", "w")
		if ef then ef:write(tostring(err)); ef:close() end
	end
end

function GetSpeedInfo()
	local currentSpeed = Call("GetSpeed")
	
	if Call("ControlExists", "SpeedometerMPH", 0) == 1 or Call("ControlExists", "MySpeedometerMPH", 0) == 1 then
		speedoType = 1
	elseif Call("ControlExists", "SpeedometerKPH", 0) == 1 or Call("ControlExists", "MySpeedometerKPH", 0) == 1 then
		speedoType = 2
	else
		speedoType = 0
	end

	gData = gData .. "SpeedoType:" .. speedoType .. "|CurrentSpeed:" .. string.format("%.4f", currentSpeed) .. "|"
end

function GetControlData()
	local timeOfDay = SysCall("ScenarioManager:GetTimeOfDay")
	local acceleration = Call("GetAcceleration")
	local gradient = Call("GetGradient")
	local curvature = Call("GetCurvature")
	local rvNumber = Call("GetRVNumber")
	local mass = Call("GetConsistTotalMass")
	local trainLength = Call("GetConsistLength")
	local consistType = Call("GetConsistType")
	local nPosX, nPosY, nPosZ = Call("getNearPosition")
	
	-- Alarmas y Sistemas de Seguridad
	local aws = 0
	local awsWarnCount = 0
	
	if Call("ControlExists", "AWS", 0) == 1 then aws = Call("GetControlValue", "AWS", 0) end
	if Call("ControlExists", "AWSWarnCount", 0) == 1 then awsWarnCount = Call("GetControlValue", "AWSWarnCount", 0) end
	
	local awsReset = 0
	if Call("ControlExists", "AWSReset", 0) == 1 then awsReset = Call("GetControlValue", "AWSReset", 0)
	elseif Call("ControlExists", "AWSResetButton", 0) == 1 then awsReset = Call("GetControlValue", "AWSResetButton", 0) end

	local dsd = 0
	if Call("ControlExists", "DVDAlarm", 0) == 1 then dsd = Call("GetControlValue", "DVDAlarm", 0) end
	if Call("ControlExists", "VigilAlarm", 0) == 1 and dsd == 0 then dsd = Call("GetControlValue", "VigilAlarm", 0) end
	
	local dra = 0
	if Call("ControlExists", "DRA", 0) == 1 then dra = Call("GetControlValue", "DRA", 0) end
	
	local sander = 0
	if Call("ControlExists", "Sander", 0) == 1 then sander = Call("GetControlValue", "Sander", 0) end
	
	local doorL = 0
	local doorR = 0
	if Call("ControlExists", "DoorsOpenCloseLeft", 0) == 1 then doorL = Call("GetControlValue", "DoorsOpenCloseLeft", 0) end
	if Call("ControlExists", "DoorsOpenCloseRight", 0) == 1 then doorR = Call("GetControlValue", "DoorsOpenCloseRight", 0) end

	-- Sensores de Tracción y Potencia
	local ammeter = 0
	local t_effort = 0
	if Call("ControlExists", "Ammeter", 0) == 1 then ammeter = Call("GetControlValue", "Ammeter", 0) end
	if Call("ControlExists", "TractiveEffort", 0) == 1 then t_effort = Call("GetControlValue", "TractiveEffort", 0) end

	-- Controles de Conducción Primarios
	local throttle = 0
	local regulator = 0
	local simple_throttle = 0
	local train_brake = 0
	local virtual_brake = 0
	local combined = 0
	local reverser = 0
	
	if Call("ControlExists", "Throttle", 0) == 1 then throttle = Call("GetControlValue", "Throttle", 0) end
	if Call("ControlExists", "Regulator", 0) == 1 then regulator = Call("GetControlValue", "Regulator", 0) end
	if Call("ControlExists", "SimpleThrottle", 0) == 1 then simple_throttle = Call("GetControlValue", "SimpleThrottle", 0) end
	if Call("ControlExists", "TrainBrakeControl", 0) == 1 then train_brake = Call("GetControlValue", "TrainBrakeControl", 0) end
	if Call("ControlExists", "VirtualBrake", 0) == 1 then virtual_brake = Call("GetControlValue", "VirtualBrake", 0) end
	if Call("ControlExists", "ThrottleAndBrake", 0) == 1 then combined = Call("GetControlValue", "ThrottleAndBrake", 0) end
	if Call("ControlExists", "Reverser", 0) == 1 then reverser = Call("GetControlValue", "Reverser", 0) end
	if Call("ControlExists", "UserVirtualReverser", 0) == 1 then reverser = Call("GetControlValue", "UserVirtualReverser", 0) end

	local currentSpeedMS = Call("GetSpeed")
	local activeCab, wheelSpeedMS, trackMPH = resolveActiveCab(reverser, currentSpeedMS)

	-- GetGradient devuelve % (no ‰): convertimos a ‰ para Nexus.
	local gradientPermille = gradient * 10
	local finalSigState = 3 -- Default Clear
	local finalSigDist = 0
	local finalSigRes = 0
	local ok_sig, res, sState, sDist, sPro = pcall(Call, "GetNextRestrictiveSignal", 0, 0, 10000)
	if ok_sig and res ~= nil and res > 0 then
		finalSigRes = 1
		finalSigDist = tonumber(sDist) or 0
		if sPro ~= nil and sPro ~= -1 then
			if sPro == 3 then finalSigState = 0
			elseif sPro == 1 then finalSigState = 1
			elseif sPro == 2 then finalSigState = 2
			elseif sPro == 10 then finalSigState = 10
			elseif sPro == 11 then finalSigState = 11
			else finalSigState = 3 end
		else
			if sState == 2 then finalSigState = 0
			elseif sState == 1 then finalSigState = 1
			else finalSigState = 3 end
		end
	end
	
	-- Presiones de Aire (Frenos) - Soporte Universal (BAR/PSI)
	local b_cylinder = 0
	local b_pipe = 0
	local main_res = 0
	local eq_res = 0

	-- BC (Brake Cylinder)
	if Call("ControlExists", "TrainBrakeCylinderPressureBAR", 0) == 1 then b_cylinder = Call("GetControlValue", "TrainBrakeCylinderPressureBAR", 0)
	elseif Call("ControlExists", "BrakeCylinderPressurePSI", 0) == 1 then b_cylinder = Call("GetControlValue", "BrakeCylinderPressurePSI", 0)
	elseif Call("ControlExists", "BrakeCylinderPressureBAR", 0) == 1 then b_cylinder = Call("GetControlValue", "BrakeCylinderPressureBAR", 0) end

	-- BP (Brake Pipe)
	if Call("ControlExists", "BrakePipePressureBAR", 0) == 1 then b_pipe = Call("GetControlValue", "BrakePipePressureBAR", 0)
	elseif Call("ControlExists", "BrakePipePressurePSI", 0) == 1 then b_pipe = Call("GetControlValue", "BrakePipePressurePSI", 0) end

	-- MR (Main Reservoir)
	if Call("ControlExists", "MainReservoirPressureBAR", 0) == 1 then main_res = Call("GetControlValue", "MainReservoirPressureBAR", 0)
	elseif Call("ControlExists", "MainResPressurePSI", 0) == 1 then main_res = Call("GetControlValue", "MainResPressurePSI", 0) end

	-- ER (Equalising Reservoir)
	if Call("ControlExists", "EqualisingReservoirPressureBAR", 0) == 1 then eq_res = Call("GetControlValue", "EqualisingReservoirPressureBAR", 0)
	elseif Call("ControlExists", "EqualisingReservoirPressurePSI", 0) == 1 then eq_res = Call("GetControlValue", "EqualisingReservoirPressurePSI", 0) end
	
	-- Posición mundial (Far Coordinate: tile * 1024 + offset)
	local farX1, farX2, farY1, farY2, farZ1, farZ2 = 0, 0, 0, 0, 0, 0
	local ok, r1, r2, r3, r4, r5, r6 = pcall(Call, "getFarPosition")
	if ok and r1 ~= nil then
		farX1, farX2, farY1, farY2, farZ1, farZ2 = r1, r2, r3, r4, r5, r6
	end

	-- Proxima estacion (distancia nativa del motor, la mas precisa disponible)
	local stationName = "N/A"
	local stationDist = -1
	local platformLength = 0
	-- Intentar con 0 argumentos primero, luego con 1 (algunas versiones del motor difieren)
	local ok_sta, sn, sd, sl = pcall(Call, "GetNextStation", 0)
	if not ok_sta or sn == nil then
		ok_sta, sn, sd, sl = pcall(Call, "GetNextStation")
	end
	if ok_sta and sn ~= nil then
		stationName = tostring(sn)
		stationDist = tonumber(sd) or -1
		platformLength = tonumber(sl) or 0
	end

	local combinedOut = combined
	local throttleOut = throttle
	local brakeOut = train_brake
	if Call("ControlExists", "SimpleThrottle", 0) == 1 then throttleOut = simple_throttle
	elseif regulator ~= 0 or Call("ControlExists", "Regulator", 0) == 1 then throttleOut = regulator end
	if Call("ControlExists", "VirtualBrake", 0) == 1 then brakeOut = virtual_brake end
	if Call("ControlExists", "ThrottleAndBrake", 0) ~= 1 then
		combinedOut = throttleOut - brakeOut
	end

	gData = gData .. "TimeOfDay:" .. string.format("%.2f", timeOfDay) .. 
	        "|Acceleration:" .. string.format("%.4f", acceleration) .. 
	        "|Gradient:" .. string.format("%.4f", gradientPermille) ..
	        "|GradientPct:" .. string.format("%.4f", gradient) .. 
	        "|Curvature:" .. string.format("%.6f", curvature) .. 
	        "|RV:" .. (rvNumber or "N/A") .. 
	        "|Mass:" .. string.format("%.0f", mass) .. 
	        "|TrainLength:" .. string.format("%.0f", trainLength) .. 
	        "|ConsistType:" .. (consistType or 0) .. 
	        "|SigRes:" .. finalSigRes .. 
	        "|SigState:" .. finalSigState .. 
	        "|SigDist:" .. string.format("%.1f", finalSigDist) .. 
	        "|AWS:" .. aws .. 
	        "|AWSWarnCount:" .. awsWarnCount .. 
	        "|AWSReset:" .. awsReset .. 
	        "|DSD:" .. dsd .. 
	        "|DRA:" .. dra .. 
	        "|Sander:" .. sander .. 
	        "|DoorL:" .. doorL .. 
	        "|DoorR:" .. doorR .. 
	        "|Ammeter:" .. string.format("%.2f", ammeter) .. 
	        "|TractiveEffort:" .. string.format("%.2f", t_effort) .. 
	        "|Throttle:" .. string.format("%.4f", throttleOut) .. 
	        "|Regulator:" .. string.format("%.4f", regulator) .. 
	        "|SimpleThrottle:" .. string.format("%.4f", simple_throttle) .. 
	        "|TrainBrake:" .. string.format("%.4f", brakeOut) .. 
	        "|VirtualBrake:" .. string.format("%.4f", virtual_brake) .. 
	        "|Combined:" .. string.format("%.4f", combinedOut) .. 
	        "|Reversal:" .. reverser .. 
	        "|BC:" .. string.format("%.2f", b_cylinder) .. 
	        "|BP:" .. string.format("%.2f", b_pipe) .. 
	        "|MR:" .. string.format("%.2f", main_res) .. 
	        "|ER:" .. string.format("%.2f", eq_res) .. 
	        "|ActiveCab:" .. activeCab
	if wheelSpeedMS ~= nil then
		gData = gData .. "|WheelSpeedMS:" .. string.format("%.4f", wheelSpeedMS)
	end
	if trackMPH ~= nil then
		gData = gData .. "|TrackMPH:" .. string.format("%.4f", trackMPH)
	end
	gData = gData ..
	        "|NX:" .. string.format("%.2f", nPosX) .. 
	        "|NY:" .. string.format("%.2f", nPosY) .. 
	        "|NZ:" .. string.format("%.2f", nPosZ) ..
	        "|FarXT:" .. string.format("%d", farX1) ..
	        "|FarXO:" .. string.format("%.2f", farX2) ..
	        "|FarZT:" .. string.format("%d", farZ1) ..
	        "|FarZO:" .. string.format("%.2f", farZ2) ..
				"|StationName:" .. stationName ..
				"|StationDistance:" .. string.format("%.1f", stationDist) ..
				"|PlatformLength:" .. string.format("%.0f", platformLength) .. "|"
end

function GetSpeedLimits ()
	local factor = (speedoType == 2) and KPH or MPH
	
	-- 1. Obtención de límites actuales (Separados: Vía y Señal)
	local trackLimit, signalLimit = Call("GetCurrentSpeedLimit", 1)
	trackLimit = tonumber(trackLimit) or 0
	signalLimit = tonumber(signalLimit) or 0
	if signalLimit ~= signalLimit or signalLimit > 10000 or signalLimit < -10000 then signalLimit = trackLimit end
	if trackLimit ~= trackLimit or trackLimit > 10000 or trackLimit < -10000 then trackLimit = 0 end
	local currentLimit = math.min(trackLimit, signalLimit)
	
	gData = gData .. "TrackLimit:" .. string.format("%.1f", trackLimit * factor) .. 
	        "|SignalLimit:" .. string.format("%.1f", signalLimit * factor) .. 
	        "|CurrentSpeedLimit:" .. string.format("%.1f", currentLimit * factor) .. "|"

	-- 2. Primer Próximo Límite
	local lType1, lSpeed1, lDist1 = Call("GetNextSpeedLimit", 0, 0.01)
	lType1 = tonumber(lType1); lSpeed1 = tonumber(lSpeed1) or 0; lDist1 = tonumber(lDist1) or 0
	-- Señal en ROJO/parada: el sim devuelve velocidad gigante (200006) o inf en lugar de
	-- un límite real. lSpeed1 está en m/s; cualquier valor > 200 m/s (720 km/h) es imposible.
	if lSpeed1 ~= lSpeed1 or lSpeed1 > 200 or lSpeed1 < 0 then lSpeed1 = currentLimit end
	if lType1 ~= nil and lType1 ~= -1 then
		gData = gData .. "NextLimitType:" .. lType1 .. 
		        "|NextLimitSpeed:" .. string.format("%.1f", lSpeed1 * factor) .. 
		        "|NextLimitDist:" .. string.format("%.0f", lDist1) .. "|"
		
		-- 3. Segundo Próximo Límite (Buscamos el siguiente que tenga una velocidad distinta)
		local searchDist = lDist1 + 0.1
		local lType2, lSpeed2, lDist2 = -1, 0, 0
		
		for i=1, 3 do
			local t2, s2, d2 = Call("GetNextSpeedLimit", 0, searchDist)
			t2 = tonumber(t2); s2 = tonumber(s2) or 0; d2 = tonumber(d2) or 0
			-- Mismo saneo: señal en rojo devuelve velocidad gigante o inf
			if s2 ~= s2 or s2 > 200 or s2 < 0 then s2 = currentLimit end
			if t2 == nil or t2 == -1 then break end
			if math.abs(s2 - lSpeed1) > 0.1 then
				lType2 = t2; lSpeed2 = s2; lDist2 = d2
				break
			end
			searchDist = d2 + 0.1
		end

		if lType2 ~= -1 then
			gData = gData .. "|NextLimit2Type:" .. lType2 .. 
			        "|NextLimit2Speed:" .. string.format("%.1f", lSpeed2 * factor) .. 
			        "|NextLimit2Dist:" .. string.format("%.0f", lDist2) .. "|"
		end
	end
end
	
function WriteData ()
	gData = gData .. "|NexusLuaVersion:" .. NEXUS_LUA_VERSION ..
	        "|SimulationTime:" .. string.format("%.2f", Call("GetSimulationTime", 0))

	-- Escritura atómica para V3
	local file = io.open("plugins/GetData.txt", "w")
	if file then
		file:write(gData)
		file:close()
	end
end

function commandsArmed()
	local f = io.open("plugins/NexusApplyCommands.flag", "r")
	if f == nil then
		f = io.open("Plugins/NexusApplyCommands.flag", "r")
	end
	if f == nil then return false end
	f:close()
	return true
end

function controlValueChanged(controlName, value)
	local prev = previousValues[controlName]
	if prev ~= nil and math.abs(prev - value) < 0.0001 then
		return false
	end
	if Call("ControlExists", controlName, 0) ~= 1 then
		return false
	end
	Call("SetControlValue", controlName, 0, value)
	previousValues[controlName] = value
	return true
end

function SendData ()
	-- Sin flag Nexus: no aplicar SendCommand.txt (mandos manuales libres).
	if not commandsArmed() then return end

	-- Si no existe SendCommand.txt, no hay nada que enviar
	local f = io.open("plugins/SendCommand.txt", "r")
	if not f then return end
	f:close()

	-- Read file & send data to Railworks (misma estructura que copia Documents)
	for line in io.lines("plugins/SendCommand.txt") do 
		if line ~= "" then
			t = {}
			i = 1
			for str in string.gfind(line, "[^:]+") do
				t[i] = str
				i = i + 1
			end

			if t[1] and t[2] then
				local value = tonumber(t[2])
				if value ~= nil then
					controlValueChanged(t[1], value)
				end
			end
		end
	end

	dataread = 1
	pcall(os.remove, "plugins/SendCommand.txt")
	pcall(os.remove, "Plugins/SendCommand.txt")
end

function deleteFiles()

	os.remove("Plugins/GetData.txt")
	os.remove("plugins/SendCommand.txt")
	os.remove("Plugins/SendCommand.txt")
	os.remove("Plugins/sendcommand.txt")
	os.remove("plugins/NexusApplyCommands.flag")
	os.remove("Plugins/NexusApplyCommands.flag")
	delete_Files = 0
end
