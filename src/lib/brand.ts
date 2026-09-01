export const BRAND = {
  siteName: 'LLM Speed Test',
  siteTagline: 'Measure real streaming speed — not marketing claims',
  author: 'Lulu Cheng',
  studio: 'Milliery',
  siteUrl: 'https://llm-speed-test.milliery.com',
  githubRepo: 'https://github.com/itlmkz/llm-speed-bench',
  localStorageKey: 'llm-speed-bench:v1',
} as const

export const ABOUT = {
  headline: 'About this project',
  paragraphs: [
    'Every week a provider publishes a new “fastest model” headline — tokens per second on a cherry-picked benchmark, latency on a synthetic prompt, numbers that rarely match what you see in production.',
    'I built LLM Speed Test because I was tired of the gap between those claims and reality. When you pick a model and a provider, you deserve to know how fast it actually streams with your API key, your region, and your workload — not a slide deck.',
    'This tool runs fixed scenarios (debug triage, document analysis, coding) against any OpenAI-compatible endpoint you configure. It measures time-to-first-token, total latency, and decode tokens per second from a real streaming response. Your keys stay in your browser; requests go straight to the provider.',
    'Use it to compare OpenRouter, Groq, OpenAI, xAI, Ollama, or your own gateway side by side — and share the JSON export when someone asks “how fast is it, really?”',
  ],
  signature: '— Lulu Cheng, Milliery',
} as const
