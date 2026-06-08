import sys, traceback, json as _json
sys.path.insert(0, 'Dastsc-V3/backend')

body_bytes = b'{"profile":"class323","notch":"B2","start_speed_ms":18.0,"end_speed_ms":0.0,"avg_decel_ms2":0.7,"max_decel_ms2":1.0,"duration_s":20.0,"distance_m":250,"gradient":0.5,"train_mass":264,"train_length":144,"loco":"test"}'

try:
    import core.brake_log as brake_log
    body = _json.loads(body_bytes)
    import time
    body['timestamp'] = body.get('timestamp') or time.time()
    brake_log.append_event(body)
    print('OK - guardado')
except Exception:
    traceback.print_exc()
