export type ProfileCompletenessLevel = 'gold' | 'inherited' | 'stub' | 'broken';

export interface ProfileCompleteness {
  level: ProfileCompletenessLevel;
  score: number;
  warnings: string[];
  picked_id: string;
  extends: string | null;
  calibrated: boolean;
  brake_samples: number;
}

const GOLD_BASE_IDS = new Set(['passenger', 'class323', 'icet']);
const DEFAULT_DECEL = 0.8;
const MIN_CALIBRATED_SAMPLES = 9;

function totalBrakeSamples(byNotch: Record<string, { samples?: number }> | undefined): number {
  if (!byNotch) return 0;
  return Object.values(byNotch).reduce((sum, entry) => sum + (entry.samples ?? 0), 0);
}

function isSelfContainedGold(profile: {
  physics_config?: { station_reaction_time_s?: number };
  brakes?: unknown;
  fingerprint?: { required_controls?: string[] };
  mappings?: Record<string, string>;
}): boolean {
  const physics = profile.physics_config ?? {};
  const fingerprint = profile.fingerprint?.required_controls ?? [];
  const mappings = profile.mappings ?? {};
  return (
    physics.station_reaction_time_s != null
    && Boolean(profile.brakes)
    && fingerprint.length >= 3
    && Object.keys(mappings).length >= 5
  );
}

function scoreLevel(
  level: ProfileCompletenessLevel,
  profile: { physics_config?: { max_braking_decel?: number }; brakes?: unknown; mappings?: Record<string, string> },
  calibrated: boolean,
): number {
  if (level === 'broken') return 10;
  if (level === 'gold') return calibrated ? 98 : 92;
  if (level === 'inherited') return calibrated ? 88 : 76;
  const physics = profile.physics_config ?? {};
  const mappings = profile.mappings ?? {};
  const customPhysics = (physics.max_braking_decel ?? DEFAULT_DECEL) !== DEFAULT_DECEL;
  let score = 30;
  score += Math.min(20, Object.keys(mappings).length * 4);
  if (customPhysics) score += 12;
  if (profile.brakes) score += 8;
  if (calibrated) score += 15;
  return Math.min(65, score);
}

export function deriveProfileCompleteness(
  profile: {
    id?: string;
    extends?: string;
    physics_config?: { max_braking_decel?: number; station_reaction_time_s?: number };
    brakes?: unknown;
    fingerprint?: { required_controls?: string[] };
    mappings?: Record<string, string>;
    runtime?: { profile_completeness?: ProfileCompleteness };
  } | null | undefined,
  brakeStatsByNotch?: Record<string, { samples?: number }>,
): ProfileCompleteness | null {
  if (!profile?.id) return null;

  const backend = profile.runtime?.profile_completeness;
  if (backend) {
    const samples = totalBrakeSamples(brakeStatsByNotch);
    if (samples > 0 && samples !== backend.brake_samples) {
      const calibrated = samples >= MIN_CALIBRATED_SAMPLES;
      return {
        ...backend,
        brake_samples: samples,
        calibrated,
        score: scoreLevel(backend.level, profile, calibrated),
      };
    }
    return backend;
  }

  const warnings: string[] = [];
  const pickedId = profile.id;
  const extendsId = profile.extends ?? null;
  const brakeSamples = totalBrakeSamples(brakeStatsByNotch);
  const calibrated = brakeSamples >= MIN_CALIBRATED_SAMPLES;

  if (extendsId) {
    return {
      level: 'inherited',
      score: scoreLevel('inherited', profile, calibrated),
      warnings: GOLD_BASE_IDS.has(extendsId)
        ? [`Variante de '${extendsId}' — hereda muescas y física calibrada`]
        : [`Hereda de '${extendsId}' — verifica que el perfil base esté completo`],
      picked_id: pickedId,
      extends: extendsId,
      calibrated,
      brake_samples: brakeSamples,
    };
  }

  let level: ProfileCompletenessLevel = isSelfContainedGold(profile) ? 'gold' : 'stub';

  if (level === 'stub') {
    const physics = profile.physics_config ?? {};
    if ((physics.max_braking_decel ?? DEFAULT_DECEL) === DEFAULT_DECEL) {
      warnings.push('Física genérica — el plan de frenado puede ser conservador o impreciso');
    }
    if (!profile.brakes) {
      warnings.push('Sin bloque brakes — tipo de freno no definido');
    }
    if (Object.keys(profile.mappings ?? {}).length < 4) {
      warnings.push('Mappings mínimos — mandos extra (AWS, DSD…) pueden no enviarse');
    }
    if ((profile.fingerprint?.required_controls?.length ?? 0) <= 1) {
      warnings.push('Fingerprint débil — riesgo de detectar el tren equivocado');
    }
  }

  if (!calibrated) {
    warnings.push('Sin calibración de frenado (pocas muestras) — el plan usa deceleración teórica');
  }

  return {
    level,
    score: scoreLevel(level, profile, calibrated),
    warnings,
    picked_id: pickedId,
    extends: null,
    calibrated,
    brake_samples: brakeSamples,
  };
}

export function completenessLabel(level: ProfileCompletenessLevel): string {
  switch (level) {
    case 'gold':
      return 'Completo';
    case 'inherited':
      return 'Heredado';
    case 'stub':
      return 'Stub';
    case 'broken':
      return 'Roto';
  }
}

export function completenessTone(level: ProfileCompletenessLevel): {
  badge: string;
  border: string;
  text: string;
} {
  switch (level) {
    case 'gold':
      return {
        badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        border: 'border-emerald-500/25 bg-emerald-500/5',
        text: 'text-emerald-200/90',
      };
    case 'inherited':
      return {
        badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
        border: 'border-cyan-500/25 bg-cyan-500/5',
        text: 'text-cyan-200/90',
      };
    case 'stub':
      return {
        badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        border: 'border-amber-500/25 bg-amber-500/5',
        text: 'text-amber-200/90',
      };
    case 'broken':
      return {
        badge: 'bg-red-500/15 text-red-300 border-red-500/30',
        border: 'border-red-500/25 bg-red-500/5',
        text: 'text-red-200/90',
      };
  }
}

export function shouldShowCompletenessAlert(
  completeness: ProfileCompleteness | null,
): boolean {
  if (!completeness) return false;
  return completeness.level === 'stub' || completeness.level === 'broken';
}
