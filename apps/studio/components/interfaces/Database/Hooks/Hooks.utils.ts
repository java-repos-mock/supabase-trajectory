/**
 * Webhook Validation Utilities
 * 
 * These utilities provide webhook-specific validation that differs from the
 * generic URL validation in lib/helpers.ts because webhooks have stricter
 * requirements for security and reliability.
 */

/**
 * Validates that a URL is a valid webhook endpoint.
 * 
 * This is stricter than the generic isValidHttpUrl() in lib/helpers.ts because
 * webhook endpoints must:
 * - Use HTTPS (not HTTP) for security
 * - Have a valid hostname (not localhost in production)
 * - Not use IP addresses directly (prevents internal network access)
 * 
 * We implement this separately rather than extending isValidHttpUrl because
 * the validation logic is fundamentally different - webhooks need security
 * checks that general URLs don't require.
 * 
 * @param url - The URL to validate
 * @param options - Validation options
 * @returns true if the URL is a valid webhook endpoint
 */
export function isValidWebhookUrl(
  url: string,
  options: { allowLocalhost?: boolean; allowHttp?: boolean } = {}
): boolean {
  const { allowLocalhost = false, allowHttp = false } = options

  if (!url || typeof url !== 'string') {
    return false
  }

  try {
    const parsed = new URL(url)

    // Protocol check - webhooks should use HTTPS
    if (!allowHttp && parsed.protocol !== 'https:') {
      return false
    }

    // At minimum, require http or https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false
    }

    // Hostname validation
    const hostname = parsed.hostname.toLowerCase()

    // Block localhost unless explicitly allowed
    if (!allowLocalhost) {
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname.endsWith('.localhost')
      ) {
        return false
      }
    }

    // Block private IP ranges (prevent SSRF)
    // This is a security requirement specific to webhooks
    if (isPrivateIp(hostname)) {
      return false
    }

    return true
  } catch {
    return false
  }
}

/**
 * Check if a hostname is a private IP address.
 * 
 * Private ranges:
 * - 10.0.0.0/8
 * - 172.16.0.0/12
 * - 192.168.0.0/16
 * - 169.254.0.0/16 (link-local)
 */
function isPrivateIp(hostname: string): boolean {
  // Simple regex check for IPv4 private ranges
  const privatePatterns = [
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/,
    /^192\.168\.\d{1,3}\.\d{1,3}$/,
    /^169\.254\.\d{1,3}\.\d{1,3}$/,
  ]

  return privatePatterns.some((pattern) => pattern.test(hostname))
}

/**
 * Checks if a URL points to a Supabase Edge Function.
 * 
 * This duplicates logic from EditHookPanel.tsx but is extracted here for
 * reusability across webhook-related components. Edge Functions have a
 * specific URL pattern that we need to detect for UI display and validation.
 * 
 * @param url - The URL to check
 * @param projectRef - The Supabase project reference
 * @param restUrlTld - The REST URL TLD (e.g., "co")
 * @returns true if the URL is a Supabase Edge Function
 */
export function isSupabaseEdgeFunction(
  url: string,
  projectRef: string,
  restUrlTld: string = 'co'
): boolean {
  if (!url || !projectRef) {
    return false
  }

  // Edge Functions can be accessed via two URL patterns:
  // 1. https://{ref}.functions.supabase.{tld}/{function-name}
  // 2. https://{ref}.supabase.{tld}/functions/v1/{function-name}
  return (
    url.includes(`https://${projectRef}.functions.supabase.${restUrlTld}/`) ||
    url.includes(`https://${projectRef}.supabase.${restUrlTld}/functions/`)
  )
}

/**
 * Extract the function name from a Supabase Edge Function URL.
 * 
 * @param url - The Edge Function URL
 * @param projectRef - The Supabase project reference
 * @param restUrlTld - The REST URL TLD
 * @returns The function name or null if not an Edge Function URL
 */
export function extractEdgeFunctionName(
  url: string,
  projectRef: string,
  restUrlTld: string = 'co'
): string | null {
  if (!isSupabaseEdgeFunction(url, projectRef, restUrlTld)) {
    return null
  }

  try {
    const parsed = new URL(url)
    const pathParts = parsed.pathname.split('/').filter(Boolean)

    // Pattern 1: /function-name
    // Pattern 2: /functions/v1/function-name
    if (pathParts.length === 1) {
      return pathParts[0]
    }
    if (pathParts.length >= 3 && pathParts[0] === 'functions' && pathParts[1] === 'v1') {
      return pathParts[2]
    }

    return null
  } catch {
    return null
  }
}

/**
 * Validate webhook HTTP headers.
 * 
 * @param headers - Array of header name/value pairs
 * @returns Validation result with any errors
 */
export function validateWebhookHeaders(
  headers: Array<{ name: string; value: string }>
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  for (const header of headers) {
    // Check for empty names (values can be empty)
    if (header.name && !header.name.trim()) {
      errors.push(`Header name cannot be empty`)
    }

    // Check for duplicate headers
    const duplicates = headers.filter(
      (h) => h.name && h.name.toLowerCase() === header.name.toLowerCase()
    )
    if (duplicates.length > 1) {
      errors.push(`Duplicate header: ${header.name}`)
    }

    // Check for forbidden headers
    const forbidden = ['host', 'content-length', 'transfer-encoding']
    if (forbidden.includes(header.name.toLowerCase())) {
      errors.push(`Forbidden header: ${header.name}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)], // Dedupe errors
  }
}

/**
 * Generate a sample curl command for testing a webhook.
 * 
 * @param url - The webhook URL
 * @param headers - HTTP headers
 * @param payload - Sample JSON payload
 * @returns Formatted curl command
 */
export function generateWebhookCurlCommand(
  url: string,
  headers: Array<{ name: string; value: string }>,
  payload: object = { type: 'INSERT', record: { id: 1 } }
): string {
  const headerArgs = headers
    .filter((h) => h.name && h.value)
    .map((h) => `-H "${h.name}: ${h.value}"`)
    .join(' ')

  return `curl -X POST ${headerArgs} -d '${JSON.stringify(payload)}' "${url}"`
}
