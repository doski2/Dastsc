/** Aspectos que exigen parada completa (rojo / peligro). */
export function signalRequiresFullStop(aspect: string): boolean {
  return aspect === 'DANGER';
}
