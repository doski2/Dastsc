import React from "react";
import { CanvasLayer } from "./CanvasLayer";
import { useTelemetrySmoothing } from "../../hooks/useTelemetrySmoothing";

/**
 * TrackProfile renderiza la visualizaci�n de la v�a curva de alto rendimiento.
 * Optimizada: Estilo s�lido sin efectos de ne�n para mayor claridad.
 */
export const TrackProfile: React.FC = () => {
    const { smooth, raw, isConnected } = useTelemetrySmoothing();

    const formatDistance = (m: number) => {
        if (m === undefined || m < 0) return "---";
        if (raw.SpeedUnit === "MPH") {
            const yards = m * 1.09361;
            if (yards < 1000) return `${Math.round(yards)}yd`;
            return `${(m * 0.000621371).toFixed(2)}mi`;
        }
        return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
    };

    const drawTrack = React.useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
        if (!isConnected) return;

        const centerY = height / 2;
        const viewRange = 8000; // 8km de alcance (Pro-HUD)
        
        // Escala NO LINEAL: 0-3km = 50% width, 3-8km = 50% width
        const getX = (m: number) => {
            const startX = 25;
            const availableWidth = width - (startX + 20);

            let relativeX = 0;
            if (m <= 3000) {
                relativeX = (m / 3000) * (availableWidth * 0.5);
            } else {
                const extra = Math.min(5000, m - 3000);
                relativeX = availableWidth * 0.5 + (extra / 5000) * (availableWidth * 0.5);
            }
            return startX + relativeX;
        };

        ctx.save();

        // Gradiente y Curvatura
        const rawGradient = smooth.gradient || 0;
        const currentLateralG = smooth.lateralG || 0;

        // Visualización del gradiente según cabina
        const visualGradient = (raw.ActiveCab === 2) ? -rawGradient : rawGradient;
        const pitchEffect = (smooth.gForce || 0) * 12;

        const gradientOffset = (visualGradient * 15) + pitchEffect;
        const curvatureIntensity = currentLateralG * 100;

        const getY = (m: number) => {
            const progress = m / viewRange;
            const currentY = centerY - gradientOffset * progress;
            const curveOffset = Math.pow(progress, 1.5) * curvatureIntensity;
            return currentY + curveOffset;
        };

        // 1. Línea de la vía
        const coreColor = visualGradient > 0 ? "#f87171" : visualGradient < 0 ? "#4ade80" : "#22d3ee";
        ctx.beginPath();
        const segments = 60; 
        for (let i = 0; i <= segments; i++) {
            const progress = i / segments;
            const m = progress * viewRange;
            const x = getX(m);
            const y = getY(m);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        ctx.lineWidth = 3;
        ctx.strokeStyle = coreColor;
        ctx.shadowBlur = 0;
        ctx.stroke();

        // 2. Info de Gradiente
        const gradVal = Math.abs(visualGradient);
        const gradIcon = visualGradient > 0 ? "▲" : visualGradient < 0 ? "▼" : "";
        const ratio = gradVal > 0 ? Math.round(100 / gradVal) : 0;

        ctx.fillStyle = coreColor;
        ctx.font = "bold 13px JetBrains Mono";
        ctx.fillText(`${gradIcon} ${gradVal.toFixed(2)}% ${ratio > 0 ? `(1:${ratio})` : ""}`, 45, centerY - 25);

        // 3. Regla de Distancia
        ctx.save();
        ctx.strokeStyle = "#22d3ee";
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.5;
        ctx.font = "bold 10px JetBrains Mono";
        ctx.textAlign = "center";

        const isMPH = raw.SpeedUnit === "MPH";
        const scaleMarkers = isMPH
            ? [0, 91.44, 182.88, 365.76, 731.52, 1609.34, 3218.68, 4828.03, 6437.38, 8046.72]
            : [0, 100, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7000, 8000];

        for (const m of scaleMarkers) {
            const x = getX(m);
            const yBase = centerY + 15;
            ctx.beginPath();
            ctx.moveTo(x, yBase);
            ctx.lineTo(x, yBase + 10);
            ctx.stroke();

            let label = "";
            if (isMPH) {
                const yards = Math.round(m * 1.09361);
                label = yards === 0 ? "0" : yards < 1760 ? `${yards}y` : `${Math.round(yards / 1760)}mi`;
            } else {
                label = m === 0 ? "0" : m < 1000 ? `${m}m` : `${m / 1000}km`;
            }
            ctx.fillText(label, x, yBase + 22);
        }
        ctx.restore();

        // 4. Parada de Estación
        const stationDist = smooth.stationDistance;
        if (stationDist !== undefined && stationDist >= 0 && stationDist < viewRange) {
            const xStop = getX(stationDist);
            const yStop = getY(stationDist);
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2;
            ctx.setLineDash([2, 4]);
            ctx.beginPath();
            ctx.moveTo(xStop, yStop - 25);
            ctx.lineTo(xStop, yStop + 25);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = "#fff";
            ctx.font = "bold 12px JetBrains Mono";
            ctx.textAlign = "center";
            ctx.fillText(raw.StationName || "STATION", xStop, yStop - 35);
            ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
            ctx.fillText(formatDistance(stationDist), xStop, yStop + 35);
        }

        // 5. Señales y Aspectos
        const sigDist = smooth.signalDistance;
        if (sigDist > 0 && sigDist < viewRange) {
            const xSig = getX(sigDist);
            const ySig = getY(sigDist);
            const aspectColors: Record<string, string> = {
                DANGER: "#ef4444",
                CAUTION: "#fbbf24",
                ADV_CAUTION: "#f59e0b",
                CLEAR: "#22c55e",
                PROCEED: "#3b82f6",
            };
            const color = aspectColors[raw.NextSignalAspect] || "#fff";

            ctx.beginPath();
            ctx.moveTo(xSig, ySig);
            ctx.lineTo(xSig, ySig - 60);
            ctx.strokeStyle = "rgba(255,255,255,0.2)";
            ctx.stroke();

            ctx.fillStyle = "#111";
            ctx.fillRect(xSig - 10, ySig - 95, 20, 35);
            
            const drawLight = (yOff: number, isActive: boolean) => {
                ctx.fillStyle = isActive ? color : "#222";
                ctx.beginPath();
                ctx.arc(xSig, ySig - 95 + yOff, 4, 0, Math.PI * 2);
                ctx.fill();
            };

            drawLight(8, raw.NextSignalAspect === "DANGER");
            drawLight(17, raw.NextSignalAspect === "CAUTION" || raw.NextSignalAspect === "ADV_CAUTION");
            drawLight(26, raw.NextSignalAspect === "CLEAR" || raw.NextSignalAspect === "PROCEED");

            ctx.fillStyle = color;
            ctx.font = "bold 11px JetBrains Mono";
            ctx.textAlign = "center";
            ctx.fillText(formatDistance(sigDist), xSig, ySig - 105);
        }

        // 6. L�mites de Velocidad Pr�ximos
        // 6. Límites de Velocidad Próximos
        const limits = raw.UpcomingLimits || [];
        limits.filter((l: any) => l.distance > 0 && l.distance < viewRange)
              .slice(0, 3)
              .forEach((limit: any) => {
            const xL = getX(limit.distance);
            const yL = getY(limit.distance);
            
            ctx.save();
            ctx.translate(xL, yL);
            
            // Círculo de límite estilo tráfico
            ctx.beginPath();
            ctx.arc(0, -45, 14, 0, Math.PI * 2);
            ctx.fillStyle = "#fff";
            ctx.fill();
            ctx.strokeStyle = "#ef4444"; 
            ctx.lineWidth = 3;
            ctx.stroke();
            
            ctx.fillStyle = "#000";
            ctx.font = "bold 13px JetBrains Mono";
            ctx.textAlign = "center";
            ctx.fillText(Math.round(limit.speed).toString(), 0, -40);
            
            // Etiqueta de distancia
            ctx.fillStyle = "rgba(255,255,255,0.7)";
            ctx.font = "9px Monospace";
            ctx.fillText(formatDistance(limit.distance), 0, -65);
            
            ctx.restore();
        });

        // 7. Triángulo Locomotora
        ctx.fillStyle = "#f97316";
        ctx.beginPath();
        ctx.moveTo(10, centerY + 10);
        ctx.lineTo(25, centerY);
        ctx.lineTo(10, centerY - 10);
        ctx.closePath();
        ctx.fill();

        ctx.restore(); 
    }, [isConnected, raw, smooth, formatDistance]);

    return (
        <div className="relative w-full h-[300px] bg-gradient-to-t from-black/40 to-transparent overflow-hidden">
            <CanvasLayer render={drawTrack} />
            <div className="absolute top-4 left-6 py-1 px-3 bg-cyan-500/10 border border-cyan-500/20 text-[10px] text-cyan-400 font-bold uppercase rounded">
                TRACK MONITORING: ACTIVE
            </div>
        </div>
    );
};

