#!/usr/bin/env python3
"""
nexus-profile-wizard.py — Asistente GUI para crear y completar perfiles de tren.

Requisitos:
  - Train Simulator Classic en escenario, en cabina (para captura RailDriver).
  - Python con tkinter (incluido en Python Windows).

Uso:
  python nexus-profile-wizard.py
  Asistente_Perfil.bat
"""
from __future__ import annotations

import json
import sys
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parent
BACKEND_DIR = ROOT / "Dastsc-V3" / "backend"
PROFILES_DIR = ROOT / "profiles"
sys.path.insert(0, str(BACKEND_DIR))

from core.brake_log import get_stats  # noqa: E402
from core.profile_checklist import (  # noqa: E402
    STATUS_INHERITED,
    STATUS_MISSING,
    STATUS_OK,
    STATUS_WARN,
    build_profile_checklist,
)
from core.notch_capture import (  # noqa: E402
    apply_notches_to_profile,
    brake_control_candidates,
    canonicalize_notches,
    capture_notch,
    capture_sequence_for_profile,
    default_brake_control,
    describe_graduated_capture,
    existing_labels,
    normalize_notch_label,
    preset_labels_for_profile,
    read_brake_control_value,
    sort_notches,
    suggest_next_label,
)
from core.profile_draft import (  # noqa: E402
    apply_extends_template,
    build_profile_draft,
    merge_draft_into_profile,
)
from core.profiles import ProfileManager  # noqa: E402
from core.raildriver import get_raildriver_client  # noqa: E402

STATUS_LABELS = {
    STATUS_OK: "OK",
    STATUS_WARN: "AVISO",
    STATUS_MISSING: "FALTA",
    STATUS_INHERITED: "HEREDA",
}

STATUS_TAGS = {
    STATUS_OK: "ok",
    STATUS_WARN: "warn",
    STATUS_MISSING: "missing",
    STATUS_INHERITED: "inherited",
}


