import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyHttpError, friendlyHttpError } from './errors.ts'

test('maps geo 403 copy', () => {
  const body = 'This model is not available in your region'
  assert.equal(classifyHttpError(403, body), 'http_403_geo')
  assert.equal(
    friendlyHttpError(403, 'https://openrouter.ai/api/v1/chat/completions', body),
    'Sorry, error 403: in your location this model is not enabled.',
  )
})

test('plain 403 is not geo', () => {
  assert.equal(classifyHttpError(403, 'forbidden'), 'http_403')
})
