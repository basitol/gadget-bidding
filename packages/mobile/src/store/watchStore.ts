import { create } from 'zustand';
import { meService } from '../services/me.service';
import { useToastStore } from './toastStore';

/** Which auctions the user is watching, shared by every heart button in the app. */
interface WatchState {
  ids: Set<string>;
  loaded: boolean;
  load: () => Promise<void>;
  toggle: (auctionId: string) => Promise<void>;
  clear: () => void;
}

export const useWatchStore = create<WatchState>((set, get) => ({
  ids: new Set(),
  loaded: false,
  load: async () => {
    try {
      set({ ids: new Set(await meService.watchedIds()), loaded: true });
    } catch {
      // Hearts just show as off until the next load.
    }
  },
  toggle: async auctionId => {
    const was = get().ids.has(auctionId);
    const next = new Set(get().ids);
    if (was) next.delete(auctionId);
    else next.add(auctionId);
    set({ ids: next }); // optimistic
    try {
      if (was) await meService.unwatch(auctionId);
      else await meService.watch(auctionId);
    } catch {
      const undo = new Set(get().ids);
      if (was) undo.add(auctionId);
      else undo.delete(auctionId);
      set({ ids: undo });
      useToastStore.getState().show("Couldn't update your watchlist. Try again.", 'error');
    }
  },
  clear: () => set({ ids: new Set(), loaded: false }),
}));
