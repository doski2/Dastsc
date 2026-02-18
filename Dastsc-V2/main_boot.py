import os
import subprocess
import platform

def run_v2():
    print("=" * 50)
    print("   DASTSC V2 - PROFESSIONAL TELEMETRY BOOTLOADER")
    print("=" * 50)

    base_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dir = os.path.join(base_dir, "frontend")

    # 1. Verificar Node.js
    try:
        subprocess.run(["node", "--version"], check=True, capture_output=True)
    except Exception:
        print("[!] ERROR: Node.js no encontrado. Por favor instalalo.")
        return

    # 2. Instalar dependencias si no existen
    node_modules = os.path.join(frontend_dir, "node_modules")
    if not os.path.exists(node_modules):
        print("[*] node_modules no encontrado. Instalando dependencias del frontend...")
        npm_cmd = "npm.cmd" if platform.system() == "Windows" else "npm"
        subprocess.run([npm_cmd, "install"], cwd=frontend_dir, shell=True)

    # 3. Lanzar Electron (que a su vez lanzara el backend Python)
    print("[+] Iniciando sistema electronico...")
    npm_cmd = "npm.cmd" if platform.system() == "Windows" else "npm"
    subprocess.run([npm_cmd, "start"], cwd=frontend_dir, shell=True)

if __name__ == "__main__":
    run_v2()
