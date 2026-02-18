import os
import winreg

def find_railworks():
    """Busca la ruta de instalación de RailWorks/TS en el registro de Windows."""
    paths_to_check = [
        r"C:\Program Files (x86)\Steam\steamapps\common\RailWorks",
        r"C:\Program Files\Steam\steamapps\common\RailWorks",
        r"D:\SteamLibrary\steamapps\common\RailWorks",
        r"E:\SteamLibrary\steamapps\common\RailWorks",
    ]
    
    # 1. Intentar via Registro
    try:
        hKey = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\RailSimulator.com\RailWorks")
        value, _ = winreg.QueryValueEx(hKey, "installpath")
        if os.path.exists(value):
            return value
    except OSError:
        pass

    # 2. Intentar via Proceso Directo (Common paths)
    for path in paths_to_check:
        if os.path.exists(path):
            return path
            
    return None

def verify_plugins_folder(rw_path):
    if not rw_path:
        return False
    plugins_path = os.path.join(rw_path, "plugins")
    if not os.path.exists(plugins_path):
        print(f"[*] Creando carpeta plugins en: {plugins_path}")
        os.makedirs(plugins_path)
    return True

if __name__ == "__main__":
    rw_path = find_railworks()
    if rw_path:
        print(f"FOUND:{rw_path}")
    else:
        print("NOT_FOUND")
