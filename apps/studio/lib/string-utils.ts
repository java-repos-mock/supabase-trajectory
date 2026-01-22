/**
 * String manipulation utilities for the Studio dashboard.
 */

import { normalizeString, stringsEqual, truncate, slugify, byteLength } from './encoding-utils'

/**
 * Capitalize the first letter of a string.
 */
export function capitalize(str: string): string {
  if (!str) return str
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Convert a string to title case.
 */
export function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => capitalize(word))
    .join(' ')
}

/**
 * Convert camelCase to kebab-case.
 */
export function camelToKebab(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
}

/**
 * Convert kebab-case to camelCase.
 */
export function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

/**
 * Convert snake_case to camelCase.
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

/**
 * Convert camelCase to snake_case.
 */
export function camelToSnake(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
}

/**
 * Check if a string is empty or whitespace only.
 */
export function isBlank(str: string | null | undefined): boolean {
  return !str || str.trim().length === 0
}

/**
 * Check if a string is not empty and not whitespace only.
 */
export function isNotBlank(str: string | null | undefined): boolean {
  return !isBlank(str)
}

/**
 * Pad a string on the left to reach a target length.
 */
export function padLeft(str: string, length: number, char: string = ' '): string {
  while (str.length < length) {
    str = char + str
  }
  return str
}

/**
 * Pad a string on the right to reach a target length.
 */
export function padRight(str: string, length: number, char: string = ' '): string {
  while (str.length < length) {
    str = str + char
  }
  return str
}

/**
 * Remove all whitespace from a string.
 */
export function removeWhitespace(str: string): string {
  return str.replace(/\s+/g, '')
}

/**
 * Collapse multiple whitespace characters into single spaces.
 */
export function collapseWhitespace(str: string): string {
  return str.replace(/\s+/g, ' ').trim()
}

/**
 * Escape HTML special characters.
 */
export function escapeHtml(str: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return str.replace(/[&<>"']/g, char => entities[char])
}

/**
 * Unescape HTML entities.
 */
export function unescapeHtml(str: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
  }
  return str.replace(/&(amp|lt|gt|quot|#39);/g, match => entities[match])
}

/**
 * Extract initials from a name.
 */
export function getInitials(name: string, maxLength: number = 2): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase())
    .slice(0, maxLength)
    .join('')
}

/**
 * Format a number as a compact string (e.g., 1.2K, 3.4M).
 */
export function formatCompact(num: number): string {
  const absNum = Math.abs(num)
  const sign = num < 0 ? '-' : ''
  
  if (absNum >= 1e9) {
    return sign + (absNum / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'
  }
  if (absNum >= 1e6) {
    return sign + (absNum / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
  }
  if (absNum >= 1e3) {
    return sign + (absNum / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
  }
  return String(num)
}

/**
 * Pluralize a word based on count.
 */
export function pluralize(word: string, count: number, plural?: string): string {
  if (count === 1) {
    return word
  }
  return plural || word + 's'
}

/**
 * Format a count with its pluralized label.
 */
export function formatCount(count: number, singular: string, plural?: string): string {
  return `${count} ${pluralize(singular, count, plural)}`
}

/**
 * Highlight search terms in text by wrapping them in a tag.
 */
export function highlightSearchTerms(
  text: string,
  searchTerms: string[],
  wrapStart: string = '<mark>',
  wrapEnd: string = '</mark>'
): string {
  if (!searchTerms.length) return text
  
  const pattern = searchTerms
    .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  
  const regex = new RegExp(`(${pattern})`, 'gi')
  return text.replace(regex, `${wrapStart}$1${wrapEnd}`)
}

/**
 * Check if a string contains another string (case-insensitive).
 */
export function containsIgnoreCase(str: string, search: string): boolean {
  return normalizeString(str).includes(normalizeString(search))
}

/**
 * Check if a string starts with another string (case-insensitive).
 */
export function startsWithIgnoreCase(str: string, search: string): boolean {
  return normalizeString(str).startsWith(normalizeString(search))
}

/**
 * Check if a string ends with another string (case-insensitive).
 */
export function endsWithIgnoreCase(str: string, search: string): boolean {
  return normalizeString(str).endsWith(normalizeString(search))
}

// Re-export commonly used functions from encoding-utils
export { normalizeString, stringsEqual, truncate, slugify, byteLength }
