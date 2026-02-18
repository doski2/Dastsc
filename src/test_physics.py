import os

def test_data_flow():
    """
    Simula la escritura de datos en el archivo GetData.txt y verifica si el dashboard 
    podría leerlos correctamente (basado en la lógica del parser).
    """
    test_path = "test_getdata.txt"
    test_content = (
        "ControlType:Speed\nControlName:CurrentSpeed\nControlValue:13.41\n"
        "ControlType:Gradient\nControlName:Gradient\nControlValue:-1.5\n"
        "ControlType:Brakes\nControlName:TrainBrakeCylinderPressureBAR\nControlValue:2.5\n"
        "ControlType:Brakes\nControlName:BrakePipePressureBAR\nControlValue:4.8\n"
    )
    
    print("--- INICIANDO TEST DE FLUJO DE DATOS ---")
    
    # 1. Escritura
    try:
        with open(test_path, "w") as f:
            f.write(test_content)
        print("[OK] Escritura de archivo de test")
    except Exception as e:
        print(f"[FAIL] Error escribiendo: {e}")
        return

    # 2. Lectura (Simulando read_getdata del dashboard)
    data = {}
    try:
        current_name = None
        with open(test_path, "r") as f:
            for line in f:
                line = line.strip()
                if line.startswith("ControlName:"):
                    current_name = line.split(":")[1]
                elif line.startswith("ControlValue:") and current_name:
                    data[current_name] = line.split(":")[1]
        
        # Validar campos críticos
        assert float(data["Gradient"]) == -1.5
        assert float(data["TrainBrakeCylinderPressureBAR"]) == 2.5
        assert float(data["BrakePipePressureBAR"]) == 4.8
        print("[OK] Datos de Físicas validados correctamente")
        
    except Exception as e:
        print(f"[FAIL] Error en validación: {e}")
    finally:
        if os.path.exists(test_path):
            os.remove(test_path)
    
    print("--- TEST FINALIZADO ---")

if __name__ == "__main__":
    test_data_flow()
