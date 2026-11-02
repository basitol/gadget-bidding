import { create } from 'zustand';

export type ToastType = 'error' | 'success' | 'info';

export interface ToastOptions {
  /** Longer-held message, e.g. validation feedback. */
  title?: string;
  /** Auto-hide delay in ms. Defaults to 3500. */
  duration?: number;
}

interface ToastState {
  visible: boolean;
  message: string;
  title?: string;
  type: ToastType;
  show: (message: string, type?: ToastType, options?: ToastOptions) => void;
  hide: () => void;
}

const DEFAULT_DURATION = 3500;

let hideTimer: ReturnType<typeof setTimeout> | null = null;

// Queue so rapid successive toasts are shown in order instead of dropped.
let queue: Array<{
  message: string;
  type: ToastType;
  options?: ToastOptions;
}> = [];

const enqueue = (
  message: string,
  type: ToastType,
  options?: ToastOptions
) => {
  queue.push({ message, type, options });
  if (queue.length === 1) {
    dequeue();
  }
};

const dequeue = () => {
  const next = queue[0];
  if (!next) return;

  if (hideTimer) clearTimeout(hideTimer);
  useToastStore.setState({
    visible: true,
    message: next.message,
    title: next.options?.title,
    type: next.type,
  });
  hideTimer = setTimeout(() => {
    useToastStore.setState({ visible: false, title: undefined });
    hideTimer = null;
    queue.shift();
    // Small gap so consecutive toasts animate separately.
    setTimeout(dequeue, 250);
  }, next.options?.duration ?? DEFAULT_DURATION);
};

export const useToastStore = create<ToastState>(set => ({
  visible: false,
  message: '',
  title: undefined,
  type: 'info',

  show: (message, type = 'error', options) => {
    enqueue(message, type, options);
  },

  hide: () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    queue = [];
    set({ visible: false, title: undefined });
  },
}));
