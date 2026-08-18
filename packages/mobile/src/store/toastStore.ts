import { create } from 'zustand';

export type ToastType = 'error' | 'success' | 'info';

interface ToastState {
  visible: boolean;
  message: string;
  type: ToastType;
  show: (message: string, type?: ToastType) => void;
  hide: () => void;
}

let hideTimer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>(set => ({
  visible: false,
  message: '',
  type: 'info',

  show: (message, type = 'error') => {
    if (hideTimer) clearTimeout(hideTimer);
    set({ visible: true, message, type });
    hideTimer = setTimeout(() => {
      set({ visible: false });
    }, 3500);
  },

  hide: () => {
    if (hideTimer) clearTimeout(hideTimer);
    set({ visible: false });
  },
}));
