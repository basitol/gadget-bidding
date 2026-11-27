import { useEffect, useSyncExternalStore } from 'react';
import { adminApi, type QueueCounts } from '@/api';
import { connectAdminSocket } from '@/lib/socket';

/**
 * Queue counts for the rail and sidebar, shared by every screen. Refreshes every 30s and
 * shortly after anything changes on the socket (new notification, bid, order update).
 */

type State = { counts: QueueCounts | null; tasks: number | null };
let state: State = { counts: null, tasks: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

let inflight: Promise<void> | null = null;
export function refreshQueues() {
  if (inflight) return inflight;
  inflight = Promise.all([adminApi.queues(), adminApi.tasks()])
    .then(([q, t]) => {
      state = { counts: q.data, tasks: t.data.total };
      emit();
    })
    .catch(() => {})
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

let subscribers = 0;
let timer: number | null = null;
let debounce: number | null = null;
const soon = () => {
  if (debounce) window.clearTimeout(debounce);
  debounce = window.setTimeout(refreshQueues, 1500);
};

export function useQueues() {
  const snapshot = useSyncExternalStore(
    cb => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state
  );

  useEffect(() => {
    subscribers += 1;
    if (subscribers === 1) {
      refreshQueues();
      timer = window.setInterval(refreshQueues, 30_000);
      const socket = connectAdminSocket();
      socket?.on('notification', soon);
      socket?.on('bid:placed', soon);
      socket?.on('order:updated', soon);
    }
    return () => {
      subscribers -= 1;
      if (subscribers === 0) {
        if (timer) window.clearInterval(timer);
        timer = null;
        const socket = connectAdminSocket();
        socket?.off('notification', soon);
        socket?.off('bid:placed', soon);
        socket?.off('order:updated', soon);
      }
    };
  }, []);

  return snapshot;
}
