import type { ProfileCompleteness } from '../lib/profileCompleteness';
import { completenessLabel, completenessTone } from '../lib/profileCompleteness';

export function ProfileCompletenessBadge({
  completeness,
  compact = false,
}: {
  completeness: ProfileCompleteness;
  compact?: boolean;
}) {
  const tone = completenessTone(completeness.level);
  const label = completenessLabel(completeness.level);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono uppercase tracking-wider ${
        compact ? 'text-[9px]' : 'text-[10px]'
      } ${tone.badge}`}
      title={`Puntuación ${completeness.score}/100`}
    >
      {label}
      {!compact && (
        <span className="opacity-60 tabular-nums">{completeness.score}</span>
      )}
    </span>
  );
}

export function ProfileCompletenessPanel({
  profileId,
  completeness,
  onDismiss,
}: {
  profileId: string;
  completeness: ProfileCompleteness;
  onDismiss?: () => void;
}) {
  const tone = completenessTone(completeness.level);
  const headline =
    completeness.level === 'broken'
      ? `Perfil «${profileId}» roto — no se puede heredar del base`
      : completeness.level === 'stub'
        ? `Perfil «${profileId}» es un stub — frenado con valores por defecto`
        : completeness.level === 'inherited'
          ? `Perfil «${profileId}» hereda de «${completeness.extends ?? '?'}»`
          : `Perfil «${profileId}» completo`;

  return (
    <section className={`rounded-lg border p-4 ${tone.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className={`text-xs font-mono font-semibold ${tone.text}`}>
              Calidad del perfil
            </h3>
            <ProfileCompletenessBadge completeness={completeness} />
            {completeness.calibrated ? (
              <span className="text-[9px] font-mono uppercase text-emerald-400/70">
                calibrado ({completeness.brake_samples} muestras)
              </span>
            ) : (
              <span className="text-[9px] font-mono uppercase text-white/30">
                sin calibrar
              </span>
            )}
          </div>
          <p className={`text-[11px] font-mono leading-relaxed ${tone.text}`}>
            {headline}
          </p>
          {completeness.warnings.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {completeness.warnings.map(warning => (
                <li
                  key={warning}
                  className="text-[10px] font-mono text-white/45 pl-3 border-l border-white/10"
                >
                  {warning}
                </li>
              ))}
            </ul>
          )}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 text-[10px] font-mono uppercase text-white/30 hover:text-white/60"
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        )}
      </div>
    </section>
  );
}
