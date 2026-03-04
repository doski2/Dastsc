import httpx
import asyncio

async def test_scenarios():
    base_url = "http://localhost:8000"
    
    print("--- PRUEBA DE ESCENARIOS ---")
    async with httpx.AsyncClient() as client:
        try:
            # 1. Obtener lista de escenarios
            print("\n1. Obteniendo lista de escenarios...")
            r = await client.get(f"{base_url}/scenarios")
            if r.status_code == 200:
                scenarios = r.json()
                print(f"Éxito: Se han encontrado {len(scenarios)} escenarios.")
                
                if scenarios:
                    # Ver si encontramos el que nos interesa
                    cross_city = next((s for s in scenarios if "City" in s['name'] or "Bird" in s['name']), scenarios[0])
                    print(f"Probando con escenario: {cross_city['name']}")
                    
                    # 2. Obtener paradas del escenario
                    print(f"\n2. Obteniendo paradas para: {cross_city['name']}...")
                    r_stops = await client.get(f"{base_url}/scenarios/stops", params={"path": cross_city['path']})
                    if r_stops.status_code == 200:
                        stops = r_stops.json()
                        print(f"Éxito: Se han encontrado {len(stops)} paradas.")
                        
                        # Mostrar las primeras 10 paradas
                        for i, stop in enumerate(stops[:10]):
                            tipo = "pasa" if stop['is_platform'] else "técn"
                            status = "CUMP" if stop['satisfied'] else "PEND"
                            due = stop['due_time'] if stop['due_time'] else "N/A"
                            print(f" [{i+1}] {stop['name'][:25]} ({tipo}) - {status} - Due: {due}")
                    else:
                        print(f"Error al obtener paradas: {r_stops.status_code}")
            else:
                print(f"Error al obtener escenarios: {r.status_code}. ¿Está el backend encendido?")
                
        except Exception as e:
            print(f"Error de conexión: {e}")

if __name__ == "__main__":
    asyncio.run(test_scenarios())