class NotchCaptureDialog(tk.Toplevel):
    """Captura manual muesca a muesca leyendo GetControllerValue en cabina."""

    def __init__(self, parent: ProfileWizardApp) -> None:
        super().__init__(parent.root)
        self.app = parent
        self.title("Capturar muescas de freno")
        self.geometry("640x520")
        self.minsize(560, 460)
        self.transient(parent.root)
        self.grab_set()

        self.notches: List[Dict[str, Any]] = []
        self.last_control = ""
        self._build_ui()
        self._load_from_profile()
        self._refresh_controls()

    def _build_ui(self) -> None:
        self.intro_var = tk.StringVar()
        intro = ttk.Label(
            self,
            textvariable=self.intro_var,
            justify=tk.LEFT,
            padding=8,
        )
        intro.pack(fill=tk.X)
        self._refresh_intro_text()

        form = ttk.Frame(self, padding=(8, 0))
        form.pack(fill=tk.X)

        ttk.Label(form, text="Mando:").grid(row=0, column=0, sticky=tk.W, padx=(0, 4))
        self.control_var = tk.StringVar()
        self.control_combo = ttk.Combobox(form, textvariable=self.control_var, width=28, state="readonly")
        self.control_combo.grid(row=0, column=1, sticky=tk.W)
        ttk.Button(form, text="Actualizar mandos", command=self._refresh_controls).grid(row=0, column=2, padx=(8, 0))

        ttk.Label(form, text="Etiqueta:").grid(row=1, column=0, sticky=tk.W, pady=(8, 0))
        self.label_var = tk.StringVar(value="EMG")
        self.label_combo = ttk.Combobox(
            form,
            textvariable=self.label_var,
            width=12,
            values=list(preset_labels_for_profile(self.app.profile)),
        )
        self.label_combo.grid(row=1, column=1, sticky=tk.W, pady=(8, 0))

        ttk.Button(form, text="Secuencia sugerida", command=self._load_suggested_sequence).grid(
            row=1, column=3, padx=(8, 0), pady=(8, 0),
        )

        ttk.Button(form, text="Capturar esta muesca", command=self._capture_one).grid(
            row=1, column=2, padx=(8, 0), pady=(8, 0),
        )

        self.live_var = tk.StringVar(value="Valor en cabina: —")
        ttk.Label(form, textvariable=self.live_var).grid(row=2, column=0, columnspan=3, sticky=tk.W, pady=(8, 0))
        ttk.Button(form, text="Leer valor actual", command=self._preview_value).grid(row=2, column=2, sticky=tk.E, pady=(8, 0))

        self.list_frame = ttk.LabelFrame(self, text="Muescas capturadas", padding=4)
        self.list_frame.pack(fill=tk.BOTH, expand=True, padx=8, pady=8)

        cols = ("label", "value", "control")
        self.tree = ttk.Treeview(self.list_frame, columns=cols, show="headings", height=12)
        self.tree.heading("label", text="Etiqueta")
        self.tree.heading("value", text="Value")
        self.tree.heading("control", text="Mando")
        self.tree.column("label", width=90, anchor=tk.CENTER)
        self.tree.column("value", width=90, anchor=tk.CENTER)
        self.tree.column("control", width=220)
        scroll = ttk.Scrollbar(self.list_frame, orient=tk.VERTICAL, command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scroll.pack(side=tk.RIGHT, fill=tk.Y)

        btn_row = ttk.Frame(self, padding=8)
        btn_row.pack(fill=tk.X)
        ttk.Button(btn_row, text="Quitar seleccionada", command=self._remove_selected).pack(side=tk.LEFT)
        ttk.Button(btn_row, text="Vaciar lista", command=self._clear_all).pack(side=tk.LEFT, padx=(8, 0))
        ttk.Button(btn_row, text="Aplicar al perfil", command=self._apply_to_profile).pack(side=tk.RIGHT)
        ttk.Button(btn_row, text="Cerrar", command=self.destroy).pack(side=tk.RIGHT, padx=(0, 8))

    def _load_from_profile(self) -> None:
        existing = (self.app.profile.get("specs") or {}).get("notches_throttle_brake") or []
        self.notches = canonicalize_notches(existing, self.app.profile)
        mappings = self.app.profile.get("mappings") or {}
        self.last_control = (
            mappings.get("combined_control")
            or mappings.get("train_brake")
            or mappings.get("brake")
            or ""
        )
        self._refresh_tree()
        self.label_var.set(suggest_next_label(self.notches, self.app.profile))
        self.label_combo.configure(values=list(preset_labels_for_profile(self.app.profile)))

    def _refresh_intro_text(self) -> None:
        guide = describe_graduated_capture(self.app.profile)
        if guide:
            self.intro_var.set(
                f"{guide['title']} — freno en {guide['control']} (no ThrottleAndBrake).\n"
                f"1) {guide['steps']}.\n"
                "2) Pulsa «Secuencia sugerida» o elige la etiqueta en orden.\n"
                "3) «Capturar esta muesca» en cada posición · «Aplicar al perfil» al terminar.\n"
                f"Orden: {guide['sequence']}"
            )
        else:
            self.intro_var.set(
                "1) Coloca la palanca en la posición deseada.\n"
                "2) Escribe la etiqueta (B1, B2, OFF, EMG…).\n"
                "3) Pulsa «Capturar esta muesca».\n"
                "Repite para cada muesca y luego «Aplicar al perfil»."
            )

    def _load_suggested_sequence(self) -> None:
        seq = capture_sequence_for_profile(self.app.profile)
        used = existing_labels(self.notches, self.app.profile)
        for label in seq:
            if normalize_notch_label(label, self.app.profile) not in used:
                self.label_var.set(normalize_notch_label(label, self.app.profile))
                return
        self.label_var.set(suggest_next_label(self.notches, self.app.profile))

    def _refresh_controls(self) -> None:
        rd = get_raildriver_client()
        if not rd.available:
            messagebox.showerror(
                "RailDriver",
                f"No se encuentra RailDriver64.dll:\n{rd.dll_path}",
                parent=self,
            )
            return
        snap = rd.snapshot()
        if snap is None or not snap.controllers:
            messagebox.showwarning(
                "Sin telemetría",
                "Entra en cabina con TSC en marcha.",
                parent=self,
            )
            return

        candidates = brake_control_candidates(snap, self.app.profile)
        self.control_combo["values"] = candidates
        preferred = self.last_control or default_brake_control(snap, self.app.profile)
        if preferred and preferred in candidates:
            self.control_var.set(preferred)
        elif candidates:
            self.control_var.set(candidates[0])
        self.app.last_controls = [c.name for c in snap.controllers]
        self._preview_value()

    def _selected_control(self) -> str:
        control = self.control_var.get().strip()
        if not control:
            raise ValueError("Selecciona el mando de freno/acelerador.")
        return control

    def _preview_value(self) -> None:
        try:
            rd = get_raildriver_client()
            control = self._selected_control()
            value, ctrl = read_brake_control_value(rd, control)
            self.live_var.set(
                f"Valor en cabina: {value:+.4f}  ({control}  min={ctrl.min_value:g} max={ctrl.max_value:g})",
            )
        except (RuntimeError, ValueError) as exc:
            self.live_var.set(f"Valor en cabina: — ({exc})")

    def _capture_one(self) -> None:
        try:
            rd = get_raildriver_client()
            if not rd.available:
                raise RuntimeError("RailDriver no disponible.")
            control = self._selected_control()
            value, ctrl = read_brake_control_value(rd, control)
            label = self.label_var.get().strip()
            result = capture_notch(label, value, control, self.notches, self.app.profile)
            self.notches = result.notches
            captured_label = normalize_notch_label(label, self.app.profile)
            self.last_control = control
            self._refresh_tree()
            self.label_var.set(suggest_next_label(self.notches, self.app.profile))
            self.live_var.set(
                f"Capturada {captured_label} = {value:+.4f}  ({control}  min={ctrl.min_value:g} max={ctrl.max_value:g})",
            )
            if result.evicted_labels:
                messagebox.showwarning(
                    "Valor duplicado",
                    (
                        f"La lectura {value:+.4f} coincide con: {', '.join(result.evicted_labels)}.\n"
                        "Se han sustituido (deduplicación estándar).\n"
                        "En perfiles graduados % (350, Acela…) usa el perfil correcto "
                        "para conservar todas las etiquetas."
                    ),
                    parent=self,
                )
            elif result.duplicate_value_labels:
                messagebox.showinfo(
                    "Mismo valor en cabina",
                    (
                        f"El valor {value:+.4f} ya aparece en: {', '.join(result.duplicate_value_labels)}.\n"
                        "Muesca guardada igualmente — el juego puede tener menos detentes "
                        "físicos que posiciones en la palanca."
                    ),
                    parent=self,
                )
        except (RuntimeError, ValueError) as exc:
            messagebox.showerror("Captura", str(exc), parent=self)

    def _refresh_tree(self) -> None:
        expected = len(capture_sequence_for_profile(self.app.profile))
        count = len(self.notches)
        self.list_frame.configure(text=f"Muescas capturadas ({count}/{expected})")
        for row in self.tree.get_children():
            self.tree.delete(row)
        control = self.last_control or self.control_var.get().strip()
        for notch in sort_notches(self.notches):
            self.tree.insert(
                "",
                tk.END,
                values=(notch["label"], f"{notch['value']:+.4f}", control),
            )

    def _remove_selected(self) -> None:
        selected = self.tree.selection()
        if not selected:
            return
        labels = {self.tree.item(item, "values")[0].upper() for item in selected}
        self.notches = [n for n in self.notches if str(n.get("label", "")).upper() not in labels]
        self._refresh_tree()
        self.label_var.set(suggest_next_label(self.notches, self.app.profile))

    def _clear_all(self) -> None:
        if self.notches and not messagebox.askyesno(
            "Vaciar",
            "¿Borrar todas las muescas capturadas?",
            parent=self,
        ):
            return
        self.notches = []
        self._refresh_tree()
        self.label_var.set(suggest_next_label(self.notches, self.app.profile))

    def _apply_to_profile(self) -> None:
        if not self.notches:
            messagebox.showwarning("Sin muescas", "Captura al menos una muesca.", parent=self)
            return
        control = self.control_var.get().strip() or self.last_control or None
        self.app.profile = apply_notches_to_profile(self.app.profile, self.notches, control)
        self.app._write_json_to_editor()
        self.app._refresh_checklist()
        self.app.status_var.set(
            f"Muescas aplicadas al perfil ({len(self.notches)} entradas · mando {control or '?'})",
        )
        messagebox.showinfo(
            "Aplicado",
            f"{len(self.notches)} muescas escritas en specs.notches_throttle_brake.\n"
            "Revisa el JSON y guarda el perfil.",
            parent=self,
        )


class ProfileWizardApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Nexus — Asistente de perfil de tren")
        self.root.minsize(960, 640)
        self.root.geometry("1024x720")

        self.manager = ProfileManager(str(PROFILES_DIR))
        self.profile: Dict[str, Any] = {}
        self.last_controls: List[str] = []
        self.checklist_result: Dict[str, Any] = {}

        self._build_ui()
        self._refresh_profile_list()
        self._new_profile()

    def _build_ui(self) -> None:
        top = ttk.Frame(self.root, padding=8)
        top.pack(fill=tk.X)

        ttk.Label(top, text="ID perfil:").grid(row=0, column=0, sticky=tk.W, padx=(0, 4))
        self.id_var = tk.StringVar()
        self.id_entry = ttk.Entry(top, textvariable=self.id_var, width=24)
        self.id_entry.grid(row=0, column=1, sticky=tk.W)
        self.id_var.trace_add("write", lambda *_: self._sync_id_to_profile())

        ttk.Label(top, text="Nombre:").grid(row=0, column=2, sticky=tk.W, padx=(12, 4))
        self.name_var = tk.StringVar()
        ttk.Entry(top, textvariable=self.name_var, width=28).grid(row=0, column=3, sticky=tk.W)
        self.name_var.trace_add("write", lambda *_: self._sync_name_to_profile())

        ttk.Label(top, text="extends:").grid(row=1, column=0, sticky=tk.W, pady=(6, 0))
        self.extends_var = tk.StringVar()
        self.extends_combo = ttk.Combobox(
            top,
            textvariable=self.extends_var,
            width=22,
            values=self._extends_options(),
        )
        self.extends_combo.grid(row=1, column=1, sticky=tk.W, pady=(6, 0))
        self.extends_var.trace_add("write", lambda *_: self._sync_extends_to_profile())

        ttk.Label(top, text="Cargar existente:").grid(row=1, column=2, sticky=tk.W, padx=(12, 4), pady=(6, 0))
        self.profile_pick_var = tk.StringVar()
        self.profile_pick = ttk.Combobox(
            top,
            textvariable=self.profile_pick_var,
            width=26,
            state="readonly",
        )
        self.profile_pick.grid(row=1, column=3, sticky=tk.W, pady=(6, 0))
        self.profile_pick.bind("<<ComboboxSelected>>", self._on_pick_existing)

        btn_row = ttk.Frame(self.root, padding=(8, 0))
        btn_row.pack(fill=tk.X)
        ttk.Button(btn_row, text="Nuevo", command=self._new_profile).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_row, text="Capturar cabina", command=self._capture_cab).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_row, text="Capturar muescas…", command=self._open_notch_capture).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_row, text="Cargar JSON…", command=self._load_json).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_row, text="Heredar class323", command=lambda: self._apply_extends("class323")).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_row, text="Actualizar checklist", command=self._refresh_checklist).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_row, text="Guardar perfil", command=self._save_profile).pack(side=tk.LEFT, padx=2)

        self.status_var = tk.StringVar(value="Listo — entra en cabina y pulsa «Capturar cabina»")
        ttk.Label(self.root, textvariable=self.status_var, padding=8).pack(fill=tk.X)

        paned = ttk.Panedwindow(self.root, orient=tk.HORIZONTAL)
        paned.pack(fill=tk.BOTH, expand=True, padx=8, pady=4)

        left = ttk.Frame(paned)
        right = ttk.Frame(paned)
        paned.add(left, weight=2)
        paned.add(right, weight=3)

        summary = ttk.LabelFrame(left, text="Resumen", padding=8)
        summary.pack(fill=tk.X, pady=(0, 8))
        self.summary_var = tk.StringVar(value="—")
        ttk.Label(summary, textvariable=self.summary_var, wraplength=360, justify=tk.LEFT).pack(anchor=tk.W)

        checklist_frame = ttk.LabelFrame(left, text="Qué falta por completar", padding=4)
        checklist_frame.pack(fill=tk.BOTH, expand=True)

        cols = ("status", "field", "detail")
        self.tree = ttk.Treeview(checklist_frame, columns=cols, show="headings", height=18)
        self.tree.heading("status", text="Estado")
        self.tree.heading("field", text="Campo")
        self.tree.heading("detail", text="Detalle")
        self.tree.column("status", width=72, anchor=tk.CENTER)
        self.tree.column("field", width=180)
        self.tree.column("detail", width=220)
        self.tree.tag_configure("ok", foreground="#2ecc71")
        self.tree.tag_configure("warn", foreground="#f39c12")
        self.tree.tag_configure("missing", foreground="#e74c3c")
        self.tree.tag_configure("inherited", foreground="#3498db")

        scroll = ttk.Scrollbar(checklist_frame, orient=tk.VERTICAL, command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scroll.pack(side=tk.RIGHT, fill=tk.Y)

        json_frame = ttk.LabelFrame(right, text="JSON del perfil (editable)", padding=4)
        json_frame.pack(fill=tk.BOTH, expand=True)
        self.json_text = tk.Text(json_frame, wrap=tk.NONE, font=("Consolas", 10))
        json_scroll_y = ttk.Scrollbar(json_frame, orient=tk.VERTICAL, command=self.json_text.yview)
        json_scroll_x = ttk.Scrollbar(json_frame, orient=tk.HORIZONTAL, command=self.json_text.xview)
        self.json_text.configure(yscrollcommand=json_scroll_y.set, xscrollcommand=json_scroll_x.set)
        self.json_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        json_scroll_y.pack(side=tk.RIGHT, fill=tk.Y)
        json_scroll_x.pack(side=tk.BOTTOM, fill=tk.X)

        ttk.Button(right, text="Aplicar cambios del editor", command=self._apply_json_editor).pack(anchor=tk.E, pady=4)

    def _extends_options(self) -> List[str]:
        options = [""]
        for profile in self.manager.profiles:
            physics = profile.get("physics_config") or {}
            if physics.get("station_reaction_time_s") is not None or profile.get("id") == "class323":
                options.append(profile["id"])
        return options

    def _refresh_profile_list(self) -> None:
        ids = sorted(p["id"] for p in self.manager.profiles)
        self.profile_pick["values"] = ids
        self.extends_combo["values"] = self._extends_options()

    def _new_profile(self) -> None:
        self.profile = {
            "name": "",
            "aliases": [],
            "fingerprint": {"required_controls": []},
            "mappings": {},
            "visuals": {"unit": "MPH", "color": "#3498db"},
        }
        self.id_var.set("")
        self.name_var.set("")
        self.extends_var.set("")
        self.profile_pick_var.set("")
        self._write_json_to_editor()
        self._refresh_checklist()

    def _load_profile_dict(self, data: Dict[str, Any], profile_id: Optional[str] = None) -> None:
        self.profile = dict(data)
        pid = profile_id or self.profile.get("id") or ""
        self.profile["id"] = pid
        self.id_var.set(pid)
        self.name_var.set(str(self.profile.get("name", "")))
        self.extends_var.set(str(self.profile.get("extends", "") or ""))
        self._write_json_to_editor()
        self._refresh_checklist()

    def _on_pick_existing(self, _event=None) -> None:
        pid = self.profile_pick_var.get().strip()
        if not pid:
            return
        loaded = self.manager.get_by_id(pid)
        if loaded:
            self._load_profile_dict(loaded, pid)

    def _load_json(self) -> None:
        path = filedialog.askopenfilename(
            title="Abrir perfil JSON",
            initialdir=str(PROFILES_DIR),
            filetypes=[("JSON", "*.json"), ("Todos", "*.*")],
        )
        if not path:
            return
        try:
            data = json.loads(Path(path).read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                raise ValueError("El archivo no es un objeto JSON")
            stem = Path(path).stem.replace("_draft", "")
            self._load_profile_dict(data, stem)
            self.status_var.set(f"Cargado: {path}")
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            messagebox.showerror("Error", f"No se pudo cargar el JSON:\n{exc}")

    def _sync_id_to_profile(self) -> None:
        self.profile["id"] = self.id_var.get().strip()

    def _sync_name_to_profile(self) -> None:
        self.profile["name"] = self.name_var.get().strip()

    def _sync_extends_to_profile(self) -> None:
        value = self.extends_var.get().strip()
        if value:
            self.profile["extends"] = value
        else:
            self.profile.pop("extends", None)

    def _write_json_to_editor(self) -> None:
        export = {k: v for k, v in self.profile.items() if k != "id"}
        text = json.dumps(export, indent=4, ensure_ascii=False)
        self.json_text.delete("1.0", tk.END)
        self.json_text.insert("1.0", text + "\n")

    def _apply_json_editor(self) -> None:
        try:
            data = json.loads(self.json_text.get("1.0", tk.END))
            if not isinstance(data, dict):
                raise ValueError("El JSON debe ser un objeto")
            pid = self.id_var.get().strip() or self.profile.get("id", "")
            data["id"] = pid
            self._load_profile_dict(data, pid)
            self.status_var.set("JSON del editor aplicado")
        except (json.JSONDecodeError, ValueError) as exc:
            messagebox.showerror("JSON inválido", str(exc))

    def _open_notch_capture(self) -> None:
        NotchCaptureDialog(self)

    def _capture_cab(self) -> None:
        rd = get_raildriver_client()
        if not rd.available:
            messagebox.showerror(
                "RailDriver",
                f"No se encuentra RailDriver64.dll:\n{rd.dll_path}\n\n"
                "Abre TSC en cabina y comprueba plugins.",
            )
            return
        snap = rd.snapshot()
        if snap is None or not snap.controllers:
            messagebox.showwarning(
                "Sin telemetría",
                "No hay controles. Entra en un escenario conduciendo en cabina.",
            )
            return

        profile_id = self.id_var.get().strip() or "nuevo_tren"
        if not self.id_var.get().strip():
            self.id_var.set(profile_id)

        extends_hint = self.extends_var.get().strip() or None
        draft = build_profile_draft(snap, profile_id, extends=extends_hint)
        self.profile = merge_draft_into_profile(self.profile, draft)
        self.profile["id"] = profile_id
        if not self.name_var.get().strip():
            self.name_var.set(str(self.profile.get("name", "")))
        if self.profile.get("extends"):
            self.extends_var.set(str(self.profile["extends"]))

        self.last_controls = [c.name for c in snap.controllers]
        loco = " / ".join(snap.loco_names) or "(desconocido)"
        template = self.profile.get("_suggested_template")
        msg = f"Capturado: {len(snap.controllers)} mandos · Loco: {loco}"
        if template:
            msg += f" · Plantilla sugerida: profiles/{template}.json"
        self.status_var.set(msg)
        self.profile.pop("_suggested_template", None)
        self.profile.pop("_draft_note", None)
        self._write_json_to_editor()
        self._refresh_checklist()

    def _apply_extends(self, base_id: str) -> None:
        self.profile = apply_extends_template(self.profile, base_id)
        self.profile["id"] = self.id_var.get().strip() or self.profile.get("id", "")
        self.extends_var.set(base_id)
        self._write_json_to_editor()
        self._refresh_checklist()
        self.status_var.set(f"Plantilla extends:{base_id} aplicada — solo detección y mappings en el hijo")

    def _refresh_checklist(self) -> None:
        self._sync_id_to_profile()
        self._sync_name_to_profile()
        self._sync_extends_to_profile()

        pid = str(self.profile.get("id") or self.id_var.get().strip() or "draft")
        picked = dict(self.profile)
        picked["id"] = pid

        stats = get_stats(pid)
        self.checklist_result = build_profile_checklist(
            picked,
            get_by_id=self.manager.get_by_id,
            brake_stats=stats,
            available_controls=self.last_controls,
        )

        for row in self.tree.get_children():
            self.tree.delete(row)

        for item in self.checklist_result["items"]:
            status = item["status"]
            self.tree.insert(
                "",
                tk.END,
                values=(
                    STATUS_LABELS.get(status, status),
                    item["label"],
                    item["detail"],
                ),
                tags=(STATUS_TAGS.get(status, ""),),
            )

        comp = self.checklist_result["completeness"]
        level = comp.get("level", "?")
        score = comp.get("score", 0)
        blocking = self.checklist_result.get("blocking_count", 0)
        ready = self.checklist_result.get("ready_to_save", False)

        self.summary_var.set(
            f"Nivel: {level.upper()} · Puntuación: {score}/100\n"
            f"Pendientes obligatorios: {blocking}\n"
            f"{'Listo para guardar' if ready else 'Completa los campos en rojo antes de guardar'}",
        )

        if comp.get("warnings"):
            self.summary_var.set(
                self.summary_var.get() + "\n\n" + "\n".join(f"• {w}" for w in comp["warnings"][:4]),
            )

    def _save_profile(self) -> None:
        self._apply_json_editor()
        self._refresh_checklist()

        pid = self.id_var.get().strip()
        if not pid:
            messagebox.showerror("Guardar", "Indica un ID de perfil (nombre del archivo).")
            return

        if not self.checklist_result.get("ready_to_save"):
            labels = self.checklist_result.get("blocking_labels") or []
            detail = "\n".join(f"• {label}" for label in labels) or "Revisa el checklist."
            if not messagebox.askyesno(
                "Perfil incompleto",
                f"Faltan campos obligatorios:\n\n{detail}\n\n¿Guardar igualmente?",
            ):
                return

        export = {k: v for k, v in self.profile.items() if k != "id"}
        for meta_key in ("_draft_note",):
            export.pop(meta_key, None)

        path = PROFILES_DIR / f"{pid}.json"
        PROFILES_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(export, indent=4, ensure_ascii=False) + "\n", encoding="utf-8")

        self.manager.load_profiles()
        self._refresh_profile_list()
        self.status_var.set(f"Guardado: {path}")
        messagebox.showinfo("Guardado", f"Perfil guardado en:\n{path}\n\nReinicia el backend o recarga perfiles en V4.")


def main() -> None:
    root = tk.Tk()
    try:
        style = ttk.Style()
        if "vista" in style.theme_names():
            style.theme_use("vista")
    except tk.TclError:
        pass
    ProfileWizardApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
