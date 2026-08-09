/** Aspectos que exigen parada completa (rojo / peligro). */
export function signalRequiresFullStop(aspect: string): boolean {
  return aspect === 'DANGER';
}

export function signalRequiresSlowdown(aspect: string): boolean {
  return aspect === 'CAUTION'
    || aspect === 'ADV_CAUTION'
    || aspect === 'FL_CAUTION'
    || aspect === 'FL_ADV_CAUTION';
}
