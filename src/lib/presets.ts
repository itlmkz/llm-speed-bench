import type { TestPreset } from './types'

const SAMPLE_DOC = `Project: Harbor Notes — release memo (excerpt)

Harbor Notes is a lightweight note app for field researchers. Users capture short
observations with optional location tags, then sync when back online.

Known issues from QA:
1. Offline queue can drop the last edit if the app is force-quit mid-sync.
2. Search ignores diacritics inconsistently across iOS and Android.
3. Export to Markdown duplicates headings when a note was previously exported.

Product ask: prioritize a fix that protects user data over polish. Shipping
window is two weeks. Keep the answer practical for an engineering lead.`

export const TEST_PRESETS: TestPreset[] = [
  {
    id: 'debug',
    name: 'Debug triage',
    description: 'A short bug report, followed by a likely cause and next step.',
    system:
      'You are a senior engineer. Be direct. Prefer a short structured answer.',
    user: `A React app intermittently shows a blank screen after client-side navigation.
Console: "Cannot read properties of undefined (reading 'map')".
It started after adding a new dashboard widget that reads props.data.items.
Give: likely cause, how to confirm, and the smallest safe fix.`,
    maxTokens: 400,
  },
  {
    id: 'document',
    name: 'Document analysis',
    description: 'A longer document, boiled down to decisions and risks.',
    system:
      'You analyze product/engineering documents. Extract decisions, risks, and actions.',
    user: `${SAMPLE_DOC}

Summarize:
- the top priority
- two concrete risks
- three actionable next steps for the engineering lead`,
    maxTokens: 500,
  },
  {
    id: 'coding',
    name: 'Coding task',
    description: 'A small utility to implement, with a few clear constraints.',
    system: 'You write clear TypeScript. Prefer correctness and readability.',
    user: `Write a TypeScript function \`measureDecodeTokPerSec\` that takes:
- completionTokens: number
- ttftMs: number | null
- totalMs: number
and returns tokens/sec after the first token, or null if it cannot be computed.
Include a one-line comment explaining the formula. No imports.`,
    maxTokens: 350,
  },
]

export function presetById(id: string): TestPreset | undefined {
  return TEST_PRESETS.find((p) => p.id === id)
}
