<script lang="ts">
/**
 * PillarProvider
 * Vue component that initializes and manages the Pillar SDK
 */

import {
  Pillar,
  type CardCallbacks,
  type PillarConfig,
  type PillarEvents,
  type PillarState,
  type TaskExecutePayload,
  type ThemeConfig,
} from '@pillar-ai/sdk';
import {
  computed,
  createApp,
  defineComponent,
  h,
  onMounted,
  onUnmounted,
  provide,
  ref,
  shallowRef,
  watch,
  type App,
  type Component,
  type ComputedRef,
  type InjectionKey,
  type PropType,
  type Ref,
} from 'vue';

// ============================================================================
// Card Types
// ============================================================================

/**
 * Props passed to custom card components.
 */
export interface CardComponentProps<T = Record<string, unknown>> {
  /** Data extracted by the AI for this action */
  data: T;
  /** Called when user confirms the action */
  onConfirm: (modifiedData?: Record<string, unknown>) => void;
  /** Called when user cancels the action */
  onCancel: () => void;
  /** Called to report state changes (loading, success, error) */
  onStateChange?: (
    state: 'loading' | 'success' | 'error',
    message?: string
  ) => void;
}

/**
 * A Vue component that can be used as a custom card renderer.
 */
export type CardComponent<T = Record<string, unknown>> = Component<CardComponentProps<T>>;

// ============================================================================
// Context Types
// ============================================================================

export interface PillarContextValue {
  /** The Pillar SDK instance */
  pillar: Ref<Pillar | null>;

  /** Current SDK state */
  state: Ref<PillarState>;

  /** Whether the SDK is ready */
  isReady: ComputedRef<boolean>;

  /** Whether the panel is currently open */
  isPanelOpen: Ref<boolean>;

  /** Open the help panel */
  open: (options?: {
    view?: string;
    article?: string;
    search?: string;
    focusInput?: boolean;
  }) => void;

  /** Close the help panel */
  close: () => void;

  /** Toggle the help panel */
  toggle: () => void;

  /** Open a specific article */
  openArticle: (slug: string) => void;

  /** Open a specific category */
  openCategory: (slug: string) => Promise<void>;

  /** Perform a search */
  search: (query: string) => void;

  /** Navigate to a specific view */
  navigate: (view: string, params?: Record<string, string>) => void;

  /** Update the panel theme at runtime */
  setTheme: (theme: Partial<ThemeConfig>) => void;

  /** Enable or disable the text selection "Ask AI" popover */
  setTextSelectionEnabled: (enabled: boolean) => void;

  /** Subscribe to SDK events */
  on: <K extends keyof PillarEvents>(
    event: K,
    callback: (data: PillarEvents[K]) => void
  ) => () => void;
}

export interface PillarProviderProps {
  /** Help center subdomain or identifier */
  helpCenter: string;

  /**
   * Additional SDK configuration
   *
   * Notable options:
   * - `panel.useShadowDOM`: Whether to isolate styles in Shadow DOM (default: false).
   *   Set to false to let custom cards inherit your app's CSS (Tailwind, etc.)
   */
  config?: Omit<PillarConfig, 'helpCenter'>;

  /**
   * Handler called when a task action is triggered from the chat.
   * Use this to handle AI-suggested actions like opening modals, navigating, etc.
   */
  onTask?: (task: TaskExecutePayload) => void;

  /**
   * Custom card components to render for inline_ui type actions.
   * Map card type names to Vue components that will render the inline UI.
   */
  cards?: Record<string, CardComponent>;
}

// ============================================================================
// Injection Key
// ============================================================================

export const pillarContextKey: InjectionKey<PillarContextValue> = Symbol('pillar');

// ============================================================================
// Component
// ============================================================================

