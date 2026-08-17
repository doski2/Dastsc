import { useCallback, useState } from 'react';

const OCR_CAPTURE_URL = 'http://localhost:8000/api/ocr/capture';

export interface OcrCaptureResult {
  ok: boolean;
  anchored?: boolean;
  event?: string;
  parsed?: {
    station_name?: string | null;
    distance_m?: number | null;
    eta?: string | null;
  };
  error?: string | null;
}

export function useManualOcrCapture(enabled: boolean) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const capture = useCallback(async (): Promise<OcrCaptureResult | null> => {
    if (!enabled || busy) return null;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(OCR_CAPTURE_URL, { method: 'POST' });
      const data = (await res.json()) as OcrCaptureResult;
      if (data.ok && data.anchored) {
        const name = data.parsed?.station_name?.trim() || 'Destino HUD';
        const distM = data.parsed?.distance_m;
        if (distM != null && Number.isFinite(distM)) {
          setFeedback(`${name} · ${(distM / 1000).toFixed(2)} km anclado`);
        } else {
          setFeedback(`${name} anclado`);
        }
      } else {
        setFeedback(data.error ?? 'OCR sin ancla (revisa HUD visible)');
      }
      return data;
    } catch {
      setFeedback('Error al capturar OCR');
      return null;
    } finally {
      setBusy(false);
    }
  }, [enabled, busy]);

  const clearFeedback = useCallback(() => setFeedback(null), []);

  return { capture, busy, feedback, clearFeedback };
}
