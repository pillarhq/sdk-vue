/**
 * usePillarTool Composable
 *
 * Register one or more tools with co-located metadata and handlers.
 * Tools are registered on mount and unregistered on unmount.
 *
 * - For `type: 'inline_ui'` tools: provide `render` (a Vue component).
 *   The AI agent supplies data directly to the component — no `execute` needed.
 * - For all other tool types: provide `execute`. No `render` prop.
 *
 * @example Single executable tool
 * ```vue
 * <script setup lang="ts">
 * import { usePillarTool } from '@pillar-ai/vue';
 *
 * usePillarTool({
 *   name: 'add_to_cart',
 *   description: 'Add a product to the shopping cart',
 *   inputSchema: {
 *     type: 'object',
 *     properties: {
 *       productId: { type: 'string', description: 'Product ID' },
 *       quantity: { type: 'number', description: 'Quantity to add' },
 *     },
 *     required: ['productId', 'quantity'],
 *   },
 *   execute: async ({ productId, quantity }) => {
 *     await cartApi.add(productId, quantity);
 *     return { content: [{ type: 'text', text: 'Added to cart' }] };
 *   },
 * });
 * </script>
 *
 * <template>
 *   <button>Cart</button>
 * </template>
 * ```
 *
 * @example Inline UI tool with render component
 * ```vue
 * <script setup lang="ts">
 * import { usePillarTool } from '@pillar-ai/vue';
 * import ShoeSearchCard from './ShoeSearchCard.vue';
 *
 * usePillarTool({
 *   name: 'search_shoes',
 *   description: 'Search for shoes',
 *   type: 'inline_ui',
 *   render: ShoeSearchCard,
 * });
 * </script>
 *
 * <template>
 *   <div>Shoe Store</div>
 * </template>
 * ```
 *
 * @example Executable tool with confirmation step
 * ```vue
 * <script setup lang="ts">
 * import { usePillarTool } from '@pillar-ai/vue';
 *
 * usePillarTool({
 *   name: 'delete_account',
 *   description: 'Permanently delete the user account',
 *   needsConfirmation: true,
 *   execute: async () => {
 *     await api.deleteAccount();
 *     return { success: true };
 *   },
 * });
 * </script>
 *
 * <template>
 *   <div>Settings</div>
 * </template>
 * ```
 *
 * @example Executable tool with custom confirmation UI
 * ```vue
 * <script setup lang="ts">
 * import { usePillarTool } from '@pillar-ai/vue';
 * import ConfirmDelete from './ConfirmDelete.vue';
 *
 * usePillarTool({
 *   name: 'delete_account',
 *   description: 'Permanently delete the user account',
 *   renderConfirmation: ConfirmDelete,
 *   execute: async () => {
 *     await api.deleteAccount();
 *     return { success: true };
 *   },
 * });
 * </script>
 *
 * <template>
 *   <div>Settings</div>
 * </template>
 * ```
 *
 * @example Multiple tools
 * ```vue
 * <script setup lang="ts">
 * import { usePillarTool } from '@pillar-ai/vue';
 *
 * usePillarTool([
 *   {
 *     name: 'get_current_plan',
 *     description: 'Get the current billing plan',
 *     execute: async () => ({ plan: 'pro', price: 29 }),
 *   },
 *   {
 *     name: 'upgrade_plan',
 *     description: 'Upgrade to a higher plan',
 *     inputSchema: {
 *       type: 'object',
 *       properties: { planId: { type: 'string' } },
 *       required: ['planId'],
 *     },
 *     execute: async ({ planId }) => {
 *       await billingApi.upgrade(planId);
 *       return { content: [{ type: 'text', text: 'Upgraded!' }] };
 *     },
 *   },
 * ]);
 * </script>
 *
 * <template>
 *   <div>Billing Content</div>
 * </template>
 * ```
 */

import type {
  ToolSchema,
  InlineUIToolSchema,
  ExecutableToolSchema,
  CardCallbacks,
  ToolCardContext,
} from '@pillar-ai/sdk';
import { inject, ref, watch, onUnmounted, computed, createApp, h, defineComponent, type Component, type App } from 'vue';
import { pillarContextKey } from '../context';
import type { PillarContextValue } from '../types';

