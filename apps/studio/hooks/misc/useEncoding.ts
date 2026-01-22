import { useCallback, useMemo } from 'react'
import {
  encodeForUrl,
  decodeFromUrl,
  toQueryString,
  fromQueryString,
  slugify,
  truncate,
  normalizeString,
  stringsEqual,
} from 'lib/encoding-utils'

export interface UseEncodingReturn {
  encodeState: (state: Record<string, unknown>) => string
  decodeState: (encoded: string) => Record<string, unknown> | null
  buildQueryString: (params: Record<string, unknown>) => string
  parseQueryString: (query: string) => Record<string, string | string[]>
  createSlug: (text: string) => string
  truncateText: (text: string, maxLength: number) => string
  compareStrings: (a: string, b: string) => boolean
  normalize: (str: string) => string
}

/**
 * Hook for encoding and string manipulation utilities.
 */
export function useEncoding(): UseEncodingReturn {
  const encodeState = useCallback((state: Record<string, unknown>): string => {
    return encodeForUrl(state)
  }, [])

  const decodeState = useCallback((encoded: string): Record<string, unknown> | null => {
    const result = decodeFromUrl(encoded)
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return result as Record<string, unknown>
    }
    return null
  }, [])

  const buildQueryString = useCallback((params: Record<string, unknown>): string => {
    return toQueryString(params)
  }, [])

  const parseQueryString = useCallback((query: string): Record<string, string | string[]> => {
    return fromQueryString(query)
  }, [])

  const createSlug = useCallback((text: string): string => {
    return slugify(text)
  }, [])

  const truncateText = useCallback((text: string, maxLength: number): string => {
    return truncate(text, maxLength)
  }, [])

  const compareStrings = useCallback((a: string, b: string): boolean => {
    return stringsEqual(a, b)
  }, [])

  const normalize = useCallback((str: string): string => {
    return normalizeString(str)
  }, [])

  return {
    encodeState,
    decodeState,
    buildQueryString,
    parseQueryString,
    createSlug,
    truncateText,
    compareStrings,
    normalize,
  }
}

/**
 * Hook for URL state management using encoded parameters.
 */
export function useUrlState<T extends Record<string, unknown>>(
  paramName: string = 'state'
) {
  const { encodeState, decodeState, buildQueryString, parseQueryString } = useEncoding()

  const getStateFromUrl = useCallback((): T | null => {
    if (typeof window === 'undefined') return null
    
    const params = parseQueryString(window.location.search)
    const encoded = params[paramName]
    
    if (!encoded || Array.isArray(encoded)) return null
    
    return decodeState(encoded) as T | null
  }, [paramName, parseQueryString, decodeState])

  const setStateToUrl = useCallback((state: T): void => {
    if (typeof window === 'undefined') return
    
    const encoded = encodeState(state)
    const url = new URL(window.location.href)
    url.searchParams.set(paramName, encoded)
    window.history.replaceState(null, '', url.toString())
  }, [paramName, encodeState])

  return {
    getStateFromUrl,
    setStateToUrl,
  }
}
