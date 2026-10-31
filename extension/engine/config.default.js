// Configuración por defecto de la liga. Todo valor de puntos, umbral o fecha
// se puede cambiar desde el panel de configuración de la extensión.
export const DEFAULT_CONFIG = {
  league: {
    name: 'Liga Fitboxers',
    timeZone: 'Europe/Madrid',
    // Fechas locales (YYYY-MM-DD), ambas incluidas. null = sin límite.
    start: null,
    end: null,
  },
  rules: {
    // REG-001 / REG-002: regreso tras un periodo sin entrenar.
    // days: días naturales completos sin entrenar; months: meses naturales completos.
    returns: [
      { id: 'REG-001', label: 'Regreso tras 14 días', days: 14, points: 14, enabled: true },
      { id: 'REG-002', label: 'Regreso tras un mes', months: 1, points: 20, enabled: true },
    ],
    // REG-003 / REG-004: rachas de semanas consecutivas con un mínimo de entrenamientos.
    streaks: [
      { id: 'REG-003', label: 'Racha de 2 semanas', weeks: 2, points: 10, enabled: true },
      { id: 'REG-004', label: 'Racha de 4 semanas', weeks: 4, points: 14, enabled: true },
    ],
    streakMinTrainingsPerWeek: 2,
    // Rutina semanal: puntos al alcanzar el N.º entrenamiento de la semana (índice 0 = 1.º).
    weekly: { id: 'RUT', label: 'Rutina semanal', points: [0, 5, 6, 7, 8, 9, 10], enabled: true },
    // RUT-007: doblete diario.
    double: { id: 'RUT-007', label: 'Doblete diario', points: 2, enabled: true },
    // SOC-001 / SOC-002: referidos.
    referralAttendance: { id: 'SOC-001', label: 'Referido asiste a iniciación', points: 16, enabled: true },
    referralSignup: { id: 'SOC-002', label: 'Referido se da de alta', points: 40, enabled: true },
  },
};
