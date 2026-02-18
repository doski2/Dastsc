import re

original_path = r"c:\Users\doski\Dastsc\lua original\Railworks_GetData_Script.lua"
target_path = r"c:\Users\doski\Dastsc\lua\Railworks_GetData_Script.lua"

with open(original_path, 'r', encoding='latin-1') as f:
    content = f.read()

# 1. Simplificar WriteData
content = re.sub(
    r'function WriteData\s*\(\)\s*.*?end',
    'function WriteData()\n\tlocal file = io.open("plugins/GetData.txt", "w")\n\tif file then\n\t\tfile:write(gData)\n\t\tfile:close()\n\tend\nend',
    content,
    flags=re.DOTALL
)

# 2. Reemplazar bloques de construcción de data por append a gData
# Buscamos el patrón de 5 líneas que se repite cientos de veces
pattern = r'data = data\s*\.\.\s*"ControlType:"\s*\.\.\s*ControlType\s*\.\.\s*"\\n"\s*' \
          r'data = data\s*\.\.\s*"ControlName:"\s*\.\.\s*ControlName\s*\.\.\s*"\\n"\s*' \
          r'data = data\s*\.\.\s*"ControlMin:"\s*\.\.\s*ControlMin\s*\.\.\s*"\\n"\s*' \
          r'data = data\s*\.\.\s*"ControlMax:"\s*\.\.\s*ControlMax\s*\.\.\s*"\\n"\s*' \
          r'data = data\s*\.\.\s*"ControlValue:"\s*\.\.\s*ControlValue\s*\.\.\s*"\\n"'

# Reemplazamos por el nuevo formato compactado
content = re.sub(pattern, 'gData = gData .. "|" .. ControlName .. ":" .. ControlValue', content)

# 3. Fix basic variables and getdata delay
content = content.replace('delay = 5', 'delay = 2') # 5Hz aprox
content = content.replace('gData = ""\ndelay = 2', 'gData = ""\ndelay = 2\n-- Dastsc V2 Optimized')

# 4. Asegurar que gData se limpia correctamente en el ciclo (ya está en el original pero por si acaso)
# El original hace gData = "" al final del tick de counter.

# 5. Cambiar Call("GetSpeed") por algo que incluya el MasterLine al inicio
content = re.sub(
    r'function getdata\s*\(\)\s*.*?if\s*counter\s*>=\s*delay\s*then',
    'function getdata()\n\tif delete_Files == 1 then deleteFiles(); delete_Files = 0 end\n\tcounter = counter + 1\n\tif counter >= delay then',
    content,
    flags=re.DOTALL
)

# 6. Añadir el hook Update al final si no existe
if "function Update" not in content:
    content += '\n\nfunction Update(time)\n\tgetdata()\nend\n'

with open(target_path, 'w', encoding='latin-1') as f:
    f.write(content)

print("Transformación completada con éxito.")
