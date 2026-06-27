import { create } from "zustand";

/**
 * Minimal toast store for transient notifications.
 *
 * No persistence, no middleware — just a message string + show/dismiss.
 * Auto-dismiss is handled by the toast component via useEffect.
 */
interface ToastState {
  message: string | null;
  show: (message: string) => void;
  dismiss: () => void;
}

export const useToastStore = create<ToastState>()((set) => ({
  message: null,
  show: (message) => set({ message }),
  dismiss: () => set({ message: null }),
}));
