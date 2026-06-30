import { useEffect } from 'react';
import { subscribeSyncRefresh, SyncScope } from '../services/realtimeSync';

export const useSyncRefresh = (
  scopes: SyncScope[],
  onRefresh: () => void | Promise<void>,
  paused = false
) => {
  useEffect(() => {
    if (paused) return;

    return subscribeSyncRefresh(scopes, () => {
      void onRefresh();
    });
  }, [onRefresh, paused, scopes.join('|')]);
};
