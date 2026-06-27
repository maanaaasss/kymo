import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * A video in the basket — minimal data needed for display and download.
 */
export interface BasketVideo {
  id: string;
  title: string;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  channelId: string;
  channelTitle: string;
}

interface BasketState {
  /** Map of videoId → BasketVideo for O(1) lookups */
  items: Record<string, BasketVideo>;
  /** Last selected video ID for shift-click range selection */
  lastSelectedId: string | null;
  /** Whether the basket panel is open */
  isPanelOpen: boolean;
  /** Trigger key — increments on each add to drive dock pulse animation */
  addTrigger: number;
}

interface BasketActions {
  /** Toggle a video in/out of the basket */
  toggle: (video: BasketVideo) => void;
  /** Add a video to the basket */
  add: (video: BasketVideo) => void;
  /** Remove a video from the basket */
  remove: (videoId: string) => void;
  /** Add a range of videos (for shift-click) */
  addRange: (videos: BasketVideo[]) => void;
  /** Clear the entire basket */
  clear: () => void;
  /** Check if a video is in the basket */
  has: (videoId: string) => boolean;
  /** Open/close the basket panel */
  setPanel: (open: boolean) => void;
  togglePanel: () => void;
}

export type BasketStore = BasketState & BasketActions;

/**
 * Basket Zustand store.
 *
 * Uses a Record (plain object) rather than Map for JSON serialization
 * compatibility with zustand/persist. O(1) lookups via object key access.
 *
 * Persists to localStorage so a page refresh doesn't lose selections.
 */
export const useBasketStore = create<BasketStore>()(
  persist(
    (set, get) => ({
      // State
      items: {},
      lastSelectedId: null,
      isPanelOpen: false,
      addTrigger: 0,

      // Actions
      toggle: (video) => {
        const state = get();
        if (state.items[video.id]) {
          // Remove
          const { [video.id]: _, ...rest } = state.items;
          set({
            items: rest,
            lastSelectedId: null,
            // Close panel if basket becomes empty
            isPanelOpen: Object.keys(rest).length === 0 ? false : state.isPanelOpen,
          });
        } else {
          // Add
          set({
            items: { ...state.items, [video.id]: video },
            lastSelectedId: video.id,
            addTrigger: state.addTrigger + 1,
          });
        }
      },

      add: (video) => {
        const state = get();
        if (!state.items[video.id]) {
          set({
            items: { ...state.items, [video.id]: video },
            lastSelectedId: video.id,
            addTrigger: state.addTrigger + 1,
          });
        }
      },

      remove: (videoId) => {
        const state = get();
        const { [videoId]: _, ...rest } = state.items;
        set({
          items: rest,
          isPanelOpen: Object.keys(rest).length === 0 ? false : state.isPanelOpen,
        });
      },

      addRange: (videos) => {
        const state = get();
        const newItems = { ...state.items };
        for (const video of videos) {
          newItems[video.id] = video;
        }
        set({
          items: newItems,
          lastSelectedId: videos.length > 0 ? videos[videos.length - 1].id : state.lastSelectedId,
          addTrigger: state.addTrigger + 1,
        });
      },

      clear: () => {
        set({
          items: {},
          lastSelectedId: null,
          isPanelOpen: false,
        });
      },

      has: (videoId) => {
        return !!get().items[videoId];
      },

      setPanel: (open) => {
        set({ isPanelOpen: open });
      },

      togglePanel: () => {
        const state = get();
        set({ isPanelOpen: !state.isPanelOpen });
      },

    }),
    {
      name: "kymo-basket",
      // Only persist items and lastSelectedId, not UI state
      partialize: (state) => ({
        items: state.items,
        lastSelectedId: state.lastSelectedId,
      }),
    }
  )
);