/**
 * Props passed to tool render components.
 */
export interface ToolRenderProps<T = Record<string, unknown>> {
  /** Data provided by the AI agent */
  data: T;
  /**
   * Send a result back to the AI agent, continuing the conversation.
   * The agent sees this as the tool's response and can reason about it.
   */
  sendResult: (result: Record<string, unknown>) => Promise<void>;
  /** Context about this card's position in the chat. */
  context: ToolCardContext;
  /** Report state changes (loading, success, error) */
  onStateChange?: (
    state: 'loading' | 'success' | 'error',
    message?: string
  ) => void;
}

/**
 * Props passed to custom confirmation render components.
 * Only used with executable (non-inline_ui) tools that have `renderConfirmation`.
 */
export interface ConfirmationRenderProps<T = Record<string, unknown>> {
  /** Data the AI provided when invoking the tool */
  data: T;
  /** Call to approve the action — triggers the tool's `execute` handler and sends the result to the AI */
  onConfirm: (modifiedData?: Record<string, unknown>) => void;
  /** Call to dismiss the confirmation — no execution, card collapses */
  onCancel: () => void;
}

/**
 * Vue inline_ui tool schema. Requires `render`, forbids `execute`.
 *
 * The AI agent provides data directly to the Vue component.
 */
export interface VueInlineUIToolSchema<TInput = Record<string, unknown>>
  extends Omit<InlineUIToolSchema<TInput>, 'render'> {
  render: Component;
}

/**
 * Vue executable tool schema. Requires `execute`, forbids `render`.
 *
 * Optionally supports `needsConfirmation` and `renderConfirmation` to gate
 * execution behind user approval.
 */
export interface VueExecutableToolSchema<TInput = Record<string, unknown>>
  extends ExecutableToolSchema<TInput> {
  /**
   * When true, the SDK shows a confirmation UI before calling `execute`.
   * Uses default Confirm / Cancel buttons unless `renderConfirmation` is provided.
   */
  needsConfirmation?: boolean;
  /**
   * Custom Vue component for the confirmation step.
   * Receives `data`, `onConfirm`, `onCancel` props. Implies `needsConfirmation`.
   */
  renderConfirmation?: Component;
}

/**
 * Tool schema for `usePillarTool`. Discriminated on `type`:
 *
 * - `type: 'inline_ui'` → `render` required, `execute` forbidden
 * - all other types → `execute` required, `render` forbidden
 */
export type VueToolSchema<TInput = Record<string, unknown>> =
  | VueInlineUIToolSchema<TInput>
  | VueExecutableToolSchema<TInput>;

/**
 * Creates a reactive wrapper component that subscribes to Pillar message updates
 * and recomputes isLatest whenever the message list changes.
 */
function createReactiveCardWrapper(
  RenderComponent: Component,
  data: Record<string, unknown>,
  sendResult: (result: Record<string, unknown>) => Promise<void>,
  onStateChange: CardCallbacks['onStateChange'],
  messageIndex: number,
  segmentIndex: number,
  toolName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pillar: any
) {
  return defineComponent({
    name: 'ReactiveCardWrapper',
    setup() {
      const isLatest = ref(pillar.isPositionLatest(messageIndex, segmentIndex));
      const isReady = ref(!pillar.isChatLoading);

      const unsubMessages = pillar.subscribeToMessages(() => {
        isLatest.value = pillar.isPositionLatest(messageIndex, segmentIndex);
      });
      const unsubLoading = pillar.subscribeToLoadingState(() => {
        isReady.value = !pillar.isChatLoading;
      });

      onUnmounted(() => {
        unsubMessages();
        unsubLoading();
      });

      const context = computed<ToolCardContext>(() => ({
        isLatest: isLatest.value,
        isReady: isReady.value,
        messageIndex,
        segmentIndex,
        toolName,
      }));

      return () =>
        h(RenderComponent, {
          data,
          sendResult,
          context: context.value,
          onStateChange,
        });
    },
  });
}

