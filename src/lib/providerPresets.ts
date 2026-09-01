import type { ProviderType } from './providers'

export type ProviderPreset = {
  id: string
  name: string
  baseUrl: string
  /** Explicit provider override for edge cases (e.g. x-api-key-only proxies). */
  providerOverride?: ProviderType
  /** A sensible default slug when known. */
  defaultSlug?: string
  /** Short auth note shown in the picker. */
  authNote?: string
  /** Region/notes. */
  note?: string
}

/**
 * Curated shortlist of well-known AI API providers, distilled from the
 * farion1231/cc-switch provider list. Only providers usable over plain
 * HTTP with an API key (Bearer or x-api-key) are included — OAuth-only
 * (GitHub Copilot, Codex, xAI OAuth) and AWS SigV4 providers are excluded
 * because a static browser app cannot perform those flows.
 *
 * Provider type is auto-detected from the base URL (api.anthropic.com or any
 * URL whose path contains an /anthropic segment → Anthropic Messages API;
 * otherwise OpenAI-compatible). `providerOverride` is set only for the few
 * x-api-key-only proxies whose URL doesn't contain /anthropic.
 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'anthropic',
    name: 'Anthropic (official)',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultSlug: 'claude-3-5-haiku-20241022',
    authNote: 'x-api-key',
    note: 'Native Anthropic API',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultSlug: 'openai/gpt-4o-mini',
    authNote: 'Bearer',
    note: 'OpenAI-compatible aggregator (browser CORS allowed)',
  },
  {
    id: 'zai',
    name: 'z.ai (GLM, intl)',
    baseUrl: 'https://api.z.ai/api/anthropic',
    defaultSlug: 'glm-5.3-flash',
    authNote: 'Bearer',
    note: 'Anthropic-compatible proxy',
  },
  {
    id: 'zhipu-cn',
    name: 'Zhipu GLM (CN)',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    defaultSlug: 'glm-5.1',
    authNote: 'Bearer',
    note: 'Anthropic-compatible proxy (China)',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/anthropic',
    defaultSlug: 'deepseek-v4-pro',
    authNote: 'x-api-key / Bearer',
    note: 'Anthropic-compatible proxy',
  },
  {
    id: 'kimi',
    name: 'Kimi (Moonshot)',
    baseUrl: 'https://api.moonshot.cn/anthropic',
    defaultSlug: 'kimi-k2.7-code',
    authNote: 'Bearer',
    note: 'Anthropic-compatible proxy',
  },
  {
    id: 'kimi-coding',
    name: 'Kimi For Coding',
    baseUrl: 'https://api.kimi.com/coding/',
    defaultSlug: 'kimi-for-coding',
    authNote: 'Bearer',
    note: 'Coding Plan',
  },
  {
    id: 'xai',
    name: 'xAI Grok',
    baseUrl: 'https://api.x.ai/v1',
    defaultSlug: 'grok-4.3',
    authNote: 'Bearer',
    note: 'OpenAI-compatible',
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn',
    defaultSlug: 'MiniMaxAI/MiniMax-M2.5',
    authNote: 'Bearer',
    note: 'Anthropic-compatible proxy',
  },
  {
    id: 'siliconflow-intl',
    name: 'SiliconFlow (intl)',
    baseUrl: 'https://api.siliconflow.com',
    defaultSlug: 'MiniMaxAI/MiniMax-M3',
    authNote: 'Bearer',
  },
  {
    id: 'volcengine-plan',
    name: 'Volcengine 火山 (Agent Plan)',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/plan',
    defaultSlug: 'ark-code-latest',
    authNote: 'Bearer',
    note: 'Anthropic-compatible proxy',
  },
  {
    id: 'volcengine-coding',
    name: 'Volcengine 火山 (Coding Plan)',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/coding',
    defaultSlug: 'ark-code-latest',
    authNote: 'Bearer',
  },
  {
    id: 'doubao-seed',
    name: 'DouBao Seed',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/compatible',
    defaultSlug: 'doubao-seed-2-1-pro-260628',
    authNote: 'Bearer',
  },
  {
    id: 'bailian',
    name: 'Alibaba Bailian (DashScope)',
    baseUrl: 'https://dashscope.aliyuncs.com/apps/anthropic',
    authNote: 'Bearer',
    note: 'Anthropic-compatible proxy',
  },
  {
    id: 'bailian-coding',
    name: 'Alibaba Bailian (Coding)',
    baseUrl: 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
    defaultSlug: 'qwen3.7-plus',
    authNote: 'Bearer',
  },
  {
    id: 'qwencloud-intl',
    name: 'QwenCloud (intl)',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/apps/anthropic',
    defaultSlug: 'qwen3.7-max',
    authNote: 'Bearer',
  },
  {
    id: 'tencent-plan',
    name: 'Tencent LKEAP (Token Plan)',
    baseUrl: 'https://api.lkeap.cloud.tencent.com/plan/anthropic',
    defaultSlug: 'tc-code-latest',
    authNote: 'Bearer',
  },
  {
    id: 'minimax',
    name: 'MiniMax (intl)',
    baseUrl: 'https://api.minimax.io/anthropic',
    defaultSlug: 'MiniMax-M2.7',
    authNote: 'Bearer',
  },
  {
    id: 'minimax-cn',
    name: 'MiniMax (CN)',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    defaultSlug: 'MiniMax-M2.7',
    authNote: 'Bearer',
  },
  {
    id: 'novita',
    name: 'Novita AI',
    baseUrl: 'https://api.novita.ai/anthropic',
    defaultSlug: 'zai-org/glm-5.1',
    authNote: 'Bearer',
  },
  {
    id: 'therouter',
    name: 'TheRouter',
    baseUrl: 'https://api.therouter.ai',
    defaultSlug: 'anthropic/claude-sonnet-5',
    authNote: 'Bearer',
  },
  {
    id: 'ppio',
    name: 'PPIO',
    baseUrl: 'https://api.ppio.com/anthropic',
    defaultSlug: 'deepseek/deepseek-v4-flash-0731',
    authNote: 'Bearer',
  },
  {
    id: 'longcat',
    name: 'Longcat',
    baseUrl: 'https://api.longcat.chat/anthropic',
    defaultSlug: 'LongCat-2.0',
    authNote: 'Bearer',
  },
  {
    id: 'stepfun',
    name: 'StepFun (intl)',
    baseUrl: 'https://api.stepfun.ai/step_plan',
    defaultSlug: 'step-3.5-flash-2603',
    authNote: 'Bearer',
  },
  {
    id: 'modelscope',
    name: 'ModelScope',
    baseUrl: 'https://api-inference.modelscope.cn',
    defaultSlug: 'ZhipuAI/GLM-5.2',
    authNote: 'Bearer',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com',
    defaultSlug: 'moonshotai/kimi-k2.5',
    authNote: 'Bearer',
    note: 'OpenAI-compatible',
  },
  {
    id: 'atlascloud',
    name: 'AtlasCloud',
    baseUrl: 'https://api.atlascloud.ai',
    defaultSlug: 'zai-org/glm-5.1',
    authNote: 'Bearer',
  },
  {
    id: 'qianfan-coding',
    name: 'Baidu Qianfan (Coding)',
    baseUrl: 'https://qianfan.baidubce.com/anthropic/coding',
    defaultSlug: 'qianfan-code-latest',
    authNote: 'Bearer',
  },
  {
    id: 'qianfan-token',
    name: 'Baidu Qianfan (Token Plan)',
    baseUrl: 'https://qianfan.baidubce.com/anthropic/tokenplan/personal',
    defaultSlug: 'deepseek-v4-pro',
    authNote: 'Bearer',
  },
  {
    id: 'xiaomi-mimo',
    name: 'Xiaomi MiMo',
    baseUrl: 'https://api.xiaomimimo.com/anthropic',
    defaultSlug: 'mimo-v2.5-pro',
    authNote: 'Bearer',
  },
  {
    id: 'gemini-native',
    name: 'Google Gemini (native — unsupported)',
    baseUrl: 'https://generativelanguage.googleapis.com',
    providerOverride: 'openai',
    defaultSlug: 'gemini-3.6-flash',
    authNote: 'x-api-key',
    note: 'Gemini native format is NOT supported by this bench; use OpenRouter for Gemini models',
  },
]

export function presetById(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id)
}
