export const BRAND = {
  siteName: 'LLM Speed Test',
  siteTagline: 'How fast does it really stream? Don’t trust the headline — measure it.',
  author: 'Manuel Milliery',
  studio: 'Milliery',
  siteUrl: 'https://llm-speed-test.milliery.com',
  githubRepo: 'https://github.com/itlmkz/llm-speed-bench',
  localStorageKey: 'llm-speed-bench:v1',
} as const

export const ABOUT = {
  headline: 'About this project',
  paragraphs: [
    'Every week someone announces the “fastest model yet.” Tokens per second on a benchmark nobody actually runs, latency on a prompt nobody uses. The numbers almost never match what you see when you ship.',
    'I got tired of guessing. So I built this: paste your key, point it at any OpenAI-compatible or Anthropic endpoint, and watch the real stream. Time to first token, total time, tokens per second. Your numbers, your region, your workload.',
    'It runs three fixed scenarios — a bug triage, a doc summary, a small coding task — so you can compare models fairly. Keys stay in your browser, and requests go straight to the provider. This site doesn’t receive your data.',
    'Compare OpenRouter, Groq, OpenAI, xAI, Ollama, or your own gateway side by side. Export the JSON and send it to whoever asked “but how fast is it, really?”',
  ],
  signature: '— Manuel Milliery, Milliery',
} as const
