/**
 * usePillarChat Composable
 * Headless chat with streaming, image upload, and conversation management.
 * Use this to build custom chat UIs without the Pillar panel.
 */

import { ref, type Ref } from 'vue';
import {
  getApiClient,
  type ChatImage,
  type ImageUploadResponse,
  type ArticleSummary,
  type ProgressEvent,
} from '@pillar-ai/sdk';

export interface PillarChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  images?: ChatImage[];
  sources?: ArticleSummary[];
  progressEvents?: ProgressEvent[];
}

export interface UsePillarChatOptions {
  /** Resume an existing conversation by ID. */
  conversationId?: string;
  /** Called when a chat error occurs. */
  onError?: (error: Error) => void;
}

export interface UsePillarChatReturn {
  messages: Ref<PillarChatMessage[]>;
  sendMessage: (text: string, opts?: { images?: ChatImage[] }) => Promise<void>;
  isLoading: Ref<boolean>;
  error: Ref<Error | null>;
  uploadImage: (file: File) => Promise<ImageUploadResponse>;
  stop: () => void;
  reset: () => void;
  conversationId: Ref<string | null>;
}

/**
 * Composable for headless chat with the Pillar AI agent.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { usePillarChat } from '@pillar-ai/vue';
 *
 * const { messages, sendMessage, isLoading, uploadImage, stop, reset } = usePillarChat();
 *
 * async function handleSend(text: string) {
 *   await sendMessage(text);
 * }
 * </script>
 *
 * <template>
 *   <div v-for="msg in messages" :key="msg.id ?? msg.content">
 *     <strong>{{ msg.role }}:</strong> {{ msg.content }}
 *   </div>
 *   <button v-if="isLoading" @click="stop">Stop</button>
 * </template>
 * ```
 */
export function usePillarChat(options: UsePillarChatOptions = {}): UsePillarChatReturn {
  const messages = ref<PillarChatMessage[]>([]);
  const isLoading = ref(false);
  const error = ref<Error | null>(null);
  const conversationId = ref<string | null>(options.conversationId ?? null);

  let abortController: AbortController | null = null;

  async function sendMessage(text: string, opts?: { images?: ChatImage[] }): Promise<void> {
    const api = getApiClient();
    if (!api) {
      const err = new Error('Pillar SDK is not initialized');
      error.value = err;
      options.onError?.(err);
      return;
    }

    error.value = null;
    isLoading.value = true;

    const userMsg: PillarChatMessage = {
      role: 'user',
      content: text,
      images: opts?.images,
    };
    messages.value = [...messages.value, userMsg];

    const ac = new AbortController();
    abortController = ac;

    let convId = conversationId.value ?? crypto.randomUUID();
    if (!conversationId.value) {
      conversationId.value = convId;
    }

    const assistantIdx = messages.value.length;
    messages.value = [...messages.value, { role: 'assistant', content: '' }];

    try {
      const history = messages.value.slice(0, assistantIdx).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await api.chat({
        message: text,
        history,
        images: opts?.images,
        existingConversationId: convId,
        signal: ac.signal,
        onChunk: (token) => {
          const updated = [...messages.value];
          if (assistantIdx < updated.length) {
            updated[assistantIdx] = {
              ...updated[assistantIdx],
              content: updated[assistantIdx].content + token,
            };
            messages.value = updated;
          }
        },
        onProgress: (event) => {
          const updated = [...messages.value];
          if (assistantIdx < updated.length) {
            const existing = updated[assistantIdx].progressEvents ?? [];
            updated[assistantIdx] = {
              ...updated[assistantIdx],
              progressEvents: [...existing, event],
            };
            messages.value = updated;
          }
        },
        onConversationStarted: (serverConvId, assistantMessageId) => {
          if (serverConvId) {
            convId = serverConvId;
            conversationId.value = serverConvId;
          }
          if (assistantMessageId) {
            const updated = [...messages.value];
            if (assistantIdx < updated.length) {
              updated[assistantIdx] = { ...updated[assistantIdx], id: assistantMessageId };
              messages.value = updated;
            }
          }
        },
      });

      const updated = [...messages.value];
      if (assistantIdx < updated.length) {
        updated[assistantIdx] = {
          ...updated[assistantIdx],
          content: updated[assistantIdx].content || response.message,
          sources: response.sources,
          id: updated[assistantIdx].id ?? response.messageId,
        };
        messages.value = updated;
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const chatError = err instanceof Error ? err : new Error(String(err));
      error.value = chatError;
      options.onError?.(chatError);
    } finally {
      abortController = null;
      isLoading.value = false;
    }
  }

  async function uploadImage(file: File): Promise<ImageUploadResponse> {
    const api = getApiClient();
    if (!api) throw new Error('Pillar SDK is not initialized');
    return api.uploadImage(file);
  }

  function stop(): void {
    abortController?.abort();
    abortController = null;
    isLoading.value = false;
  }

  function reset(): void {
    abortController?.abort();
    abortController = null;
    messages.value = [];
    conversationId.value = null;
    isLoading.value = false;
    error.value = null;
  }

  return {
    messages,
    sendMessage,
    isLoading,
    error,
    uploadImage,
    stop,
    reset,
    conversationId,
  };
}
