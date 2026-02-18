import sys
import os

# Añadir el directorio padre al path para poder importar los módulos del backend
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.parser import parse_telemetry_line
from physics.engine import PhysicsEngine

def test_parser():
    print("--- Test 1: Parser TSC ---")
    line = "Speed:60.5|CurvatureActual:0.002|Gradient:-1.5|AWS:0|TrainBrakeCylinderPressureBAR:0.5"
    data = parse_telemetry_line(line)
    
    expected_keys = ["Speed", "CurvatureActual", "Gradient", "AWS", "TrainBrakeCylinderPressureBAR"]
    for key in expected_keys:
        if key in data:
            print(f"[OK] {key}: {data[key]} ({type(data[key]).__name__})")
        else:
            print(f"[ERROR] Clave {key} no encontrada")
            
    # Test malformado
    bad_line = "NoData|Invalid:Val:Extra|Empty:"
    bad_data = parse_telemetry_line(bad_line)
    print(f"[OK] Malformed line handled: {bad_data}")

def test_physics():
    print("\n--- Test 2: Motor de Físicas (G-Force) ---")
    engine = PhysicsEngine()
    
    # Escenario 1: Curva a alta velocidad (60 mph, radio 500m -> k=0.002)
    speed = 60.0
    curvature = 0.002
    prev_speed = 50.0 # Acelerando
    dt = 0.2 # 5Hz
    
    res = engine.calculate_g_forces(speed, curvature, prev_speed, dt)
    print(f"60mph @ k:0.002 -> G-Lateral: {res['g_lateral']} G, G-Longitudinal: {res['g_longitudinal']} G")
    
    if res['g_lateral'] > 0:
        print("[OK] Fuerza lateral detectada correctamente")
    if res['g_longitudinal'] > 0:
        print("[OK] Aceleración detectada correctamente")

    # Escenario 2: Parado en recta
    res_stop = engine.calculate_g_forces(0, 0, 0, 0.2)
    print(f"Parado -> G-Lateral: {res_stop['g_lateral']}, G-Longitudinal: {res_stop['g_longitudinal']}")
    if res_stop['g_lateral'] == 0 and res_stop['g_longitudinal'] == 0:
        print("[OK] Estado estático verificado")

def test_file_integration():
    print("\n--- Test 3: Simulación de Bridge de Archivo ---")
    test_file = "test_GetData.txt"
    try:
        # Escribir línea de prueba
        with open(test_file, "w") as f:
            f.write("Speed:85.0|CurvatureActual:0.0001|DSD:1")
        
        # Leer y parsear
        with open(test_file, "r") as f:
            line = f.readline()
            data = parse_telemetry_line(line)
            print(f"Leído del archivo: {data}")
            if data['Speed'] == 85.0:
                print("[OK] Integración de archivo emulada con éxito")
    finally:
        if os.path.exists(test_file):
            os.remove(test_file)

if __name__ == "__main__":
    print("=== DASTSC V2: TEST PROFUNDO FASE 1 (BACKEND) ===\n")
    test_parser()
    test_physics()
    test_file_integration()
    print("\n=== FIN DE LOS TESTS ===")
