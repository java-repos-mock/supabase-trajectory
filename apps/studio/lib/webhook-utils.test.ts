import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  WebhookEvent,
  WebhookConfig,
  WebhookResponse,
  isValidWebhookUrl,
  validateWebhookConfig,
  transformWebhookResponse,
  transformToRequest,
  generateWebhookSecret,
  formatWebhookEvent,
  getEventsByCategory,
  calculateSuccessRate,
} from './webhook-utils'

describe('webhook-utils', () => {
  describe('isValidWebhookUrl', () => {
    it('accepts valid https URLs', () => {
      expect(isValidWebhookUrl('https://example.com/webhook')).toBe(true)
      expect(isValidWebhookUrl('https://api.example.com/v1/hooks')).toBe(true)
    })

    it('accepts valid http URLs', () => {
      // Note: These pass validation but will fail at API level (backend requires https)
      expect(isValidWebhookUrl('http://localhost:3000/webhook')).toBe(true)
      expect(isValidWebhookUrl('http://internal.example.com/hook')).toBe(true)
    })

    it('rejects invalid URLs', () => {
      expect(isValidWebhookUrl('')).toBe(false)
      expect(isValidWebhookUrl('not-a-url')).toBe(false)
      expect(isValidWebhookUrl('ftp://example.com')).toBe(false)
    })
  })

  describe('validateWebhookConfig', () => {
    const validConfig: WebhookConfig = {
      name: 'Test Webhook',
      url: 'https://example.com/webhook',
      events: [WebhookEvent.INSERT],
      enabled: true,
    }

    it('validates correct config', () => {
      const result = validateWebhookConfig(validConfig)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('requires name', () => {
      const result = validateWebhookConfig({ ...validConfig, name: '' })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Name is required')
    })

    it('requires url', () => {
      const result = validateWebhookConfig({ ...validConfig, url: '' })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('URL is required')
    })

    it('requires at least one event', () => {
      const result = validateWebhookConfig({ ...validConfig, events: [] })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('At least one event must be selected')
    })

    it('validates retry config', () => {
      const result = validateWebhookConfig({
        ...validConfig,
        retryConfig: { maxRetries: 15, retryDelayMs: 100 },
      })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Max retries must be between 0 and 10')
      expect(result.errors).toContain('Retry delay must be between 1000ms and 60000ms')
    })
  })

  describe('transformWebhookResponse', () => {
    const apiResponse: WebhookResponse = {
      id: 'wh_123',
      name: 'Test Webhook',
      endpoint: 'https://example.com/webhook',  // API uses 'endpoint'
      events: [WebhookEvent.INSERT, WebhookEvent.UPDATE],
      enabled: true,
      headers: { 'X-Custom': 'value' },
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-15T12:00:00Z',
      last_triggered_at: '2024-01-15T11:30:00Z',
      trigger_count: 42,
    }

    it('transforms response to internal format', () => {
      const webhook = transformWebhookResponse(apiResponse)
      
      expect(webhook.id).toBe('wh_123')
      expect(webhook.name).toBe('Test Webhook')
      expect(webhook.url).toBe('https://example.com/webhook')  // Mapped from 'endpoint'
      expect(webhook.events).toEqual([WebhookEvent.INSERT, WebhookEvent.UPDATE])
      expect(webhook.enabled).toBe(true)
      expect(webhook.triggerCount).toBe(42)
    })

    it('converts date strings to Date objects', () => {
      const webhook = transformWebhookResponse(apiResponse)
      
      expect(webhook.createdAt).toBeInstanceOf(Date)
      expect(webhook.updatedAt).toBeInstanceOf(Date)
      expect(webhook.lastTriggeredAt).toBeInstanceOf(Date)
    })

    it('handles null last_triggered_at', () => {
      const response = { ...apiResponse, last_triggered_at: null }
      const webhook = transformWebhookResponse(response)
      
      expect(webhook.lastTriggeredAt).toBeNull()
    })
  })

  describe('transformToRequest', () => {
    it('transforms webhook to request format', () => {
      const webhook = {
        name: 'Test',
        url: 'https://example.com',
        events: [WebhookEvent.INSERT],
        enabled: true,
      }
      
      const request = transformToRequest(webhook)
      
      expect(request.name).toBe('Test')
      expect(request.url).toBe('https://example.com')  // Uses 'url', not 'endpoint'
    })
  })

  describe('generateWebhookSecret', () => {
    it('generates secret with correct prefix', () => {
      const secret = generateWebhookSecret()
      expect(secret.startsWith('whsec_')).toBe(true)
    })

    it('generates unique secrets', () => {
      const secrets = new Set<string>()
      for (let i = 0; i < 100; i++) {
        secrets.add(generateWebhookSecret())
      }
      expect(secrets.size).toBe(100)
    })
  })

  describe('formatWebhookEvent', () => {
    it('formats database events', () => {
      expect(formatWebhookEvent(WebhookEvent.INSERT)).toBe('Row Inserted')
      expect(formatWebhookEvent(WebhookEvent.UPDATE)).toBe('Row Updated')
      expect(formatWebhookEvent(WebhookEvent.DELETE)).toBe('Row Deleted')
    })

    it('formats auth events', () => {
      expect(formatWebhookEvent(WebhookEvent.AUTH_USER_CREATED)).toBe('User Created')
    })

    it('formats storage events', () => {
      expect(formatWebhookEvent(WebhookEvent.STORAGE_OBJECT_CREATED)).toBe('Object Uploaded')
    })
  })

  describe('getEventsByCategory', () => {
    it('returns all categories', () => {
      const categories = getEventsByCategory()
      
      expect(categories).toHaveProperty('Database')
      expect(categories).toHaveProperty('Authentication')
      expect(categories).toHaveProperty('Storage')
      expect(categories).toHaveProperty('Functions')
    })

    it('includes correct events in each category', () => {
      const categories = getEventsByCategory()
      
      expect(categories.Database).toContain(WebhookEvent.INSERT)
      expect(categories.Authentication).toContain(WebhookEvent.AUTH_USER_CREATED)
      expect(categories.Storage).toContain(WebhookEvent.STORAGE_OBJECT_CREATED)
      expect(categories.Functions).toContain(WebhookEvent.FUNCTION_INVOKED)
    })
  })

  describe('calculateSuccessRate', () => {
    it('calculates correct rate', () => {
      const deliveries = [
        { success: true },
        { success: true },
        { success: false },
        { success: true },
      ]
      
      expect(calculateSuccessRate(deliveries)).toBe(75)
    })

    it('returns 0 for empty array', () => {
      expect(calculateSuccessRate([])).toBe(0)
    })

    it('returns 100 for all successful', () => {
      const deliveries = [{ success: true }, { success: true }]
      expect(calculateSuccessRate(deliveries)).toBe(100)
    })

    it('returns 0 for all failed', () => {
      const deliveries = [{ success: false }, { success: false }]
      expect(calculateSuccessRate(deliveries)).toBe(0)
    })
  })
})
