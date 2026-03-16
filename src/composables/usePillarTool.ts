/**
 * usePillarTool Composable
 *
 * Register one or more tools with co-located metadata and handlers.
 * Tools are registered on mount and unregistered on unmount.
 *
 * @example Single tool
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
 * @example Tool with inline render
 * ```vue
 * <script setup lang="ts">
 * import { usePillarTool } from '@pillar-ai/vue';
 * import ShoeSearchCard from './ShoeSearchCard.vue';
 *
 * usePillarTool({
 *   name: 'search_shoes',
 *   description: 'Search for shoes',
 *   type: 'inline_ui',
 *   execute: async ({ query }) => ({ shoes: await searchShoes(query) }),
 *   render: ShoeSearchCard,
 * });
 * </script>
 *
 * <template>
 *   <div>Shoe Store</div>
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

import type { ToolSchema, CardCallbacks } from '@pillar-ai/sdk';
import { inject, ref, watch, onUnmounted, computed, createApp, h, type Component, type App } from 'vue';
import { pillarContextKey } from '../context';
import type { PillarContextValue } from '../types';

/**
 * Props passed to tool render components.
 */
export interface ToolRenderProps<T = Record<string, unknown>> {
  /** Data returned by the tool's execute function */
  data: T;
  /** Call when user confirms/completes the action */
  onConfirm: (modifiedData?: Record<string, unknown>) => void;
  /** Call when user cancels the action */
  onCancel: () => void;
  /** Report state changes (loading, success, error) */
  onStateChange?: (
    state: 'loading' | 'success' | 'error',
    message?: string
  ) => void;
}

/**
 * Extended tool schema that accepts a Vue component for render.
 * The component receives ToolRenderProps as props.
 */
export interface VueToolSchema<TInput = Record<string, unknown>>
  extends Omit<ToolSchema<TInput>, 'render'> {
  /**
   * Vue component to render the tool's result inline in chat.
   *
   * When provided, the SDK automatically registers this as a card renderer
   * using the tool name as the card type. The component receives props:
   * - data: The data returned by execute
   * - onConfirm: Call to confirm the action
   * - onCancel: Call to cancel the action
   * - onStateChange: Optional callback for state changes
   *
   * @example
   * ```vue
   * // ShoeSearchCard.vue
   * <script setup>
   * defineProps(['data', 'onConfirm', 'onCancel']);
   * </script>
   * <template>
   *   <div @click="onConfirm">{{ data.shoes.length }} results</div>
   * </template>
   * ```
   */
  render?: Component;
}

/**
 * Register one or more Pillar tools with co-located metadata and handlers.
 *
 * The tools are registered when the component mounts and automatically
 * unregistered when it unmounts. The `execute` functions always capture
 * the latest Vue reactive state via refs, so you don't need to worry
 * about stale closures.
 *
 * If a tool has a `render` prop, the SDK automatically registers it as
 * a card renderer using the tool name as the card type.
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
      const unsub = pillar.defineTool({
        ...schema,
        // Wrap execute to always use the latest ref version
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: (input: any) => schemasRef.value[index].execute(input),
      } as ToolSchema);
      unsubscribes.push(unsub);

      // If there's a render component, register it as a card renderer
      if (schema.render) {
        const RenderComponent = schema.render;
        const cardType = schema.name;

        const unsubCard = pillar.registerCard(
          cardType,
          (container, data, callbacks: CardCallbacks) => {
            const app = createApp({
              render: () =>
                h(RenderComponent, {
                  data,
                  onConfirm: callbacks.onConfirm,
                  onCancel: callbacks.onCancel,
                  onStateChange: callbacks.onStateChange,
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
          }
        );

        unsubscribes.push(unsubCard);
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
