export type SyncScope =
  | 'agenda'
  | 'clientes'
  | 'pacotes'
  | 'financeiro'
  | 'dashboard'
  | 'access'
  | 'equipe'
  | 'settings'
  | 'all';

export type SyncStatus = 'connected' | 'updating' | 'offline' | 'reconnecting' | 'idle';

export interface SyncRefreshDetail {
  scopes: SyncScope[];
  tables: string[];
  source: 'realtime' | 'session' | 'visibility' | 'network' | 'manual' | 'pwa';
  occurredAt: string;
}

export const SYNC_REFRESH_EVENT = 'pet-sync-refresh';
export const PWA_UPDATE_AVAILABLE_EVENT = 'pet-pwa-update-available';

export const dispatchSyncRefresh = (detail: SyncRefreshDetail) => {
  window.dispatchEvent(new CustomEvent<SyncRefreshDetail>(SYNC_REFRESH_EVENT, { detail }));
};

export const subscribeSyncRefresh = (
  scopes: SyncScope[],
  callback: (detail: SyncRefreshDetail) => void
) => {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<SyncRefreshDetail>).detail;
    if (!detail) return;

    const shouldRefresh =
      scopes.includes('all') ||
      detail.scopes.includes('all') ||
      detail.scopes.some(scope => scopes.includes(scope));

    if (shouldRefresh) callback(detail);
  };

  window.addEventListener(SYNC_REFRESH_EVENT, handler);
  return () => window.removeEventListener(SYNC_REFRESH_EVENT, handler);
};
