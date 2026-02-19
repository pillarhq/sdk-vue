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

import type { ToolSchema } from '@pillar-ai/sdk';
import { inject, ref, watch, onUnmounted, computed } from 'vue';
import { pillarContextKey } from '../context';
import type { PillarContextValue } from '../types';

/**
 * Register one or more Pillar tools with co-located metadata and handlers.
 *
 * The tools are registered when the component mounts and automatically
 * unregistered when it unmounts. The `execute` functions always capture
 * the latest Vue reactive state via refs, so you don't need to worry
 * about stale closures.
 *
 * @param schemaOrSchemas - Single tool schema or array of tool schemas
 */
export function usePillarTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schemaOrSchemas: ToolSchema<any> | ToolSchema<any>[]
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

  // Track unsubscribe functions
  const unsubscribes: Array<() => void> = [];

  // Register tools when pillar is ready
  const registerTools = () => {
    const pillar = context.pillar.value;
    if (!pillar) return;

    // Clear any existing registrations
    unsubscribes.forEach((unsub) => unsub());
    unsubscribes.length = 0;

    // Register all tools and collect unsubscribe functions
    schemasRef.value.forEach((schema, index) => {
      const unsub = pillar.defineTool({
        ...schema,
        // Wrap execute to always use the latest ref version
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: (input: any) => schemasRef.value[index].execute(input),
      } as ToolSchema);
      unsubscribes.push(unsub);
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
  });
}

/** @deprecated Use usePillarTool instead */
export const usePillarAction = usePillarTool;
