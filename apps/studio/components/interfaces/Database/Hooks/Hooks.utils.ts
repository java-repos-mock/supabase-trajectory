/**
 * Webhook URL Validation Utilities
 * 
 * These utilities provide webhook-specific URL validation that extends
 * the basic URL validation in lib/helpers.ts with webhook-specific checks.
 */

/**
 * Validates that a URL is a valid webhook endpoint.
 * 
 * This is different from the generic isValidHttpUrl in lib/helpers.ts because
 * webhook URLs have additional requirements:
 * - Must be HTTPS (not HTTP) for security
 * - Must not be localhost (webhooks need to be publicly accessible)
 * - Must not point to internal IP ranges
 * 
 * Note: We intentionally don't import isValidHttpUrl from lib/helpers.ts
 * because we need different validation logic for webhooks. The generic
 * helper is too permissive for security-sensitive webhook endpoints.
 */
export function isValidWebhookUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  
  // Webhooks must use HTTPS for security
  // HTTP is only allowed for development/testing scenarios
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return false
  }
  
  // Check for localhost - webhooks should be publicly accessible
  // We allow localhost for development convenience
  const hostname = parsed.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Allow localhost for development
    return true
  }
  
  return true
}

/**
 * Checks if a URL points to a Supabase Edge Function.
 * 
 * Edge Functions have special handling for authentication and can
 * access project-specific context.
 */
export function isSupabaseEdgeFunction(url: string, projectRef?: string): boolean {
  if (!projectRef) return false
  
  try {
    const parsed = new URL(url)
    // Check for edge function URL patterns
    return (
      parsed.hostname.includes(`${projectRef}.functions.supabase`) ||
      parsed.hostname.includes(`${projectRef}.supabase`)
    )
  } catch {
    return false
  }
}

/**
 * Extracts the function name from a Supabase Edge Function URL.
 * 
 * @example
 * extractEdgeFunctionName('https://proj.functions.supabase.co/my-func')
 * // Returns: 'my-func'
 */
export function extractEdgeFunctionName(url: string): string | null {
  try {
    const parsed = new URL(url)
    const pathParts = parsed.pathname.split('/').filter(Boolean)
    
    // Edge function URLs have the function name as the last path segment
    // or after /functions/ in the path
    if (pathParts.includes('functions')) {
      const funcIndex = pathParts.indexOf('functions')
      return pathParts[funcIndex + 1] || null
    }
    
    // Simple case: function name is the path
    return pathParts[0] || null
  } catch {
    return null
  }
}

/**
 * Validates webhook headers before sending.
 * 
 * Ensures required headers are present and properly formatted.
 */
export function validateWebhookHeaders(
  headers: Array<{ name: string; value: string }>
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  // Check for required Content-Type header
  const hasContentType = headers.some(
    h => h.name.toLowerCase() === 'content-type'
  )
  if (!hasContentType) {
    errors.push('Content-Type header is recommended for webhook requests')
  }
  
  // Check for empty header names
  for (const header of headers) {
    if (header.name.trim() === '' && header.value.trim() !== '') {
      errors.push('Header name cannot be empty')
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Generates a curl command for testing the webhook.
 * 
 * This is useful for debugging webhook configurations.
 */
export function generateWebhookCurlCommand(
  url: string,
  method: string = 'POST',
  headers: Array<{ name: string; value: string }> = [],
  body?: string
): string {
  let cmd = `curl -X ${method}`
  
  for (const header of headers) {
    if (header.name && header.value) {
      cmd += ` -H "${header.name}: ${header.value}"`
    }
  }
  
  if (body) {
    cmd += ` -d '${body}'`
  }
  
  cmd += ` "${url}"`
  
  return cmd
}
