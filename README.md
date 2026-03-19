# @pillar-ai/vue

Vue 3 SDK for the [Pillar](https://trypillar.com) open-source AI copilot — embed a product assistant in your Vue or Nuxt app that executes tasks, not just answers questions. [GitHub](https://github.com/pillarhq/pillar) · [Docs](https://trypillar.com/docs)

[![npm version](https://img.shields.io/npm/v/@pillar-ai/vue)](https://www.npmjs.com/package/@pillar-ai/vue)
[![npm downloads](https://img.shields.io/npm/dm/@pillar-ai/vue)](https://www.npmjs.com/package/@pillar-ai/vue)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)](https://www.typescriptlang.org/)

## What is Pillar?

Pillar is a product copilot for SaaS and web applications. Users say what they want, and Pillar uses your UI to make it happen — navigating pages, pre-filling forms, and calling your APIs.

For example, a user could ask:

> "Close the Walmart deal as won in Salesforce and notify implementation"

> "Add a weekly signups chart to my Amplitude dashboard"

> "How do I change my direct deposit in Rippling?"

Pillar understands the intent, builds a multi-step plan, and executes it client-side with the user's session.

## Features

- **Task Execution** — Navigate pages, pre-fill forms, call APIs on behalf of users
- **Vue Composables** — `usePillar` and `useHelpPanel` for idiomatic Vue integration
- **Composition API** — Built for Vue 3 Composition API
- **Nuxt Compatible** — Works with Nuxt 3 applications
- **Multi-Step Plans** — Chain actions into workflows for complex tasks
- **Type-Safe Actions** — Full TypeScript support for action definitions
- **Custom Action Cards** — Render Vue components for confirmations and data input

## Documentation

**[View Full Documentation](https://trypillar.com/docs)** | [Vue Quickstart](https://trypillar.com/docs/get-started/quickstart?framework=vue) | [API Reference](https://trypillar.com/docs/reference)

## Installation

```bash
npm install @pillar-ai/vue
# or
pnpm add @pillar-ai/vue
# or
yarn add @pillar-ai/vue
```

## Quick Start

### 1. Get your product key

Sign up at [app.trypillar.com](https://app.trypillar.com) and grab your product key from the dashboard.

### 2. Add the provider

Wrap your app with `PillarProvider` and define actions:

```vue
<script setup lang="ts">
import { PillarProvider } from '@pillar-ai/vue';
import { useRouter } from 'vue-router';

const router = useRouter();

const actions = {
  export_to_csv: {
    type: 'trigger' as const,
    label: 'Export to CSV',
    description: 'Export current data to CSV file',
  },
  go_to_settings: {
    type: 'navigate' as const,
    label: 'Open Settings',
    description: 'Navigate to settings page',
  },
};

function handleTask(task: { name: string; data: any }) {
  if (task.name === 'go_to_settings') {
    router.push('/settings');
  }
  if (task.name === 'export_to_csv') {
    downloadCSV();
  }
}
</script>

<template>
  <PillarProvider
    product-key="your-product-key"
    :actions="actions"
    :on-task="handleTask"
  >
    <MyApp />
  </PillarProvider>
</template>
```

## Defining Actions

Actions define what your co-pilot can do. When users make requests, Pillar matches intent to actions:

```typescript
const actions = {
  // Navigation actions
  go_to_billing: {
    type: 'navigate' as const,
    label: 'Open Billing',
    description: 'Navigate to billing and subscription settings',
  },

  // Trigger actions that execute code
  export_report: {
    type: 'trigger' as const,
    label: 'Export Report',
    description: 'Export the current report to PDF or CSV',
  },

  // Actions with data schemas (AI extracts parameters)
  invite_team_member: {
    type: 'trigger' as const,
    label: 'Invite Team Member',
    description: 'Send an invitation to join the team',
    dataSchema: {
      email: { type: 'string' as const, required: true },
      role: { type: 'string' as const, enum: ['admin', 'member', 'viewer'] },
    },
  },
};
```

## Composables

### usePillar

Access the SDK instance and state:

```vue
<script setup lang="ts">
import { usePillar } from '@pillar-ai/vue';

const { isReady, isPanelOpen, open, close, toggle } = usePillar();
</script>

<template>
  <div v-if="!isReady">Loading...</div>
  <button v-else @click="toggle">
    {{ isPanelOpen ? 'Close Co-pilot' : 'Open Co-pilot' }}
  </button>
</template>
```

### useHelpPanel

Control the co-pilot panel:

```vue
<script setup lang="ts">
import { useHelpPanel } from '@pillar-ai/vue';

const { open, close, toggle, isOpen, openChat } = useHelpPanel();
</script>

<template>
  <button @click="toggle">{{ isOpen ? 'Close' : 'Ask Co-pilot' }}</button>
  <button @click="openChat">Start Chat</button>
</template>
```

**Available Methods:**

| Method | Description |
|--------|-------------|
| `open(options?)` | Open the panel with optional view/article/search |
| `close()` | Close the panel |
| `toggle()` | Toggle the panel open/closed |
| `openArticle(slug)` | Open a specific article |
| `openSearch(query?)` | Open search with optional query |
| `openChat()` | Open the AI chat view |

## Components

### PillarProvider

The root provider that initializes the SDK:

```vue
<template>
  <PillarProvider
    product-key="your-product-key"
    :actions="actions"
    :on-task="handleTask"
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

### PillarPanel

For custom panel placement:

```vue
<script setup lang="ts">
import { PillarProvider, PillarPanel } from '@pillar-ai/vue';
</script>

<template>
  <PillarProvider
    product-key="your-product-key"
    :config="{ panel: { container: 'manual' } }"
  >
    <div class="layout">
      <main>Your content</main>
      <PillarPanel class="sidebar-panel" />
    </div>
  </PillarProvider>
</template>
```

## Inline UI with render

For `inline_ui` tools, use the `render` prop with `usePillarTool` to display custom Vue components in the chat. The AI agent provides data directly to the render component — no `execute` function needed:

```vue
<!-- InviteCard.vue -->
<script setup lang="ts">
import type { ToolRenderProps } from '@pillar-ai/vue';

const props = defineProps<ToolRenderProps<{ email: string; role: string }>>();
</script>

<template>
  <div class="card">
    <p>Invite {{ props.data.email }} as {{ props.data.role }}</p>
  </div>
</template>
```

Register the tool with the `render` prop:

```vue
<script setup lang="ts">
import { usePillarTool } from '@pillar-ai/vue';
import InviteCard from './InviteCard.vue';

usePillarTool({
  name: 'invite_team_member',
  description: 'Invite a new team member via email',
  type: 'inline_ui',
  inputSchema: {
    type: 'object',
    properties: {
      email: { type: 'string', description: 'Email address' },
      role: { type: 'string', enum: ['admin', 'member', 'viewer'] },
    },
    required: ['email'],
  },
  render: InviteCard,
});
</script>

<template>
  <div>Your app content</div>
</template>
```

The render component receives these props:
- `data` — data provided by the AI agent
- `onStateChange?(state, message?)` — optional loading/success/error states

## Nuxt 3 Integration

Create a client plugin for Nuxt 3:

```ts
// plugins/pillar.client.ts
export default defineNuxtPlugin(() => {
  // Pillar SDK is client-side only
});
```

Wrap your app in `app.vue`:

```vue
<script setup lang="ts">
import { PillarProvider } from '@pillar-ai/vue';

const actions = {
  navigate: {
    type: 'navigate' as const,
    label: 'Navigate',
    description: 'Navigate to a page',
  },
};
</script>

<template>
  <PillarProvider
    product-key="your-product-key"
    :actions="actions"
    :on-task="(task) => navigateTo(task.data.path)"
  >
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </PillarProvider>
</template>
```

## Theme Sync

Sync the panel theme with your app's dark mode:

```vue
<script setup lang="ts">
import { usePillar } from '@pillar-ai/vue';
import { watch, ref } from 'vue';

const { setTheme } = usePillar();
const isDarkMode = ref(false);

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
