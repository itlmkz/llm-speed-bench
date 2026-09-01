import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  headerLooksSecret,
  payloadLooksDangerous,
  redactHeaders,
  redactUrl,
  sanitizeLogEntry,
} from './sanitize.ts'

test('redacts x-api-key and Authorization with no leftover characters', () => {
  const out = redactHeaders({
    Authorization: 'Bearer sk-or-v1-abcdefghijklmnopqrstuvwxyz',
    'x-api-key': 'sk-ant-api03-super-secret-value',
    'Content-Type': 'application/json',
  })
  assert.equal(out.Authorization, '[redacted]')
  assert.equal(out['x-api-key'], '[redacted]')
  assert.equal(out['Content-Type'], 'application/json')
  assert.ok(!JSON.stringify(out).includes('sk-'))
  assert.ok(!JSON.stringify(out).includes('Bearer sk'))
})

test('headerLooksSecret catches api-key variants', () => {
  assert.equal(headerLooksSecret('x-api-key'), true)
  assert.equal(headerLooksSecret('X-API-KEY'), true)
  assert.equal(headerLooksSecret('api-key'), true)
  assert.equal(headerLooksSecret('anthropic-version'), false)
})

test('strips credentials from URLs', () => {
  assert.equal(
    redactUrl('https://user:secret@api.example.com/v1/messages?api_key=abc'),
    'https://api.example.com/v1/messages',
  )
})

test('sanitizeLogEntry strips keys from the JSON dump shape', () => {
  const safe = sanitizeLogEntry({
    id: '1',
    ts: '2026-01-01T00:00:00.000Z',
    level: 'error',
    label: 'test',
    scenario: 'debug',
    endpointLabel: 'z.ai',
    baseUrl: 'https://api.z.ai/api/anthropic',
    slug: 'glm-4.5',
    request: {
      method: 'POST',
      url: 'https://api.z.ai/api/anthropic/v1/messages',
      headers: { 'x-api-key': 'sk-ant-leaked', Authorization: 'Bearer sk-leaked' },
      body: { model: 'glm-4.5', apiKey: 'sk-should-go' },
    },
    response: {
      status: 403,
      statusText: 'Forbidden',
      headers: { 'set-cookie': 'session=abc' },
      body: 'Bearer sk-or-v1-should-not-survive',
    },
    error: 'key sk-ant-api03-xxxxx failed',
  })
  const dumped = JSON.stringify(safe)
  assert.ok(!dumped.includes('sk-ant-leaked'))
  assert.ok(!dumped.includes('sk-leaked'))
  assert.ok(!dumped.includes('sk-should-go'))
  assert.ok(!dumped.includes('sk-or-v1-should-not-survive'))
  assert.ok(!dumped.includes('sk-ant-api03-xxxxx'))
  assert.equal(safe.request.headers['x-api-key'], '[redacted]')
})

test('payloadLooksDangerous rejects ingest bodies that still contain keys', () => {
  assert.equal(
    payloadLooksDangerous(JSON.stringify({ modelSlug: 'x', authorization: 'Bearer abc' })),
    true,
  )
  assert.equal(
    payloadLooksDangerous(JSON.stringify({ modelSlug: 'grok-4.3', decodeTokPerSec: 40 })),
    false,
  )
})
