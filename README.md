# @pillar-ai/vue

Vue 3 bindings for the Pillar Embedded Help SDK — Add contextual help and AI-powered assistance to your Vue application.

[![npm version](https://img.shields.io/npm/v/@pillar-ai/vue)](https://www.npmjs.com/package/@pillar-ai/vue)
[![npm downloads](https://img.shields.io/npm/dm/@pillar-ai/vue)](https://www.npmjs.com/package/@pillar-ai/vue)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)](https://www.typescriptlang.org/)

## Features

- **Vue Composables** — `usePillar` and `useHelpPanel` for idiomatic Vue integration
- **Components** — `PillarProvider` and `PillarPanel` components
- **Composition API** — Built for Vue 3 Composition API
- **Nuxt Compatible** — Works with Nuxt 3 applications
- **Type-Safe Actions** — Full TypeScript support for custom actions
- **Custom Cards** — Render custom Vue components for inline actions

## Documentation

**[View Full Documentation](https://trypillar.com/docs)** | [Vue Guide](https://trypillar.com/docs/vue/installation) | [API Reference](https://trypillar.com/docs/reference/vue)

## Installation

```bash
npm install @pillar-ai/vue
# or
pnpm add @pillar-ai/vue
# or
yarn add @pillar-ai/vue
```

## Quick Start

Wrap your app with `PillarProvider`:

```vue
<script setup lang="ts">
import { PillarProvider } from '@pillar-ai/vue';
</script>

<template>
  <PillarProvider help-center="your-help-center">
    <MyApp />
  </PillarProvider>
</template>
```

### Nuxt 3 Integration

Create a plugin for Nuxt 3 applications:

```ts
// plugins/pillar.client.ts
export default defineNuxtPlugin(() => {
  // Pillar SDK is client-side only
});
```

Then wrap your app in `app.vue`:

```vue
<script setup lang="ts">
import { PillarProvider } from '@pillar-ai/vue';
</script>

<template>
  <PillarProvider help-center="your-help-center">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </PillarProvider>
</template>
```

## Components

### PillarProvider

The root provider that initializes the SDK and provides context to child components.

```vue
<template>
  <PillarProvider
    help-center="your-help-center"
    :config="{
      panel: { position: 'right', mode: 'push' },
      edgeTrigger: { enabled: true },
      theme: { mode: 'auto' },
    }"
  >
    <!-- Your app content -->
  </PillarProvider>
</template>
```

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `help-center` | `string` | Yes | Your help center subdomain or identifier |
| `config` | `PillarConfig` | No | SDK configuration options |
| `on-task` | `(task) => void` | No | Handler for AI-suggested actions |
| `cards` | `Record<string, Component>` | No | Custom card components |

### Custom Trigger Button

To use your own button instead of the built-in edge trigger:

```vue
<script setup lang="ts">
import { PillarProvider, useHelpPanel } from '@pillar-ai/vue';
</script>

<template>
  <PillarProvider
    help-center="your-help-center"
    :config="{ edgeTrigger: { enabled: false } }"
  >
    <MyApp />
  </PillarProvider>
</template>

<!-- In MyApp.vue -->
<script setup lang="ts">
import { useHelpPanel } from '@pillar-ai/vue';

const { toggle } = useHelpPanel();
</script>

<template>
  <button @click="toggle">Get Help</button>
</template>
```

### PillarPanel

For custom panel placement (when using `container: 'manual'`):

```vue
<script setup lang="ts">
import { PillarProvider, PillarPanel } from '@pillar-ai/vue';
</script>

<template>
  <PillarProvider
    help-center="your-help-center"
    :config="{ panel: { container: 'manual' } }"
  >
    <div class="layout">
      <main>Your content</main>
      <PillarPanel class="sidebar-panel" />
    </div>
  </PillarProvider>
</template>
```

## Composables

### usePillar

Access the SDK instance and state:

```vue
<script setup lang="ts">
import { usePillar } from '@pillar-ai/vue';

const { isReady, isPanelOpen, pillar } = usePillar();
</script>

<template>
  <div v-if="!isReady">Loading...</div>
  <div v-else>Panel is {{ isPanelOpen ? 'open' : 'closed' }}</div>
</template>
```

### useHelpPanel

Control the help panel:

```vue
<script setup lang="ts">
import { useHelpPanel } from '@pillar-ai/vue';

const { open, close, toggle, isOpen } = useHelpPanel();
</script>

<template>
  <button @click="toggle">{{ isOpen ? 'Close Help' : 'Get Help' }}</button>
</template>
```

**Available Methods:**

| Method | Description |
|--------|-------------|
| `open(options?)` | Open the panel with optional view/article/search |
| `close()` | Close the panel |
| `toggle()` | Toggle the panel open/closed |
| `openArticle(slug)` | Open a specific article |
| `openCategory(slug)` | Open a specific category |
| `openSearch(query?)` | Open search with optional query |
| `openChat()` | Open the AI chat view |

## Type-Safe Actions

Define custom actions with full TypeScript support:

```vue
<script setup lang="ts">
import { PillarProvider, usePillar } from '@pillar-ai/vue';
import type { ActionDefinitions } from '@pillar-ai/vue';
import { onMounted, onUnmounted } from 'vue';

// Define your actions
const actions = {
  openSettings: {
    type: 'navigate' as const,
    label: 'Open Settings',
    description: 'Navigate to settings page',
  },
  showNotification: {
    type: 'trigger' as const,
    label: 'Show Notification',
    description: 'Display a notification',
    dataSchema: {
      message: { type: 'string' as const, required: true },
    },
  },
} satisfies ActionDefinitions;

// In a child component
const { onTask } = usePillar<typeof actions>();

let unsub: (() => void) | undefined;

onMounted(() => {
  // TypeScript knows the exact shape of data based on task name
  unsub = onTask('showNotification', (data) => {
    console.log(data.message); // Typed!
  });
});

onUnmounted(() => {
  unsub?.();
});
</script>
```

## Custom Cards

Register custom Vue components for inline_ui type actions:

```vue
<script setup lang="ts">
import { PillarProvider } from '@pillar-ai/vue';
import InviteMembersCard from './cards/InviteMembersCard.vue';
import ConfirmDeleteCard from './cards/ConfirmDeleteCard.vue';

const cards = {
  invite_members: InviteMembersCard,
  confirm_delete: ConfirmDeleteCard,
};
</script>

<template>
  <PillarProvider
    help-center="your-help-center"
    :cards="cards"
  >
    <MyApp />
  </PillarProvider>
</template>
```

### Card Component Props

Custom card components receive the following props:

```typescript
interface CardComponentProps<T = Record<string, unknown>> {
  /** Data extracted by the AI for this action */
  data: T;
  /** Called when user confirms the action */
  onConfirm: (modifiedData?: Record<string, unknown>) => void;
  /** Called when user cancels the action */
  onCancel: () => void;
  /** Called to report state changes */
  onStateChange?: (state: 'loading' | 'success' | 'error', message?: string) => void;
}
```

Example card component:

```vue
<script setup lang="ts">
import type { CardComponentProps } from '@pillar-ai/vue';

const props = defineProps<CardComponentProps<{ emails: string[] }>>();
</script>

<template>
  <div class="invite-card">
    <h3>Invite Team Members</h3>
    <ul>
      <li v-for="email in props.data.emails" :key="email">{{ email }}</li>
    </ul>
    <div class="actions">
      <button @click="props.onCancel">Cancel</button>
      <button @click="props.onConfirm()">Send Invites</button>
    </div>
  </div>
</template>
```

## Theme Sync

Sync the panel theme with your app's dark mode:

```vue
<script setup lang="ts">
import { usePillar } from '@pillar-ai/vue';
import { watch, ref } from 'vue';

const { setTheme } = usePillar();
const isDarkMode = ref(false); // Your app's dark mode state

watch(isDarkMode, (dark) => {
  setTheme({ mode: dark ? 'dark' : 'light' });
});
</script>
```

## Related Packages

| Package | Description |
|---------|-------------|
| [@pillar-ai/sdk](https://github.com/pillarhq/sdk) | Core vanilla JavaScript SDK |
| [@pillar-ai/react](https://github.com/pillarhq/sdk-react) | React bindings |
| [@pillar-ai/svelte](https://github.com/pillarhq/sdk-svelte) | Svelte bindings |

## Requirements

- Vue 3.3.0 or higher
- Composition API

## License

MIT
