import json

with open('Dastsc-V3/backend/data/brake_events.json', 'r', encoding='utf-8') as f:
    events = json.load(f)

before = len(events)
clean = [e for e in events if e.get('notch', '?') != '?' and e.get('avg_decel_ms2', 0) >= 0.1]
after = len(clean)

with open('Dastsc-V3/backend/data/brake_events.json', 'w', encoding='utf-8') as f:
    json.dump(clean, f, ensure_ascii=False, indent=2)

print(f'Purgados: {before - after} | Conservados: {after}')
for e in clean:
    p = e.get('profile', '?')
    n = e.get('notch', '?')
    avg = e.get('avg_decel_ms2', 0)
    v0 = e.get('start_speed_ms', 0)
    v1 = e.get('end_speed_ms', 0)
    print(f'  {p:12s}  notch={n:5s}  avg={avg:.3f}  {v0:.1f}->{v1:.1f}')