export default defineComponent({
  name: 'PillarProvider',

  props: {
    helpCenter: {
      type: String,
      required: true,
    },
    config: {
      type: Object as PropType<Omit<PillarConfig, 'helpCenter'>>,
      default: undefined,
    },
    onTask: {
      type: Function as PropType<(task: TaskExecutePayload) => void>,
      default: undefined,
    },
    cards: {
      type: Object as PropType<Record<string, CardComponent>>,
      default: undefined,
    },
  },

  setup(props, { slots }) {
    // Reactive state
    const pillar = shallowRef<Pillar | null>(null);
    const state = ref<PillarState>('uninitialized');
    const isPanelOpen = ref(false);

    // Computed
    const isReady = computed(() => state.value === 'ready');

    // Store cleanup functions
    const cleanupFunctions: Array<() => void> = [];
    const cardApps: Map<HTMLElement, App> = new Map();

    // Actions
    const open = (options?: {
      view?: string;
      article?: string;
      search?: string;
      focusInput?: boolean;
    }) => {
      pillar.value?.open(options);
    };

    const close = () => {
      pillar.value?.close();
    };

    const toggle = () => {
      pillar.value?.toggle();
    };

    const openArticle = (slug: string) => {
      pillar.value?.open({ article: slug });
    };

    const openCategory = async (slug: string) => {
      pillar.value?.navigate('category', { slug });
    };

    const search = (query: string) => {
      pillar.value?.open({ search: query });
    };

    const navigate = (view: string, params?: Record<string, string>) => {
      pillar.value?.navigate(view, params);
    };

    const setTheme = (theme: Partial<ThemeConfig>) => {
      pillar.value?.setTheme(theme);
    };

    const setTextSelectionEnabled = (enabled: boolean) => {
      pillar.value?.setTextSelectionEnabled(enabled);
    };

    const on = <K extends keyof PillarEvents>(
      event: K,
      callback: (data: PillarEvents[K]) => void
    ): (() => void) => {
      return pillar.value?.on(event, callback) ?? (() => {});
    };

    // Register card renderers
    const registerCards = (instance: Pillar) => {
      if (!props.cards) return;

      Object.entries(props.cards).forEach(([cardType, CardComponent]) => {
        const unsubscribe = instance.registerCard(
          cardType,
          (container, data, callbacks: CardCallbacks) => {
            // Create a Vue app for this card
            const app = createApp({
              render() {
                return h(CardComponent as Component, {
                  data,
                  onConfirm: callbacks.onConfirm,
                  onCancel: callbacks.onCancel,
                  onStateChange: callbacks.onStateChange,
                });
              },
            });

            cardApps.set(container, app);
            app.mount(container);

            // Return cleanup function
            return () => {
              const existingApp = cardApps.get(container);
              if (existingApp) {
                existingApp.unmount();
                cardApps.delete(container);
              }
            };
          }
        );

        cleanupFunctions.push(unsubscribe);
      });
    };

    // Initialize SDK
    onMounted(async () => {
      try {
        // Pillar is a singleton - check if already initialized
        const existingInstance = Pillar.getInstance();
        if (existingInstance) {
          // Reuse existing instance (preserves chat history, panel state, etc.)
          pillar.value = existingInstance;
          state.value = existingInstance.state;

          // Re-subscribe to events
          const unsubOpen = existingInstance.on('panel:open', () => {
            isPanelOpen.value = true;
          });
          cleanupFunctions.push(unsubOpen);

          const unsubClose = existingInstance.on('panel:close', () => {
            isPanelOpen.value = false;
          });
          cleanupFunctions.push(unsubClose);

          // Register cards
          registerCards(existingInstance);
          return;
        }

        // Initialize new instance
        const instance = await Pillar.init({
          helpCenter: props.helpCenter,
          ...props.config,
        });

        pillar.value = instance;
        state.value = instance.state;

        // Listen for panel open/close
        const unsubOpen = instance.on('panel:open', () => {
          isPanelOpen.value = true;
        });
        cleanupFunctions.push(unsubOpen);

        const unsubClose = instance.on('panel:close', () => {
          isPanelOpen.value = false;
        });
        cleanupFunctions.push(unsubClose);

        // Listen for state changes
        const unsubReady = instance.on('ready', () => {
          state.value = 'ready';
        });
        cleanupFunctions.push(unsubReady);

        const unsubError = instance.on('error', () => {
          state.value = 'error';
        });
        cleanupFunctions.push(unsubError);

        // Register task handler
        if (props.onTask) {
          const unsubTask = instance.on('task:execute', (task) => {
            props.onTask?.(task);
          });
          cleanupFunctions.push(unsubTask);
        }

        // Register cards
        registerCards(instance);
      } catch (error) {
        console.error('[Pillar Vue] Failed to initialize:', error);
        state.value = 'error';
      }
    });

    // Watch for onTask prop changes
    watch(
      () => props.onTask,
      (newHandler, oldHandler) => {
        if (pillar.value && newHandler && newHandler !== oldHandler) {
          // Note: We can't easily unsubscribe the old handler here
          // The onTask prop should ideally be stable
          const unsubTask = pillar.value.on('task:execute', (task) => {
            newHandler(task);
          });
          cleanupFunctions.push(unsubTask);
        }
      }
    );

    // Cleanup
    onUnmounted(() => {
      // Run all cleanup functions
      cleanupFunctions.forEach((cleanup) => cleanup());
      cleanupFunctions.length = 0;

      // Unmount all card apps
      cardApps.forEach((app) => app.unmount());
      cardApps.clear();

      // Note: We intentionally don't call Pillar.destroy() here
      // The singleton persists to maintain state across route changes
    });

    // Provide context
    const contextValue: PillarContextValue = {
      pillar,
      state,
      isReady,
      isPanelOpen,
      open,
      close,
      toggle,
      openArticle,
      openCategory,
      search,
      navigate,
      setTheme,
      setTextSelectionEnabled,
      on,
    };

    provide(pillarContextKey, contextValue);

    // Render slot content
    return () => slots.default?.();
  },
});
</script>
