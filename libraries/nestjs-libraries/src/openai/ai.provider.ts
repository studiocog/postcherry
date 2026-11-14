import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { ChatOpenAI } from '@langchain/openai';
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import {
  BaseMessageLike,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { Runnable, RunnableLambda } from '@langchain/core/runnables';

// Every provider here serves an OpenAI compatible chat completions endpoint,
// so the text features run on any of them with the clients we already have.
// AI images always stay on OpenAI (OPENAI_API_KEY).
const providers = {
  openai: { key: 'OPENAI_API_KEY', baseURL: '', model: 'gpt-4.1' },
  anthropic: {
    key: 'ANTHROPIC_API_KEY',
    baseURL: 'https://api.anthropic.com/v1/',
    model: 'claude-sonnet-5-5',
  },
  deepseek: {
    key: 'DEEPSEEK_API_KEY',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-flash',
  },
  openrouter: {
    key: 'OPENROUTER_API_KEY',
    baseURL: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4.1',
  },
  gemini: {
    key: 'GEMINI_API_KEY',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-3.8-flash',
  },
  groq: {
    key: 'GROQ_API_KEY',
    baseURL: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
  },
  mistral: {
    key: 'MISTRAL_API_KEY',
    baseURL: 'https://api.mistral.ai/v1',
    model: 'mistral-large-latest',
  },
  xai: {
    key: 'XAI_API_KEY',
    baseURL: 'https://api.x.ai/v1',
    model: 'grok-4.7',
  },
  // any other OpenAI compatible endpoint, set AI_BASE_URL, AI_API_KEY and AI_MODEL
  custom: { key: 'AI_API_KEY', baseURL: '', model: 'gpt-4.1' },
};

export type AiProvider = keyof typeof providers;

export const aiProvider = (): AiProvider => {
  const provider = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  return Object.keys(providers).includes(provider)
    ? (provider as AiProvider)
    : 'openai';
};

// OpenAI itself, the only provider with json_schema response formats, n > 1
// and the Responses API everywhere we use them
export const isOpenAiProvider = () => aiProvider() === 'openai';

export const aiApiKey = () =>
  process.env.AI_API_KEY || process.env[providers[aiProvider()].key] || '';

// undefined keeps the OpenAI SDK default (and its OPENAI_BASE_URL)
export const aiBaseUrl = () =>
  process.env.AI_BASE_URL || providers[aiProvider()].baseURL || undefined;

// The model of the text features, the default of OpenAI can differ per feature
export const aiModel = (openAiModel = providers.openai.model) =>
  process.env.AI_MODEL ||
  (isOpenAiProvider() ? openAiModel : providers[aiProvider()].model);

// Claude models reject any temperature below 1, they keep their default
export const aiTemperature = (temperature: number) =>
  aiProvider() === 'anthropic' ? undefined : temperature;

export const aiEnabled = () => !!aiApiKey();

// The OpenAI key of the images, whatever the text provider is
export const openAiImagesKey = () =>
  process.env.OPENAI_API_KEY ||
  (isOpenAiProvider() && !process.env.AI_BASE_URL
    ? process.env.AI_API_KEY || ''
    : '');

// Higgsfield (docs.higgsfield.ai) can generate the AI images instead of OpenAI
const higgsfieldKey = () =>
  process.env.HIGGSFIELD_API_KEY_ID && process.env.HIGGSFIELD_API_KEY_SECRET
    ? `${process.env.HIGGSFIELD_API_KEY_ID}:${process.env.HIGGSFIELD_API_KEY_SECRET}`
    : '';

// AI_IMAGE_PROVIDER picks one when both have keys, otherwise the one with a key
export const aiImageProvider = (): 'openai' | 'higgsfield' => {
  const chosen = (process.env.AI_IMAGE_PROVIDER || '').trim().toLowerCase();
  if (chosen === 'higgsfield' && higgsfieldKey()) {
    return 'higgsfield';
  }
  if (chosen === 'openai') {
    return 'openai';
  }
  return !openAiImagesKey() && higgsfieldKey() ? 'higgsfield' : 'openai';
};

export const aiImagesEnabled = () =>
  aiImageProvider() === 'higgsfield' || !!openAiImagesKey();

const higgsfieldDone = ['completed', 'failed', 'nsfw', 'canceled'];

// Submits the image and polls the request until it is done, returns the image URL
export const higgsfieldImage = async (prompt: string, isVertical = false) => {
  const model =
    process.env.HIGGSFIELD_IMAGE_MODEL || 'higgsfield-ai/soul/v2/standard';
  const headers = {
    Authorization: `Key ${higgsfieldKey()}`,
    'Content-Type': 'application/json',
  };

  const submitted = await (
    await fetch(`https://api.higgsfield.ai/${model}`, {
      method: 'POST',
      headers: { ...headers, 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({
        prompt,
        aspect_ratio: isVertical ? '2:3' : '1:1',
        // the SOUL models default to 720p
        ...(model.includes('/soul/') ? { resolution: '1080p' } : {}),
      }),
    })
  ).json();

  if (!submitted?.status_url) {
    throw new Error(
      `Higgsfield image request failed: ${JSON.stringify(submitted).slice(0, 300)}`
    );
  }

  for (let i = 0; i < 90; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const request = await (
      await fetch(submitted.status_url, { headers })
    ).json();
    if (!higgsfieldDone.includes(request?.status)) {
      continue;
    }
    if (request.status === 'completed' && request.images?.[0]?.url) {
      return request.images[0].url as string;
    }
    throw new Error(`Higgsfield image ${request.status}`);
  }

  throw new Error('Higgsfield image timed out');
};

export const createAiClient = () =>
  new OpenAI({
    apiKey: aiApiKey() || 'sk-proj-',
    baseURL: aiBaseUrl(),
  });

// AI SDK model (Mastra, CopilotKit). Its default is the Responses API that
// only OpenAI serves, the other providers use chat completions
export const aiLanguageModel = (
  openAiModel?: string
): ReturnType<OpenAIProvider['chat']> => {
  const provider = createOpenAI({
    apiKey: aiApiKey() || undefined,
    baseURL: aiBaseUrl(),
  });

  return isOpenAiProvider()
    ? provider(aiModel(openAiModel))
    : provider.chat(aiModel(openAiModel));
};

const jsonInstructions = (schema: z.ZodTypeAny, name: string) =>
  `Answer only with a JSON object, without markdown, that follows this JSON schema:\n${JSON.stringify(
    zodResponseFormat(schema, name).json_schema.schema
  )}`;

// The other providers get the schema in the prompt (json_schema and forced
// tool calls are not supported everywhere) and the answer is checked by zod
export const parseAiJson = <T extends z.ZodTypeAny>(
  schema: T,
  content?: string | null
): z.infer<T> => {
  const text = content || '';
  return schema.parse(
    JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
  );
};

export const aiJsonSystemPrompt = (
  system: string,
  schema: z.ZodTypeAny,
  name: string
) => `${system}\n\n${jsonInstructions(schema, name)}`;

// LangChain withStructuredOutput, with the same fallback for the other providers
export const aiStructuredOutput = <T extends z.ZodTypeAny>(
  model: ChatOpenAI,
  schema: T,
  name = 'output'
): Runnable<BaseLanguageModelInput, z.infer<T>> => {
  if (isOpenAiProvider()) {
    return model.withStructuredOutput(schema) as Runnable<
      BaseLanguageModelInput,
      z.infer<T>
    >;
  }

  return RunnableLambda.from(async (input: BaseLanguageModelInput) => {
    const messages: BaseMessageLike[] =
      typeof input === 'string'
        ? [new HumanMessage(input)]
        : Array.isArray(input)
        ? input
        : input.toChatMessages();

    const response = await model.invoke([
      new SystemMessage(jsonInstructions(schema, name)),
      ...messages,
    ]);

    return parseAiJson(
      schema,
      typeof response.content === 'string'
        ? response.content
        : response.content
            .map((part) => ('text' in part ? part.text : ''))
            .join('')
    );
  });
};
