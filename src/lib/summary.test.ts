import assert from 'node:assert/strict'
import { test } from 'node:test'
import { summarizeRun } from './summary.ts'
import type { BenchResult } from './types.ts'

function row(
  patch: Partial<BenchResult> & Pick<BenchResult, 'key' | 'endpointId' | 'slug'>,
): BenchResult {
  return {
    presetId: 'debug',
    endpointLabel: patch.endpointLabel ?? 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    status: 'ok',
    metrics: {
      ttftMs: 200,
      totalMs: 1000,
      completionTokens: 40,
      promptTokens: 10,
      decodeTokPerSec: 50,
      overallTokPerSec: 40,
      tokenSource: 'usage',
    },
    ...patch,
  }
}

test('does not blend different models on the same provider', () => {
  const groups = summarizeRun([
    row({
      key: 'a',
      endpointId: 'or',
      slug: 'fast-model',
      metrics: {
        ttftMs: 100,
        totalMs: 500,
        completionTokens: 80,
        promptTokens: 10,
        decodeTokPerSec: 200,
        overallTokPerSec: 160,
        tokenSource: 'usage',
      },
    }),
    row({
      key: 'b',
      endpointId: 'or',
      slug: 'slow-model',
      metrics: {
        ttftMs: 800,
        totalMs: 4000,
        completionTokens: 40,
        promptTokens: 10,
        decodeTokPerSec: 10,
        overallTokPerSec: 10,
        tokenSource: 'usage',
      },
    }),
  ])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].models.length, 2)
  assert.equal(groups[0].models[0].slug, 'fast-model')
  assert.equal(groups[0].models[0].decodeTokPerSec, 200)
  assert.equal(groups[0].models[1].slug, 'slow-model')
  assert.equal(groups[0].models[1].decodeTokPerSec, 10)
  assert.equal(groups[0].models[0].fastestDecode, true)
  assert.equal(groups[0].models[1].fastestDecode, false)
})

test('averages only the same model across tasks', () => {
  const groups = summarizeRun([
    row({
      key: 'd',
      endpointId: 'x',
      endpointLabel: 'xAI',
      slug: 'grok-4.3',
      presetId: 'debug',
      metrics: {
        ttftMs: 100,
        totalMs: 1000,
        completionTokens: 40,
        promptTokens: 10,
        decodeTokPerSec: 40,
        overallTokPerSec: 20,
        tokenSource: 'usage',
      },
    }),
    row({
      key: 'c',
      endpointId: 'x',
      endpointLabel: 'xAI',
      slug: 'grok-4.3',
      presetId: 'coding',
      metrics: {
        ttftMs: 300,
        totalMs: 1000,
        completionTokens: 40,
        promptTokens: 10,
        decodeTokPerSec: 60,
        overallTokPerSec: 40,
        tokenSource: 'usage',
      },
    }),
  ])
  assert.equal(groups[0].models.length, 1)
  assert.equal(groups[0].models[0].decodeTokPerSec, 50)
  assert.equal(groups[0].models[0].overallTokPerSec, 30)
  assert.equal(groups[0].models[0].ttftMs, 200)
  assert.equal(groups[0].models[0].nTasks, 2)
})

test('keeps the same slug on two providers as two rows', () => {
  const groups = summarizeRun([
    row({
      key: '1',
      endpointId: 'or',
      endpointLabel: 'OpenRouter',
      slug: 'openai/gpt-4o-mini',
      metrics: {
        ttftMs: 200,
        totalMs: 1000,
        completionTokens: 40,
        promptTokens: 10,
        decodeTokPerSec: 30,
        overallTokPerSec: 20,
        tokenSource: 'usage',
      },
    }),
    row({
      key: '2',
      endpointId: 'oa',
      endpointLabel: 'OpenAI',
      slug: 'openai/gpt-4o-mini',
      metrics: {
        ttftMs: 200,
        totalMs: 1000,
        completionTokens: 40,
        promptTokens: 10,
        decodeTokPerSec: 90,
        overallTokPerSec: 70,
        tokenSource: 'usage',
      },
    }),
  ])
  assert.equal(groups.length, 2)
  assert.equal(groups[0].endpointLabel, 'OpenAI')
  assert.equal(groups[0].models[0].decodeTokPerSec, 90)
})
