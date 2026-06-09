import time
import os

# Ruta al archivo de telemetría de TS Classic
GETDATA_PATH = r"C:\Program Files (x86)\Steam\steamapps\common\RailWorks\plugins\GetData.txt"

def simulate_approach(unit='MPH'):
    """
    Simula una aproximación a una estación inyectando datos directamente en GetData.txt.
    Usa el formato key:value|key:value esperado por el backend.
    """
    if not os.path.exists(os.path.dirname(GETDATA_PATH)):
        print(f"Error: No se encontró la ruta {os.path.dirname(GETDATA_PATH)}")
        return

    print(f"--- SIMULADOR DE TELEMETRÍA NEXUS V3 [{unit}] ---")
    print(f"Inyectando datos en: {GETDATA_PATH}")
    print(f"Simulando aproximación de {'2.0 mi' if unit == 'MPH' else '3.0 km'}...")

    # Distancia al objetivo en metros
    target_dist = 3218.0 if unit == 'MPH' else 3000.0 
    speed_ms = 30.0  # ~108 km/h / 67 mph
    trip_m = 1000.0
    
    # El backend necesita ver que el archivo cambia (mtime)
    while target_dist > -50:
        # Construir línea de telemetría en formato key:value|key:value
        is_kph = unit == 'KPH'
        telemetry = {
            "CurrentSpeed": speed_ms,
            "Throttle": 0.0,
            "TrainBrake": 0.0,
            "Reversal": 1,
            "TripDistance": trip_m,
            "DistToNextSignal": 5000,
            "CurrentSpeedLimit": 100 if is_kph else 60,
            "NextLimitSpeed": 120 if is_kph else 75,
            "NextLimitDist": 1500,
            "DistToNextSpeedLimit": 1500,
            "Gradient": 0.0,
            "Amperage": 100.0,
            "Mass": 500.0,
            "ConsistType": 1,
            "ActiveCab": 1,
            "SimulationTime": time.time() % 86400,
            "SpeedoType": 2 if is_kph else 1,
            # Inyectamos StationDistance directamente para el test del frontend
            "StationDistance": target_dist,
            "StationNameOCR": f"SIM TEST {unit}"
        }
        
        line = "|".join([f"{k}:{v}" for k, v in telemetry.items()])
        
        try:
            with open(GETDATA_PATH, "w") as f:
                f.write(line)
            
            # Formateo de salida según unidad
            if unit == 'MPH':
                print(f"OUT: Speed {speed_ms*2.237:.1f} mph | Trip {trip_m*0.000621:.2f}mi | Rem: {(target_dist*0.000621):.2f}mi", end="\r")
            else:
                print(f"OUT: Speed {speed_ms*3.6:.1f} km/h | Trip {trip_m/1000:.2f}km | Rem: {target_dist/1000:.2f}km", end="\r")
            
            # Frenado suave al acercarse
            trigger_dist = 1600 if unit == 'MPH' else 1200
            if target_dist < trigger_dist:
                decel = 0.5 if target_dist > 400 else 0.8
                speed_ms = max(0.5, speed_ms - (decel * 0.1))
            
            target_dist -= (speed_ms * 0.1)
            trip_m += (speed_ms * 0.1)
            
            time.sleep(0.1)
        except Exception as e:
            print(f"\nError escribiendo: {e}")
            break

    print("\nSimulación completada.")

if __name__ == "__main__":
    import sys
    unit = 'MPH'
    if len(sys.argv) > 1:
        unit = sys.argv[1].upper()
    simulate_approach(unit)
