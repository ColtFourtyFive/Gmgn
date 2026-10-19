import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { setClockOffset } from './useNow';

/** GET /api/meta (chains, launchpads, sim status), refreshed every 15s. Query key ['meta']. */
export function useMeta() {
  return useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: 15_000, refetchInterval: 15_000, retry: false });
}

/** Keep the shared clock aligned with the server's sim clock (mounted once by the shell). */
export function useClockSync(): void {
  const serverTime = useMeta().data?.serverTime;
  useEffect(() => {
    if (serverTime) setClockOffset(serverTime - Date.now());
  }, [serverTime]);
}
