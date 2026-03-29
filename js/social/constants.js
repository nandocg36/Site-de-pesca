/**
 * Constantes da camada social — alinhadas com o ponto fixo da app principal.
 * Se alterar coordenadas em app.js, atualizar aqui também.
 */
export const PLATFORM_LAT = -28.82718;
export const PLATFORM_LON = -49.21348;
/** Raio em metros para considerar “na plataforma” (geofence). */
export const PLATFORM_GEOFENCE_RADIUS_M = 150;

export const VISIBILITY = {
  PUBLIC: 'public',
  FRIENDS: 'friends',
};

/** Opções de isca para inquéritos e agregações (IDs estáveis para futura BD). */
export const BAIT_OPTIONS = [
  { id: 'camarão', label: 'Camarão' },
  { id: 'sardinha', label: 'Sardinha' },
  { id: 'lula', label: 'Lula' },
  { id: 'milho', label: 'Milho / massa' },
  { id: 'isca_artificial', label: 'Isca artificial' },
  { id: 'outro', label: 'Outro' },
];

export const FRIEND_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
};
