/**
 * @pillar-ai/vue - Vue bindings for Pillar SDK
 * 
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { PillarProvider, usePillar, useHelpPanel } from '@pillar-ai/vue';
 * </script>
 * 
 * <template>
 *   <PillarProvider product-key="your-product-key">
 *     <MyApp />
 *   </PillarProvider>
 * </template>
 * ```
 * 
 * @example
 * ```vue
 * <!-- MyApp.vue -->
 * <script setup lang="ts">
 * import { useHelpPanel } from '@pillar-ai/vue';
 * 
 * const { isReady } = usePillar();
 * const { toggle } = useHelpPanel();
 * </script>
 * 
 * <template>
 *   <div>
 *     <h1>Welcome!</h1>
 *     <button @click="toggle">Open Co-pilot</button>
 *   </div>
 * </template>
 * ```
 * 
 * @example Custom panel placement
 * ```vue
 * <script setup lang="ts">
 * import { PillarProvider, PillarPanel } from '@pillar-ai/vue';
 * </script>
 * 
 * <template>
 *   <PillarProvider 
 *     product-key="your-product-key"
 *     :config="{ panel: { container: 'manual' } }"
 *   >
 *     <div class="layout">
 *       <PillarPanel class="custom-panel" />
 *       <main>Your content</main>
 *     </div>
 *   </PillarProvider>
 * </template>
 * ```
 */

// Provider component
export { default as PillarProvider } from './PillarProvider.vue';

// Panel component
export { default as PillarPanel } from './PillarPanel.vue';

// Context
export { pillarContextKey } from './context';

// Types
export type {
    CardComponent, CardComponentProps, PillarContextValue, PillarPanelProps, PillarProviderProps
} from './types';

// Composables
export { useHelpPanel, type UseHelpPanelResult } from './composables/useHelpPanel';
export { usePillar, type TypedUsePillarResult, type UsePillarResult } from './composables/usePillar';
export {
    usePillarTool,
    usePillarAction,
    type ToolRenderProps,
    type VueToolSchema,
} from './composables/usePillarTool';

// Re-export types from core SDK for convenience
export type {
    // Configuration types
    EdgeTriggerConfig,
    MobileTriggerConfig,
    MobileTriggerPosition,
    MobileTriggerIcon,
    MobileTriggerSize,
    PanelConfig,
    PillarConfig,
    PillarEvents,
    PillarState,
    ResolvedConfig,
    ResolvedMobileTriggerConfig,
    ResolvedThemeConfig,
    TaskExecutePayload,
    TextSelectionConfig,
    ThemeColors,
    ThemeConfig,
    ThemeMode,
    CardCallbacks,
    CardRenderer,
    SidebarTabConfig,
    // Tool types for type-safe onTask and usePillarTool
    ToolDefinitions,
    SyncToolDefinitions,
    ToolDataType,
    ToolNames,
    // Unified tool schema (new API)
    ToolExecuteResult,
    ToolSchema,
    ToolType,
    // Backwards compatibility aliases (deprecated)
    ActionDefinitions,
    SyncActionDefinitions,
    ActionDataType,
    ActionNames,
    ActionResult,
    ActionSchema,
    ActionType,
    // Chat context for escalation
    ChatContext,
    // DOM Scanning types (deprecated - feature is disabled)
    /** @deprecated DOM scanning is disabled */
    DOMScanningConfig,
    /** @deprecated DOM scanning is disabled */
    ResolvedDOMScanningConfig,
    /** @deprecated DOM scanning is disabled */
    ScanOptions,
    /** @deprecated DOM scanning is disabled */
    CompactScanResult,
    /** @deprecated DOM scanning is disabled */
    InteractionType,
    // DOM Scanner utilities (deprecated - feature is disabled)
    /** @deprecated DOM scanning is disabled */
    scanPageDirect,
} from '@pillar-ai/sdk';

