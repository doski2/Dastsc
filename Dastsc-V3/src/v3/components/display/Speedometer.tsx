import React, { useRef, useEffect } from "react";
import { useTelemetrySmoothing } from "../../hooks/useTelemetrySmoothing";
import { CanvasLayer } from "./CanvasLayer";
import "./Speedometer.css";

/**
 * Speedometer renderiza el HUD central con veloc�metro circular,
 * control de potencia/freno y medidor G-Force (Inercia).
 */
export const Speedometer: React.FC = () => {
    const { smooth, raw, isConnected, activeProfile } = useTelemetrySmoothing();
    const progressBarRef = useRef<HTMLDivElement>(null);

    // Lógica para determinar alertas visuales (AWS, DSD)
    const getSafetyAlerts = () => {
        // Mapeo robusto: AWS=1 (Normal), AWS=2 (Warning/Acknowledge needed)
        // Algunos scripts LUA envían AWS=2 directamente, otros usan AWSWarning:1
        const awsRaw = Number(raw.AWS || 0);
        const awsWarning = Number(raw.AWSWarning || 0);
        const awsWarnCount = Number(raw.AWSWarnCount || 0);
        
        // El aviso debe saltar si el valor de AWS es 2 O si hay señales explícitas de Warning
        // IMPORTANTE: Un valor de 1 suele ser "Circle" (Clear), un valor de 2 o más es "Sunflower" (Warning)
        const aws = (awsRaw >= 2 || awsWarning > 0 || awsWarnCount > 0) ? 2 : awsRaw;
        
        const dsd = Number(raw.DSD || 0) || Number(raw.VigilAlarm || 0) || Number(raw.Vigilance || 0) || Number(raw.DVDAlarm || 0);

        return {
            aws: aws,
            dsd: dsd > 0.5,
            isWarning: aws >= 2 || dsd > 0.5
        };
    };

    const alerts = getSafetyAlerts();

    // Actualiza la barra de progreso de la cola del tren (Tail Protection)
    useEffect(() => {
        if (progressBarRef.current && raw.TailIsActive) {
            const progress = Math.max(0, Math.min(100, raw.TrainLength > 0 ? (1 - smooth.tailDistance / raw.TrainLength) * 100 : 0));
            progressBarRef.current.style.width = `${progress}%`;
        }
    }, [smooth.tailDistance, raw.TrainLength, raw.TailIsActive]);

    const drawGauge = React.useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
        if (!isConnected) return;

        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.max(30, Math.min(width, height) * 0.4);

        ctx.save();

        // 1. Fondo del velocímetro (Segmentado)
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
        ctx.lineWidth = 15;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0.75 * Math.PI, 2.25 * Math.PI);
        ctx.stroke();

        // 1.1 Muescas y Escala
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 2;
        const maxSpeedProfile = activeProfile?.specs?.max_speed || 140;
        const tickCount = 10;
        for (let i = 0; i <= tickCount; i++) {
            const angle = 0.75 * Math.PI + (i / tickCount) * 1.5 * Math.PI;
            ctx.beginPath();
            ctx.moveTo(centerX + Math.cos(angle) * (radius - 5), centerY + Math.sin(angle) * (radius - 5));
            ctx.lineTo(centerX + Math.cos(angle) * (radius + 5), centerY + Math.sin(angle) * (radius + 5));
            ctx.stroke();

            if (i % 2 === 0) {
                ctx.fillStyle = "rgba(255,255,255,0.2)";
                ctx.font = "9px Monospace";
                ctx.textAlign = "center";
                const val = Math.round((i / tickCount) * maxSpeedProfile);
                ctx.fillText(val.toString(), centerX + Math.cos(angle) * (radius - 20), centerY + Math.sin(angle) * (radius - 20) + 4);
            }
        }

        // 2. Progreso de Velocidad Actual (Cian)
        const speedPercent = Math.min(smooth.speedDisplay / maxSpeedProfile, 1);
        const endAngle = 0.75 * Math.PI + speedPercent * 1.5 * Math.PI;

        // 2.1 Velocidad Proyectada (Sombra sutil o línea)
        const projectedPercent = Math.min(raw.ProjectedSpeed / maxSpeedProfile, 1);
        const projAngle = 0.75 * Math.PI + projectedPercent * 1.5 * Math.PI;
        
        ctx.strokeStyle = raw.ProjectedSpeed > smooth.speedDisplay ? "rgba(34, 211, 238, 0.2)" : "rgba(249, 115, 22, 0.2)";
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius + 5, Math.min(endAngle, projAngle), Math.max(endAngle, projAngle));
        ctx.stroke();

        ctx.strokeStyle = "#22d3ee";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius + 5, 0.75 * Math.PI, endAngle);
        ctx.stroke();

        // 3. Arco de Potencia / Freno (HUD Superior)
        const combinedVal = raw.CombinedControl !== 0 ? raw.CombinedControl : raw.Throttle - raw.TrainBrake;
        const ctrlPercent = Math.max(-1, Math.min(1, combinedVal));
        const arcWidth = 0.4 * Math.PI;

        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius - 10, 1.5 * Math.PI - arcWidth / 2, 1.5 * Math.PI + arcWidth / 2);
        ctx.stroke();

        if (ctrlPercent !== 0) {
            ctx.strokeStyle = ctrlPercent > 0 ? "#22d3ee" : "#f97316";
            ctx.beginPath();
            const startA = 1.5 * Math.PI;
            const endA = 1.5 * Math.PI + ctrlPercent * (arcWidth / 2);
            ctx.arc(centerX, centerY, radius - 10, Math.min(startA, endA), Math.max(startA, endA));
            ctx.stroke();
        }

        // 4. Globo G-Force (Inercia)
        const gX = centerX - radius + 10;
        const gY = centerY + radius - 20;
        const gR = 20;

        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.beginPath();
        ctx.arc(gX, gY, gR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(gX - gR, gY); ctx.lineTo(gX + gR, gY);
        ctx.moveTo(gX, gY - gR); ctx.lineTo(gX, gY + gR);
        ctx.stroke();

        const pX = gX - (raw.LateralG || 0) * 15;
        const pY = gY + raw.GForce * 15;
        ctx.fillStyle = "#22d3ee";
        ctx.beginPath();
        ctx.arc(pX, pY, 3, 0, Math.PI * 2);
        ctx.fill();

        // Métricas de fuerza G
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = "8px JetBrains Mono";
        ctx.textAlign = "center";
        ctx.fillText(`L:${(raw.LateralG * 10 || 0).toFixed(2)} Lon:${(raw.GForce * 10).toFixed(2)}`, gX, gY + gR + 10);

        ctx.restore(); 
    }, [isConnected, raw, smooth.speedDisplay, activeProfile]);

    // L�gica para determinar el Notch activo
    const getActiveNotch = () => {
        const combinedVal = raw.CombinedControl !== 0 ? raw.CombinedControl : raw.Throttle - raw.TrainBrake;
        const notches = activeProfile?.specs?.notches_throttle_brake;

        if (notches && notches.length > 0) {
            return notches.reduce((prev: any, curr: any) => 
                Math.abs(curr.value - combinedVal) < Math.abs(prev.value - combinedVal) ? curr : prev
            ).label;
        }

        if (combinedVal > 0.05) return combinedVal > 0.8 ? "P7" : "P1";
        if (combinedVal < -0.05) return Math.abs(combinedVal) > 0.8 ? "B9" : "B1";
        return "N";
    };

    const activeNotch = getActiveNotch();

    // Lógica para determinar el color de fondo dinámico basado en las alertas
    const getContainerClasses = () => {
        let classes = "relative flex flex-col items-center justify-center h-[280px] bg-[#0b0b0b] border rounded-sm overflow-hidden transition-all duration-300";
        if (alerts.dsd || (alerts.aws >= 2)) {
            classes += " border-red-600/60 bg-red-950/30 shadow-[inset_0_0_30px_rgba(220,38,38,0.2)] scale-[1.01]";
        } else {
            classes += " border-white/5";
        }
        return classes;
    };

    // Obtener las muescas del perfil o usar las genéricas si no hay perfil
    const displayNotches = activeProfile?.specs?.notches_throttle_brake 
        ? [...activeProfile.specs.notches_throttle_brake]
            .sort((a: any, b: any) => b.value - a.value)
            .map((n: any) => n.label)
        : ["P7", "P1", "N", "B1", "B9"];

    return (
        <div className={getContainerClasses()}>
            <CanvasLayer render={drawGauge} />

            {/* Avisadores Visuales Superiores (AWS/DSD) */}
            <div className="absolute top-4 flex flex-col gap-2 z-10 w-full items-center px-10">
                {alerts.dsd && (
                    <div className="animate-pulse bg-red-600 text-white text-[10px] font-black px-6 py-1.5 rounded-sm shadow-[0_0_20px_rgba(220,38,38,0.6)] border-2 border-red-400 w-fit">
                        DSD (DEADMAN) ALARM
                    </div>
                )}
                {alerts.aws >= 2 && (
                    <div className="animate-pulse bg-red-600 text-white text-[10px] font-black px-6 py-1.5 rounded-sm shadow-[0_0_20px_rgba(220,38,38,0.6)] border-2 border-red-400 w-fit">
                        AWS WARNING - ACKNOWLEDGE
                    </div>
                )}
            </div>

            {/* Lectura Digital */}
            <div className="absolute flex flex-col items-center pointer-events-none">
                <span className={`text-xs font-mono uppercase tracking-[0.2em] transition-colors ${
                    alerts.dsd || alerts.aws >= 2 ? "text-red-400" : "text-white/20"
                }`}>{raw.SpeedUnit}</span>
                <div className="flex items-baseline">
                    <span className={`text-6xl font-light leading-none transition-colors ${
                        alerts.dsd || alerts.aws >= 2 ? "text-red-500" : "text-white/90"
                    }`}>{smooth.speedDisplay.toFixed(1)}</span>
                    <span className={`text-xl font-mono ml-1 ${
                        raw.ProjectedSpeed > smooth.speedDisplay ? "text-cyan-500/40" : "text-orange-500/40"
                    }`}>
                        {raw.ProjectedSpeed > smooth.speedDisplay ? "▲" : "▼"}{Math.abs(raw.ProjectedSpeed - smooth.speedDisplay).toFixed(1)}
                    </span>
                </div>
                <div className="mt-2 flex flex-col items-center">
                    <span className={`text-xs font-mono font-bold transition-colors ${
                        alerts.dsd || alerts.aws >= 2 ? "text-red-400" : "text-cyan-500/60"
                    }`}>
                        {raw.GForce >= 0 ? "+" : ""}{(raw.GForce * 10).toFixed(2)}G
                    </span>
                    <div className={`mt-1 px-3 py-1 rounded-full text-xs font-bold ${
                        raw.SpeedDisplay > raw.SpeedLimit ? "bg-red-500/30 text-red-400" : "bg-white/10 text-white/50"
                    }`}>
                        LIMIT: {Math.round(raw.SpeedLimit)}
                    </div>
                </div>
            </div>

            {/* Tail Protection HUD */}
            {raw.TailIsActive && (
                <div className="absolute right-4 bottom-4 bg-amber-500/10 border border-amber-500/50 rounded-lg px-3 py-2">
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-[9px] font-bold text-amber-300 uppercase">Tail Clearing</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-lg font-mono font-bold text-amber-200">{smooth.tailSeconds.toFixed(1)}s</span>
                            <span className="text-[10px] font-mono text-amber-400/70">{smooth.tailDistance.toFixed(0)}m</span>
                        </div>
                        <div className="w-20 h-1.5 bg-amber-900/40 rounded-full overflow-hidden border border-amber-600/30">
                            <div ref={progressBarRef} className="h-full bg-amber-500 transition-all duration-300" />
                        </div>
                    </div>
                </div>
            )}

            {/* Notches Lateral */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-1">
                {displayNotches.map(label => (
                    <div key={label} className={`text-[10px] font-mono px-1.5 py-0.5 border rounded-xs ${
                        label === activeNotch ? "border-cyan-500 text-cyan-400 bg-cyan-500/10" : "border-transparent text-white/10"
                    }`}>
                        {label}
                    </div>
                ))}
            </div>
        </div>
    );
};

