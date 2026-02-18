import tkinter as tk
from tkinter import ttk, simpledialog
import os
import json

# Configuración de rutas
GETDATA_PATH = r"C:\Program Files (x86)\Steam\steamapps\common\RailWorks\plugins\GetData.txt"
# La carpeta profiles está un nivel arriba de src/
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROFILES_DIR = os.path.join(BASE_DIR, "profiles")

class TSCDashboard:
    def __init__(self, root):
        self.root = root
        self.root.title("TSC Advanced Dashboard")
        self.root.geometry("500x750")
        self.root.attributes("-topmost", True)
        self.root.configure(bg="#1a1a1a")
        
        self.data = {}
        self.current_profile = None
        self.profiles = self.load_profiles()
        self.train_length = 61.0  # Por defecto 3 coches Class 323
        self.train_mass = 0.0     # Masa total en toneladas
        self.current_track_limit = 0.0
        self.effective_show_limit = 0.0
        self.last_sim_time = 0.0
        self.distance_travelled_since_limit = 0.0
        self.waiting_for_clearance = False
        self.last_next_dist = 0.0
        self.pending_limit = 0.0
        
        # --- Estilos ---
        style = ttk.Style()
        style.theme_use('clam')
        style.configure("TProgressbar", thickness=30)
        style.configure("Green.TProgressbar", foreground='#2ecc71', background='#2ecc71')

        # --- Título ---
        self.container = tk.Frame(root, bg="#1a1a1a")
        self.container.pack(fill="both", expand=True, padx=20, pady=20)
        container = self.container

        self.lbl_loco = tk.Label(container, text="DETECTANDO TREN...", font=("Segoe UI", 12, "bold"), fg="#3498db", bg="#1a1a1a")
        self.lbl_loco.pack(pady=(0, 10))

        # --- Velocímetro ---
        self.speed_frame = tk.Frame(container, bg="#1a1a1a")
        self.speed_frame.pack(fill="x", pady=10)
        
        self.lbl_speed_val = tk.Label(self.speed_frame, text="0.0", font=("Consolas", 64, "bold"), fg="#ecf0f1", bg="#1a1a1a")
        self.lbl_speed_val.pack()
        
        self.lbl_speed_unit = tk.Label(self.speed_frame, text="MPH", font=("Segoe UI", 12), fg="#95a5a6", bg="#1a1a1a")
        self.lbl_speed_unit.pack()

        # --- Límite de Velocidad y Alerta de Aceleración ---
        self.limit_master_frame = tk.Frame(container, bg="#1a1a1a")
        self.limit_master_frame.pack(fill="x", pady=5)

        self.limit_frame = tk.Frame(self.limit_master_frame, bg="#34495e", padx=15, pady=10)
        self.limit_frame.pack(side="left", padx=5)
        self.lbl_limit = tk.Label(self.limit_frame, text="LIMIT: --", font=("Segoe UI", 20, "bold"), fg="#f1c40f", bg="#34495e")
        self.lbl_limit.pack()

        self.clearance_frame = tk.Frame(self.limit_master_frame, bg="#2c3e50", padx=10, pady=5)
        self.clearance_frame.pack(side="right", fill="both", expand=True, padx=5)
        self.lbl_clearance = tk.Label(self.clearance_frame, text="ESPERANDO COLA", font=("Segoe UI", 10, "bold"), fg="#bdc3c7", bg="#2c3e50")
        self.lbl_clearance.pack()
        self.bar_clearance = ttk.Progressbar(self.clearance_frame, orient="horizontal", mode="determinate")
        self.bar_clearance.pack(fill="x", pady=2)

        # --- Próximo Límite ---
        self.next_limit_frame = tk.Frame(container, bg="#1a1a1a")
        self.next_limit_frame.pack(pady=5)
        self.lbl_next_limit = tk.Label(self.next_limit_frame, text="PRÓX: -- MPH en --- m", font=("Segoe UI", 10), fg="#bdc3c7", bg="#1a1a1a")
        self.lbl_next_limit.pack()

        # --- Semáforo / Señal Próxima ---
        self.signal_frame = tk.Frame(container, bg="#1a1a1a", pady=10)
        self.signal_frame.pack(fill="x")
        
        self.lbl_sig_text = tk.Label(self.signal_frame, text="PRÓX. SEÑAL", font=("Segoe UI", 9, "bold"), fg="#7f8c8d", bg="#1a1a1a")
        self.lbl_sig_text.pack()
        
        self.sig_lamp = tk.Label(self.signal_frame, text="●", font=("Segoe UI", 32), fg="#2c3e50", bg="#1a1a1a")
        self.sig_lamp.pack(side="left", padx=(100, 10))
        
        self.lbl_sig_dist = tk.Label(self.signal_frame, text="--- m", font=("Consolas", 18, "bold"), fg="#ecf0f1", bg="#1a1a1a")
        self.lbl_sig_dist.pack(side="left")

        # --- Barra de Tracción / Freno ---
        tk.Label(container, text="POTENCIA / FRENO COMBINADO", font=("Segoe UI", 9), fg="#bdc3c7", bg="#1a1a1a").pack(pady=(15, 0))
        self.bar_control = ttk.Progressbar(container, orient="horizontal", length=400, mode="determinate")
        self.bar_control.pack(pady=5)
        self.lbl_control_txt = tk.Label(container, text="NEUTRO", font=("Segoe UI", 12, "bold"), fg="#ecf0f1", bg="#1a1a1a")
        self.lbl_control_txt.pack()

        # --- Esfuerzo / Amperaje ---
        self.effort_frame = tk.Frame(container, bg="#1a1a1a")
        self.effort_frame.pack(fill="x", pady=5)
        
        self.lbl_effort = tk.Label(self.effort_frame, text="EFFORT: -- kN", font=("Segoe UI", 10, "bold"), fg="#9b59b6", bg="#1a1a1a")
        self.lbl_effort.pack(side="left", expand=True)
        
        self.lbl_amps = tk.Label(self.effort_frame, text="AMPS: -- A", font=("Segoe UI", 10, "bold"), fg="#f39c12", bg="#1a1a1a")
        self.lbl_amps.pack(side="left", expand=True)

        # --- Panel de Seguridad ---
        self.safety_frame = tk.Frame(container, bg="#1a1a1a")
        self.safety_frame.pack(fill="x", pady=20)
        
        self.aws_light = tk.Label(self.safety_frame, text="AWS", font=("Segoe UI", 14, "bold"), fg="#2c3e50", bg="#34495e", width=10, height=2)
        self.aws_light.pack(side="left", expand=True, padx=5)

        self.dsd_light = tk.Label(self.safety_frame, text="DSD", font=("Segoe UI", 14, "bold"), fg="#2c3e50", bg="#34495e", width=12, height=2)
        self.dsd_light.pack(side="left", expand=True, padx=5)

        self.grad_label = tk.Label(self.safety_frame, text="GRAD: 0.0%", font=("Segoe UI", 12, "bold"), fg="#ecf0f1", bg="#2980b9", width=10, height=2)
        self.grad_label.pack(side="left", expand=True, padx=5)

        self.curve_label = tk.Label(self.safety_frame, text="CURVA: RECTA", font=("Segoe UI", 10, "bold"), fg="#ecf0f1", bg="#27ae60", width=12, height=2)
        self.curve_label.pack(side="left", expand=True, padx=5)

        self.accel_phys_label = tk.Label(self.safety_frame, text="ACC: 0.00", font=("Segoe UI", 12, "bold"), fg="#ecf0f1", bg="#8e44ad", width=10, height=2)
        self.accel_phys_label.pack(side="left", expand=True, padx=5)

        # --- Presión de Frenos ---
        self.brake_frame = tk.Frame(container, bg="#1a1a1a")
        self.brake_frame.pack(fill="x", pady=5)
        
        self.lbl_brake_cyl = tk.Label(self.brake_frame, text="CYL: 0.00 BAR", font=("Consolas", 10), fg="#e74c3c", bg="#1a1a1a")
        self.lbl_brake_cyl.pack(side="left", expand=True)
        
        self.lbl_brake_pipe = tk.Label(self.brake_frame, text="PIPE: 0.00 BAR", font=("Consolas", 10), fg="#2ecc71", bg="#1a1a1a")
        self.lbl_brake_pipe.pack(side="left", expand=True)

        # --- Info del Tren y Configuración ---
        self.config_frame = tk.Frame(container, bg="#2c3e50", pady=10)
        self.config_frame.pack(fill="x", pady=10)
        
        tk.Label(self.config_frame, text="CONFIGURACIÓN DEL TREN", font=("Segoe UI", 9, "bold"), fg="#3498db", bg="#2c3e50").pack()
        
        btn_frame = tk.Frame(self.config_frame, bg="#2c3e50")
        btn_frame.pack()
        
        tk.Button(btn_frame, text="3 COCHES (61m)", command=lambda: self.set_length(61), bg="#34495e", fg="white").pack(side="left", padx=5)
        tk.Button(btn_frame, text="6 COCHES (122m)", command=lambda: self.set_length(122), bg="#34495e", fg="white").pack(side="left", padx=5)
        
        self.lbl_train_info = tk.Label(self.config_frame, text="LARGO: 61.0 m | MASA: --- t", bg="#2c3e50", fg="#ecf0f1", font=("Segoe UI", 10))
        self.lbl_train_info.pack(pady=5)

        # --- Status Bar ---
        self.status_label = tk.Label(root, text="Buscando datos...", bg="#1a1a1a", fg="#7f8c8d", font=("Segoe UI", 8))
        self.status_label.pack(side="bottom", fill="x")

        # --- Interactividad ---
        self.setup_interactivity()
        
        self.update_dashboard()

    def setup_interactivity(self):
        """Configura los elementos que pueden ser marcados y editados"""
        # Elementos editables: Diccionario de {label: (nombre_atributo, titulo_dialogo)}
        self.editable_elements = {
            self.lbl_loco: ("loco_name_override", "Renombrar Tren"),
            self.lbl_limit: ("limit_override", "Forzar Límite de Velocidad"),
            self.lbl_train_info: ("train_length", "Ajustar Largo del Tren (m)")
        }
        
        self.loco_name_override = None
        self.limit_override = None

        for lbl, info in self.editable_elements.items():
            lbl.config(cursor="hand2")
            lbl.bind("<Enter>", lambda e, label=lbl: label.config(fg="#34e7e4")) # Resaltar al pasar
            lbl.bind("<Leave>", lambda e, label=lbl: self.restore_label_color(label))
            lbl.bind("<Button-1>", lambda e, label=lbl: self.edit_element(label))

    def restore_label_color(self, label):
        # Restaura el color original o el color de "Manual Override"
        if label == self.lbl_loco: 
            label.config(fg="#34e7e4" if self.loco_name_override else "#3498db")
        elif label == self.lbl_limit: 
            label.config(fg="#34e7e4" if self.limit_override is not None else "#f1c40f")
        elif label == self.lbl_train_info: 
            label.config(fg="#ecf0f1")

    def edit_element(self, label):
        attr, title = self.editable_elements[label]
        current_val = getattr(self, attr) if hasattr(self, attr) else ""
        
        # Subrayar para indicar selección
        original_font = label.cget("font")
        label.config(font=original_font + " underline")
        
        new_val = simpledialog.askstring("Modificar Dashboard", f"{title}:", initialvalue=current_val)
        
        # Quitar subrayado
        label.config(font=original_font.replace(" underline", ""))
        
        if new_val is not None:
            if attr == "train_length" or attr == "limit_override":
                try:
                    setattr(self, attr, float(new_val))
                    if attr == "train_length":
                        self.set_length(float(new_val))
                except ValueError:
                    pass
            else:
                setattr(self, attr, new_val)
            print(f"Modificado: {attr} -> {new_val}")

    def load_profiles(self):
        profiles = []
        if os.path.exists(PROFILES_DIR):
            for f in os.listdir(PROFILES_DIR):
                if f.endswith(".json"):
                    try:
                        with open(os.path.join(PROFILES_DIR, f), "r") as pf:
                            profiles.append(json.load(pf))
                    except Exception:
                        pass
        return profiles

    def detect_profile(self, data):
        # Primero intentamos por nombre de tren si lo tenemos
        loco_name = data.get("LocoName", "").lower()
        for p in self.profiles:
            if "name" in p and p["name"].lower() in loco_name:
                return p
        
        # Si no, por fingerprint (controles que existen)
        for p in self.profiles:
            fingerprint = p.get("fingerprint", {})
            required = fingerprint.get("required_controls", [])
            if required and all(req in data for req in required):
                return p
        return None

    def set_length(self, length):
        self.train_length = float(length)
        self.update_train_info()

    def update_train_info(self):
        mass_text = f"{self.train_mass:.1f} t" if self.train_mass > 0 else "--- t"
        self.lbl_train_info.config(text=f"LARGO: {self.train_length:.1f} m | MASA: {mass_text}")

    def read_getdata(self):
        if not os.path.exists(GETDATA_PATH):
            return None
        try:
            new_data = {}
            current_name = None
            with open(GETDATA_PATH, "r") as f:
                lines = f.readlines()
                for line in lines:
                    line = line.strip()
                    if line.startswith("ControlName:"):
                        parts = line.split(":", 1)
                        if len(parts) > 1:
                            current_name = parts[1].strip()
                    elif line.startswith("ControlValue:") and current_name:
                        parts = line.split(":", 1)
                        if len(parts) > 1:
                            value = parts[1].strip()
                            new_data[current_name] = value
            return new_data
        except Exception:
            return None

    def update_dashboard(self):
        # Cada vez que leemos datos, si no tenemos perfil cargado o queremos ser robustos
        # podriamos recargar perfiles, pero es costoso. 
        # Mejor lo dejamos como esta pero aseguramos la deteccion.
        data = self.read_getdata()
        if data:
            # Detectar o cambiar de perfil si es necesario
            new_profile = self.detect_profile(data)
            if new_profile and (not self.current_profile or new_profile["name"] != self.current_profile["name"]):
                self.current_profile = new_profile
                print(f"PERFIL DETECTADO: {self.current_profile['name']}")
                # Actualizar el nombre visual inmediatamente si no hay override manual
                if not self.loco_name_override:
                    self.lbl_loco.config(text=self.current_profile["name"].upper(), fg="#3498db")

            # 0. Sincronización de Tiempo para Odrómetro Preciso
            sim_time = float(data.get("SimulationTime", 0))
            dt = sim_time - self.last_sim_time if self.last_sim_time > 0 else 0.2
            if dt < 0 or dt > 1.0:
                dt = 0.2  # Protección contra resets
            self.last_sim_time = sim_time

            # 1. Velocidad (Consolidada en MPH)
            # Luat script manda m/s en CurrentSpeed, lo pasamos a MPH siempre para lógica
            speed_ms = float(data.get("CurrentSpeed", 0))
            speed_mph = speed_ms * 2.237
            
            # Si el tren usa KPH, mostramos KPH en el número grande, pero la lógica sigue en MPH/metros
            speedo_type = int(float(data.get("SpeedoType", 1)))
            display_speed = speed_ms * 3.6 if speedo_type == 2 else speed_mph
            display_unit = "KPH" if speedo_type == 2 else "MPH"

            limit_mph = float(data.get("CurrentSpeedLimit", 0))
            next_limit_speed = float(data.get("NextSpeedLimitSpeed", 0))
            next_limit_dist = float(data.get("NextSpeedLimitDistance", 0))
            
            # --- Lógica Proactiva (Disparo al pasar la Locomotora) ---
            
            # Detectamos si acabamos de cruzar una señal (la distancia al siguiente límite salta de pequeña a grande)
            if self.last_next_dist < 15.0 and next_limit_dist > 100.0:
                # Si el límite que íbamos a alcanzar es mayor que el actual (SUBIDA)
                if self.pending_limit > limit_mph:
                    self.waiting_for_clearance = True
                    self.distance_travelled_since_limit = 0.0
                    print(f"LOCOMOTORA PASÓ SEÑAL: Iniciando cuenta de {self.train_length}m")
                else:
                    # Es una bajada o el mismo límite, no hay espera
                    self.waiting_for_clearance = False
                    self.effective_show_limit = limit_mph

            # Si el límite de la vía baja de repente (sin cruce de señal detectado), aplicamos por seguridad
            if limit_mph < self.effective_show_limit:
                self.waiting_for_clearance = False
                self.effective_show_limit = limit_mph
                self.distance_travelled_since_limit = 0.0

            # Si no estamos esperando cola, el límite efectivo es el de la vía
            if not self.waiting_for_clearance:
                self.effective_show_limit = limit_mph

            # APLICAR SOBREESCRITURA MANUAL SI EXISTE
            if self.limit_override is not None:
                self.effective_show_limit = self.limit_override

            self.last_next_dist = next_limit_dist
            self.pending_limit = next_limit_speed
            self.current_track_limit = limit_mph

            if self.waiting_for_clearance:
                # Odrómetro: distancia = velocidad (m/s) * tiempo delta (s)
                # Usamos abs por si el tren retrocede, que siga contando metros de alejamiento
                self.distance_travelled_since_limit += abs(speed_ms) * dt
                
                percent = (self.distance_travelled_since_limit / self.train_length) * 100
                self.bar_clearance["value"] = min(percent, 100)
                
                metros_falta = max(0, self.train_length - self.distance_travelled_since_limit)
                
                if metros_falta <= 0:
                    self.waiting_for_clearance = False
                    self.effective_show_limit = limit_mph # Ahora sí permitimos la nueva velocidad
                    self.lbl_clearance.config(text="¡COLA PASADA! ACELERA", fg="#2ecc71")
                    self.clearance_frame.config(bg="#1e3a2b")
                else:
                    # Mostramos los metros que faltan para que la cola libre la señal
                    self.lbl_clearance.config(text=f"COLA: -{metros_falta:.1f}m", fg="#f1c40f")
                    self.clearance_frame.config(bg="#3e2e1e")
            else:
                self.bar_clearance["value"] = 0
                self.lbl_clearance.config(text="VÍA LIBRE", fg="#bdc3c7")
                self.clearance_frame.config(bg="#2c3e50")

            # Actualizar UI Velocidad
            self.lbl_speed_val.config(text=f"{display_speed:.1f}")
            self.lbl_speed_unit.config(text=display_unit)
            
            # Cambiar color si es manual (override)
            limit_color = "#34e7e4" if self.limit_override is not None else "#f1c40f"
            self.lbl_limit.config(text=f"LIMIT: {self.effective_show_limit:.0f}", fg=limit_color)
            
            # Alerta visual de exceso según el límite EFECTIVO
            if speed_mph > self.effective_show_limit + 1:
                self.lbl_speed_val.config(fg="#e74c3c")
            else:
                self.lbl_speed_val.config(fg="#ecf0f1")

            # 2. Próximo Límite
            next_limit_speed = float(data.get("NextSpeedLimitSpeed", 0))
            next_limit_dist = float(data.get("NextSpeedLimitDistance", 0))
            self.lbl_next_limit.config(text=f"PRÓX: {next_limit_speed:.0f} MPH en {next_limit_dist:.0f} m")

            # 2.5 Lógica de Semáforo (Novedad mejorada BCC)
            sig_state_raw = data.get("NextSignalState")
            sig_dist_raw = data.get("DistanceToNextSignal")
            sig_internal = data.get("InternalAspect") # Si viene por separado
            
            # Convertir a flotante
            sig_state = float(sig_state_raw) if sig_state_raw is not None else -1.0
            sig_dist = float(sig_dist_raw) if sig_dist_raw is not None else -1.0

            # Prioridad 1: Uso de Aspecto Interno
            if sig_internal is not None and float(sig_internal) >= 0:
                sig_state = float(sig_internal)
            
            # Mapeo de Colores TSC
            colors = {
                0: ("#e74c3c", "PELIGRO / ALTO"),   # Rojo
                1: ("#f1c40f", "PRECAUCIÓN"),        # Amarillo
                2: ("#f39c12", "PRECAUCIÓN AV."),     # Doble Amarillo
                3: ("#2ecc71", "VÍA LIBRE"),        # Verde
                4: ("#3498db", "MANIOBRA / FLASH"),  # Azul/Blanco/Destello
                10: ("#f1c40f", "AMARILLO FLASH"),
                11: ("#f39c12", "D. AMARILLO FLASH"),
            }

            if sig_state >= 0:
                s = int(sig_state)
                # Si el proState nos da un valor > 5, es probable que sea uno de los flash (10, 11)
                # de la API restrictiva. Los mapeamos aquí.
                d = sig_dist if sig_dist >= 0 else 0
                
                color, desc = colors.get(s, ("#7f8c8d", f"ESTADO {s}"))
                
                # Heurística para BCC: Si d es -2 (ciego), indicar que es una estimación.
                is_blind = sig_dist < 0
                prefix = "SEÑAL (Est.):" if is_blind else "SEÑAL:"
                
                self.sig_lamp.config(fg=color)
                dist_text = f"{d:.0f} m" if d > 0 else ("VISTA" if not is_blind else "--- m")
                self.lbl_sig_dist.config(text=dist_text, fg=color)
                self.lbl_sig_text.config(text=f"{prefix} {desc}", fg=color)
            else:
                # Si fallan las señales directas, usamos el AWS como sensor indirecto
                aws_val = float(data.get("AWS", 0)) if data.get("AWS") else 0
                speed_ms = float(data.get("CurrentSpeed", 0))
                
                # Si nos movemos y hay AWS, es probable que haya una restricción
                if aws_val > 0.5 and speed_ms > 1.0:
                    self.lbl_sig_text.config(text="SENSOR: POSIBLE RESTRICCIÓN", fg="#f1c40f")
                    self.sig_lamp.config(fg="#f1c40f")
                    self.lbl_sig_dist.config(text="REDUCIR", fg="#f1c40f")
                else:
                    status_sig = "BUSCANDO..." if sig_state == -2 else "SIN DATOS"
                    self.lbl_sig_text.config(text=f"SEÑALES: {status_sig}", fg="#7f8c8d")
                    self.sig_lamp.config(fg="#2c3e50")
                    self.lbl_sig_dist.config(text="--- m", fg="#7f8c8d")

            # 3. Mando / Potencia (Basado en Perfil y Tipo de Freno)
            if self.current_profile:
                mappings = self.current_profile.get("mappings", {})
                brakes_cfg = self.current_profile.get("brakes", {})
                
                # --- Lógica de Potencia ---
                if "combined_control" in mappings:
                    control_key = mappings["combined_control"]
                    control_val = float(data.get(control_key, 0))
                    # Dividimos el mando visualmente: 50 neutral, 0-50 freno, 50-100 potencia
                    bar_val = (control_val + 1) * 50 
                    self.bar_control["value"] = bar_val
                    
                    if control_val > 0.05:
                        self.lbl_control_txt.config(text=f"POTENCIA: {control_val*100:.0f}%", fg="#2ecc71")
                    elif control_val < -0.05:
                        # Detectar si es un freno puro o blended
                        brake_type = brakes_cfg.get("type", "COMBINED")
                        self.lbl_control_txt.config(text=f"FRENADO ({brake_type}): {abs(control_val)*100:.0f}%", fg="#e67e22")
                    else:
                        self.lbl_control_txt.config(text="NEUTRAL", fg="#ecf0f1")
                else:
                    # Controles Separados (Regulator y distintos tipos de freno)
                    throttle_key = mappings.get("regulator", mappings.get("throttle", "Regulator"))
                    t_val = float(data.get(throttle_key, 0))
                    
                    # Prioridad de Freno: 1. Dinámico, 2. Tren (Air), 3. Locomotora (Engine)
                    brake_train_key = mappings.get("train_brake", mappings.get("brake", "TrainBrakeControl"))
                    brake_dyn_key = mappings.get("dynamic_brake", "DynamicBrake")
                    
                    b_train = float(data.get(brake_train_key, 0))
                    b_dyn = float(data.get(brake_dyn_key, 0))
                    
                    if t_val > 0.01:
                        self.bar_control["value"] = 50 + (t_val * 50)
                        self.lbl_control_txt.config(text=f"TRACCIÓN: {t_val*100:.0f}%", fg="#2ecc71")
                    elif b_train > 0.01 or b_dyn > 0.01:
                        # Mostramos el que esté más aplicado para la barra
                        b_max = max(b_train, b_dyn)
                        self.bar_control["value"] = 50 - (b_max * 50)
                        
                        brake_type = brakes_cfg.get("type", "DISCRETE")
                        text = f"FRENADO ({brake_type}): {b_max*100:.0f}%"
                        if b_dyn > b_train:
                            text += " (DYN)"
                        self.lbl_control_txt.config(text=text, fg="#e67e22")
                    else:
                        self.bar_control["value"] = 50
                        self.lbl_control_txt.config(text="NEUTRAL", fg="#ecf0f1")
                
                # Esfuerzo de Tracción (Tractive Effort / Ammeter)
                effort_key = mappings.get("effort") or ("TractiveEffort" if "TractiveEffort" in data else None)
                if effort_key and effort_key in data:
                    val = float(data[effort_key])
                    self.lbl_effort.config(text=f"EFFORT: {val:.1f} kN")
                else:
                    self.lbl_effort.config(text="EFFORT: -- kN")
                
                amps_key = mappings.get("ammeter") or mappings.get("current")
                if not amps_key:  # Fallback automático
                    if "Current" in data:
                        amps_key = "Current"
                    elif "Ammeter" in data:
                        amps_key = "Ammeter"

                if amps_key and amps_key in data:
                    val = float(data[amps_key])
                    # Algunos trenes mandan valores negativos en frenada regenerativa
                    self.lbl_amps.config(text=f"AMPS: {val:.0f} A")
                else:
                    self.lbl_amps.config(text="AMPS: -- A")
            else:
                # Fallback sin perfil
                self.lbl_effort.config(text=f"EFFORT: {float(data.get('TractiveEffort', 0)):.1f} kN")
                amps_val = data.get("Current") or data.get("Ammeter") or 0
                self.lbl_amps.config(text=f"AMPS: {float(amps_val):.0f} A")
            
            # 4. AWS y 5. DSD/DRA (Sistema de Alertas Inmersivas)
            aws_active = float(data.get("AWS", 0)) > 0.5
            dsd_keys = ["DSD", "Vigilance", "VigilAlarm", "DriverVigilanceAlarm", "VigilanceAlarm", "Deadman", "DVDAlarm"]
            dsd_active = any(float(data.get(k, 0)) > 0.5 for k in dsd_keys)
            dra_active = float(data.get("DRA", 0)) > 0.5 or float(data.get("DRALight", 0)) > 0.5

            # Variables para control de parpadeo de pantalla
            screen_flash_color = "#1a1a1a"

            # Lógica AWS
            if aws_active:
                is_aws_tick = (int(sim_time * 5) % 2 == 0)
                dra_for_aws = dra_active
                if dra_for_aws:
                    # Si hay DRA, AWS suele estar bloqueado o es un aviso persistente.
                    # Mantenemos la luz fija y NO parpadeamos la pantalla.
                    self.aws_light.config(bg="#e67e22", fg="#ffffff", text="AWS (DRA)")
                else:
                    # AVISO AWS ACTIVO: Luz parpadeante y parpadeo de pantalla.
                    new_bg = "#f1c40f" if is_aws_tick else "#34495e"
                    self.aws_light.config(bg=new_bg, fg="#000000", text="AWS ALERT")
                    if is_aws_tick:
                        screen_flash_color = "#3e3a1e"
            else:
                self.aws_light.config(bg="#2c3e50", fg="#1a1a1a", text="") # Apagado

            # Lógica DSD y DRA
            if dra_active:
                # DRA ACTIVO: Luz fija (es un estado, no un aviso momentáneo).
                # No parpadeamos la pantalla para no molestar en paradas largas.
                self.dsd_light.config(bg="#e67e22", fg="#ffffff", text="DRA ACTIVO")
            elif dsd_active:
                # AVISO DSD (HOMBRE MUERTO): Parpadeo de luz y pantalla (prioridad).
                is_red_tick = (int(sim_time * 5) % 2 == 0)
                self.dsd_light.config(bg="#e74c3c" if is_red_tick else "#34495e", fg="#ffffff", text="¡VIGILANCIA!")
                if is_red_tick:
                    screen_flash_color = "#4c1c1c"
            else:
                self.dsd_light.config(bg="#2c3e50", fg="#1a1a1a", text="") # Apagado

            # Aplicar efecto de parpadeo a toda la pantalla
            if self.root.cget("bg") != screen_flash_color:
                self.root.config(bg=screen_flash_color)
                self.container.config(bg=screen_flash_color)

            # 6. Pantalla de Físicas (Pendiente, Curvas y Frenos)
            grad = float(data.get("Gradient", 0))
            self.grad_label.config(text=f"GRAD: {grad:.1f}%")
            
            # Cálculo de Curvatura y Radio
            cur_k = float(data.get("CurvatureActual", 0))
            ahead_k = float(data.get("CurvatureAhead", 0))
            
            if abs(cur_k) < 0.0001:
                if abs(ahead_k) > 0.0001:
                    dir_icon = "→" if ahead_k > 0 else "←"
                    self.curve_label.config(text=f"VÍA: RECTA ({dir_icon})", bg="#27ae60")
                else:
                    self.curve_label.config(text="VÍA: RECTA", bg="#27ae60")
            else:
                radius = abs(1.0 / cur_k)
                direction = "DER" if cur_k > 0 else "IZQ"
                # Color según radio (Peligro si < 300m)
                color = "#27ae60" if radius > 500 else ("#d35400" if radius > 250 else "#c0392b")
                self.curve_label.config(text=f"R: {radius:.0f}m {direction}", bg=color)

            accel_phys = float(data.get("PhysicalAcceleration", 0))
            self.accel_phys_label.config(text=f"ACC: {accel_phys:.2f}")
            
            cyl_pres = float(data.get("TrainBrakeCylinderPressureBAR", 0))
            pipe_pres = float(data.get("BrakePipePressureBAR", 0))
            self.lbl_brake_cyl.config(text=f"CYL: {cyl_pres:.2f} BAR")
            self.lbl_brake_pipe.config(text=f"PIPE: {pipe_pres:.2f} BAR")

            # 7. Info del Consist (Longitud y Masa)
            auto_length = float(data.get("TrainLength", 0))
            if auto_length > 0 and auto_length != self.train_length:
                self.set_length(auto_length)
            
            auto_mass = float(data.get("TrainMass", 0))
            if auto_mass > 0 and auto_mass != self.train_mass:
                self.train_mass = auto_mass
                self.update_train_info()

            # 8. Identificación del Tren e Escenario
            loco_name_data = data.get("LocoName", "").strip()
            scenario_name = data.get("ScenarioName", "").strip()
            route_name = data.get("RouteName", "").strip()
            
            # Prioridad de nombre: 1. Manual, 2. Perfil detectado, 3. Datos crudos del juego
            if self.loco_name_override:
                display_name = self.loco_name_override
                loco_color = "#34e7e4"
            elif self.current_profile:
                display_name = self.current_profile["name"].upper()
                loco_color = "#3498db"
            elif loco_name_data and "Sin Nombre" not in loco_name_data:
                display_name = loco_name_data.split("\\")[-1].replace(".xml", "").replace(".bin", "").upper()
                loco_color = "#3498db"
            else:
                display_name = "TREN DESCONOCIDO"
                loco_color = "#7f8c8d"

            self.lbl_loco.config(text=display_name, fg=loco_color)
            
            status_parts = []
            if scenario_name and "Sin Nombre" not in scenario_name:
                status_parts.append(f"ESC: {scenario_name}")
            if route_name:
                status_parts.append(f"RUTA: {route_name}")
            
            status_text = " | ".join(status_parts) if status_parts else "CONECTADO - TSC DATALINK OK"
            self.status_label.config(text=status_text)
        
        self.root.after(200, self.update_dashboard)

if __name__ == "__main__":
    root = tk.Tk()
    app = TSCDashboard(root)
    root.mainloop()