/**
 * Error fallback component displayed when an inline_ui tool's render component throws an error.
 * Shows a generic user-facing message (technical details are sent to the LLM).
 */
function renderErrorFallback() {
  return h(
    'div',
    {
      style: {
        padding: '12px 16px',
        borderRadius: '8px',
        backgroundColor: '#fef2f2',
        border: '1px solid #fecaca',
        color: '#991b1b',
        fontSize: '14px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      },
    },
    [
      h(
        'div',
        { style: { fontWeight: '500' } },
        'Something went wrong displaying this content'
      ),
    ]
  );
}

/**
 * Register one or more Pillar tools with co-located metadata and handlers.
 *
 * The tools are registered when the component mounts and automatically
 * unregistered when it unmounts. The `execute` functions always capture
 * the latest Vue reactive state via refs, so you don't need to worry
 * about stale closures.
 *
 * - `inline_ui` tools register a card renderer from the `render` prop.
 * - All other tools register the `execute` handler.
 *
 * @param schemaOrSchemas - Single tool schema or array of tool schemas
 */
export function usePillarTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schemaOrSchemas: VueToolSchema<any> | VueToolSchema<any>[]
): void {
  const context = inject<PillarContextValue | undefined>(pillarContextKey, undefined);

  if (!context) {
    console.warn(
      '[Pillar Vue] usePillarTool must be used within a PillarProvider. Tools will not be registered.'
    );
    return;
  }

  // Normalize to array for consistent handling
  const schemas = Array.isArray(schemaOrSchemas) ? schemaOrSchemas : [schemaOrSchemas];

  // Keep ref to latest schemas so handlers capture current state/props
  const schemasRef = ref(schemas);

  // Track unsubscribe functions and Vue app instances
  const unsubscribes: Array<() => void> = [];
  const cardApps: Map<HTMLElement, App> = new Map();

  // Register tools when pillar is ready
  const registerTools = () => {
    const pillar = context.pillar.value;
    if (!pillar) return;

    // Clear any existing registrations
    unsubscribes.forEach((unsub) => unsub());
    unsubscribes.length = 0;
    cardApps.forEach((app) => app.unmount());
    cardApps.clear();

    // Register all tools and collect unsubscribe functions
    schemasRef.value.forEach((schema, index) => {
      if (schema.type === 'inline_ui') {
        // inline_ui: register card renderer, no execute
        const RenderComponent = schema.render;
        const cardType = schema.name;

        // Register the tool definition (without execute) so the SDK knows about it
        const { render: _render, ...sdkSchema } = schema;
        const unsub = pillar.defineTool(sdkSchema as ToolSchema);
        unsubscribes.push(unsub);

        const unsubCard = pillar.registerCard(
          cardType,
          (container, data, callbacks: CardCallbacks, context) => {
            const currentSchema = schemasRef.value[index];
            const CurrentRender =
              currentSchema.type === 'inline_ui'
                ? (currentSchema as VueInlineUIToolSchema).render
                : RenderComponent;

            const messageIndex = context?.messageIndex ?? -1;
            const segmentIndex = context?.segmentIndex ?? -1;

            // Create a reactive wrapper that subscribes to message updates
            // and recomputes isLatest when the message list changes
            const ReactiveWrapper = createReactiveCardWrapper(
              CurrentRender,
              data,
              (result: Record<string, unknown>) => {
                pillar.sendToolResultAsMessage(cardType, result);
                return Promise.resolve();
              },
              callbacks.onStateChange,
              messageIndex,
              segmentIndex,
              cardType,
              pillar
            );

            let hasErrored = false;
            const app = createApp(ReactiveWrapper);

            app.config.errorHandler = (error) => {
              if (hasErrored) return;
              hasErrored = true;

              const existingApp = cardApps.get(container);
              if (existingApp) {
                existingApp.unmount();
                cardApps.delete(container);
              }

              const errorApp = createApp({
                render: () => renderErrorFallback(),
              });
              errorApp.mount(container);
              cardApps.set(container, errorApp);

              pillar.sendToolResultAsMessage(cardType, {
                success: false,
                error: `Component render error: ${error instanceof Error ? error.message : String(error)}`,
                errorType: 'render_error',
              });
            };

            app.mount(container);
            cardApps.set(container, app);

            return () => {
              const existingApp = cardApps.get(container);
              if (existingApp) {
                existingApp.unmount();
                cardApps.delete(container);
              }
            };
          }
        );

        unsubscribes.push(unsubCard);
      } else {
        const execSchema = schema as VueExecutableToolSchema<
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          any
        >;
        const wantsConfirmation =
          execSchema.needsConfirmation || !!execSchema.renderConfirmation;

        if (wantsConfirmation) {
          // Register the tool WITHOUT execute so the SDK doesn't auto-run it.
          const {
            execute: _execute,
            needsConfirmation: _nc,
            renderConfirmation: _rc,
            ...sdkSchema
          } = execSchema;

          const unsub = pillar.defineTool({
            ...sdkSchema,
            needsConfirmation: true,
          } as unknown as ToolSchema);
          unsubscribes.push(unsub);

          const ConfirmComponent = execSchema.renderConfirmation;

          const unsubCard = pillar.registerCard(
            schema.name,
            (container, data, callbacks: CardCallbacks) => {
              const handleConfirm = async (
                modifiedData?: Record<string, unknown>
              ) => {
                const currentSchema = schemasRef.value[index] as VueExecutableToolSchema<
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  any
                >;
                const executeData = modifiedData || data;

                try {
                  callbacks.onStateChange?.('loading');
                  const result = await currentSchema.execute(executeData);
                  if (result !== undefined) {
                    await pillar.sendToolResult(schema.name, result);
                  }
                  callbacks.onStateChange?.('success');
                } catch (err) {
                  callbacks.onStateChange?.(
                    'error',
                    err instanceof Error ? err.message : String(err)
                  );
                  await pillar.sendToolResult(schema.name, {
                    success: false,
                    error: err instanceof Error ? err.message : String(err),
                  });
                }
              };

              const handleCancel = () => {
                callbacks.onCancel?.();
              };

              if (ConfirmComponent) {
                const currentSchema = schemasRef.value[index] as VueExecutableToolSchema<
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  any
                >;
                const CurrentConfirm =
                  currentSchema.renderConfirmation || ConfirmComponent;

                const app = createApp({
                  render: () =>
                    h(CurrentConfirm, {
                      data,
                      onConfirm: handleConfirm,
                      onCancel: handleCancel,
                    }),
                });

                app.mount(container);
                cardApps.set(container, app);

                return () => {
                  const existingApp = cardApps.get(container);
                  if (existingApp) {
                    existingApp.unmount();
                    cardApps.delete(container);
                  }
                };
              } else {
                // Use the default card — wire confirm/cancel through callbacks
                callbacks.onConfirm = handleConfirm;
                callbacks.onCancel = handleCancel;
              }
            }
          );

          unsubscribes.push(unsubCard);
        } else {
          // Executable tool without confirmation: register execute handler directly
          const unsub = pillar.defineTool({
            ...schema,
            // Wrap execute to always use the latest ref version
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            execute: (input: any) =>
              (schemasRef.value[index] as VueExecutableToolSchema<
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                any
              >).execute(input),
          } as ToolSchema);
          unsubscribes.push(unsub);
        }
      }
    });
  };

  // Stable key for tracking tool names
  const toolNamesKey = computed(() => schemasRef.value.map((s) => s.name).join(','));

  // Watch for pillar becoming ready and tool names changing
  watch(
    [() => context.pillar.value, toolNamesKey],
    ([pillar]) => {
      if (pillar) {
        registerTools();
      }
    },
    { immediate: true }
  );

  // Cleanup on unmount
  onUnmounted(() => {
    unsubscribes.forEach((unsub) => unsub());
    unsubscribes.length = 0;
    cardApps.forEach((app) => app.unmount());
    cardApps.clear();
  });
}

/** @deprecated Use usePillarTool instead */
export const usePillarAction = usePillarTool;
