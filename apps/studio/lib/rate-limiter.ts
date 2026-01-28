/**
 * Rate limiter utilities for API request management.
 * Handles 429 responses, exponential backoff, and request queuing.
 */

export interface RateLimitInfo {
  limit: number
  remaining: number
  resetMs: number
}

export interface RateLimitedResponse<T> {
  data: T | null
  rateLimited: boolean
  retryAfter: number | null
  rateLimitInfo: RateLimitInfo | null
}

export interface RetryConfig {
  maxRetries: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
}

/**
 * Parse rate limit headers from response.
 */
export function parseRateLimitHeaders(headers: Headers): RateLimitInfo | null {
  const limit = headers.get('X-RateLimit-Limit')
  const remaining = headers.get('X-RateLimit-Remaining')
  const reset = headers.get('X-RateLimit-Reset')

  if (!limit || !remaining || !reset) return null

  return {
    limit: parseInt(limit, 10),
    remaining: parseInt(remaining, 10),
    resetMs: parseInt(reset, 10),
  }
}

/**
 * Calculate delay before retry based on attempt number.
 */
export function calculateRetryDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt)
  return Math.min(delay, config.maxDelayMs)
}

/**
 * Parse Retry-After header value.
 */
export function parseRetryAfter(headers: Headers): number | null {
  const retryAfter = headers.get('Retry-After')
  if (!retryAfter) return null

  const seconds = parseInt(retryAfter, 10)
  if (!isNaN(seconds)) {
    return seconds
  }

  const date = new Date(retryAfter)
  if (!isNaN(date.getTime())) {
    return date.getTime() - Date.now()
  }

  return null
}

/**
 * Sleep for specified milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Check if response is rate limited.
 */
export function isRateLimited(response: Response): boolean {
  return response.status === 429
}

/**
 * Check if remaining requests are below threshold.
 */
export function isApproachingLimit(
  rateLimitInfo: RateLimitInfo,
  threshold: number = 10
): boolean {
  return rateLimitInfo.remaining < threshold
}

/**
 * Fetch with automatic retry on rate limit.
 */
export async function fetchWithRetry<T>(
  url: string,
  options: RequestInit = {},
  config: Partial<RetryConfig> = {}
): Promise<RateLimitedResponse<T>> {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config }
  let lastResponse: Response | null = null
  let attempt = 0

  while (attempt <= retryConfig.maxRetries) {
    try {
      const response = await fetch(url, options)
      lastResponse = response

      const rateLimitInfo = parseRateLimitHeaders(response.headers)

      if (isRateLimited(response)) {
        const retryAfter = parseRetryAfter(response.headers)
        const delay = retryAfter || calculateRetryDelay(attempt, retryConfig)

        if (attempt < retryConfig.maxRetries) {
          await sleep(delay)
          attempt++
          continue
        }

        return {
          data: null,
          rateLimited: true,
          retryAfter: delay,
          rateLimitInfo,
        }
      }

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`)
      }

      const data = await response.json()

      return {
        data: data as T,
        rateLimited: false,
        retryAfter: null,
        rateLimitInfo,
      }
    } catch (error) {
      if (attempt >= retryConfig.maxRetries) {
        throw error
      }

      await sleep(calculateRetryDelay(attempt, retryConfig))
      attempt++
    }
  }

  return {
    data: null,
    rateLimited: false,
    retryAfter: null,
    rateLimitInfo: null,
  }
}

/**
 * Request queue for managing rate-limited requests.
 */
export class RequestQueue {
  private queue: Array<{
    execute: () => Promise<unknown>
    resolve: (value: unknown) => void
    reject: (reason: unknown) => void
  }> = []
  private processing = false
  private rateLimitInfo: RateLimitInfo | null = null
  private minRequestInterval: number

  constructor(requestsPerMinute: number = 120) {
    this.minRequestInterval = 60000 / requestsPerMinute
  }

  /**
   * Add request to queue.
   */
  enqueue<T>(execute: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        execute: execute as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      })

      if (!this.processing) {
        this.processQueue()
      }
    })
  }

  /**
   * Process queued requests.
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return

    this.processing = true

    while (this.queue.length > 0) {
      const request = this.queue.shift()
      if (!request) break

      try {
        if (this.rateLimitInfo && this.rateLimitInfo.remaining <= 0) {
          await sleep(this.rateLimitInfo.resetMs)
        }

        const result = await request.execute()
        request.resolve(result)
      } catch (error) {
        request.reject(error)
      }

      await sleep(this.minRequestInterval)
    }

    this.processing = false
  }

  /**
   * Update rate limit info from response.
   */
  updateRateLimitInfo(info: RateLimitInfo): void {
    this.rateLimitInfo = info
  }

  /**
   * Get current queue length.
   */
  get length(): number {
    return this.queue.length
  }

  /**
   * Clear all pending requests.
   */
  clear(): void {
    const pending = this.queue.splice(0)
    pending.forEach(({ reject }) => {
      reject(new Error('Queue cleared'))
    })
  }
}

/**
 * Throttle function calls.
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limitMs: number
): T {
  let lastCall = 0

  return ((...args: Parameters<T>) => {
    const now = Date.now()

    if (now - lastCall >= limitMs) {
      lastCall = now
      return fn(...args)
    }
  }) as T
}

/**
 * Debounce function calls.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  waitMs: number
): T {
  let timeout: NodeJS.Timeout | null = null

  return ((...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)

    timeout = setTimeout(() => {
      fn(...args)
    }, waitMs)
  }) as T
}

/**
 * Format rate limit info for display.
 */
export function formatRateLimitInfo(info: RateLimitInfo): string {
  const resetSeconds = Math.ceil(info.resetMs / 1000)

  return `${info.remaining}/${info.limit} requests remaining (resets in ${resetSeconds}s)`
}

/**
 * Calculate optimal request timing based on rate limits.
 */
export function calculateOptimalInterval(
  rateLimitInfo: RateLimitInfo,
  pendingRequests: number
): number {
  if (rateLimitInfo.remaining >= pendingRequests) {
    return 0
  }

  const requestsNeeded = pendingRequests - rateLimitInfo.remaining
  const timePerRequest = rateLimitInfo.resetMs / rateLimitInfo.limit

  return timePerRequest * requestsNeeded
}

/**
 * Check if request should be delayed based on rate limit state.
 */
export function shouldDelayRequest(
  rateLimitInfo: RateLimitInfo | null,
  safetyBuffer: number = 5
): boolean {
  if (!rateLimitInfo) return false
  return rateLimitInfo.remaining <= safetyBuffer
}

/**
 * Get delay needed before next request.
 */
export function getRequiredDelay(
  rateLimitInfo: RateLimitInfo | null,
  safetyBuffer: number = 5
): number {
  if (!rateLimitInfo) return 0
  if (rateLimitInfo.remaining > safetyBuffer) return 0
  return rateLimitInfo.resetMs
}
