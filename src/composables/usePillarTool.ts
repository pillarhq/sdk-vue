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
} from '@pillar-ai/sdk';
import { inject, ref, watch, onUnmounted, computed, createApp, h, type Component, type App } from 'vue';
import { pillarContextKey } from '../context';
import type { PillarContextValue } from '../types';

/**
 * Props passed to tool render components.
 */
export interface ToolRenderProps<T = Record<string, unknown>> {
  /** Data provided by the AI agent */
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
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface VueExecutableToolSchema<TInput = Record<string, unknown>>
  extends ExecutableToolSchema<TInput> {}

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
          (container, data, callbacks: CardCallbacks) => {
            const currentSchema = schemasRef.value[index];
            const CurrentRender =
              currentSchema.type === 'inline_ui'
                ? (currentSchema as VueInlineUIToolSchema).render
                : RenderComponent;

            const app = createApp({
              render: () =>
                h(CurrentRender, {
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
      } else {
        // Executable tool: register execute handler, no render
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
