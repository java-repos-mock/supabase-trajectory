import { describe, expect, it, beforeEach, vi } from "vitest"

import {
  CACHE_DURATIONS,
  CacheEntry,
  createCacheEntry,
  formatCacheDuration,
  generateBucketCacheKey,
  generateBucketsListCacheKey,
  getRemainingTTL,
  isCacheValid,
  parseCacheControlHeader,
  StorageCacheManager,
} from "./storage-cache"

describe("storage-cache", () => {
  describe("CACHE_DURATIONS", () => {
    it("should have correct duration values", () => {
      expect(CACHE_DURATIONS.SHORT).toBe(60)
      expect(CACHE_DURATIONS.MEDIUM).toBe(300)
      expect(CACHE_DURATIONS.LONG).toBe(3600)
      expect(CACHE_DURATIONS.DEFAULT).toBe(3600)
    })
  })

  describe("generateBucketCacheKey", () => {
    it("should generate key without path", () => {
      const key = generateBucketCacheKey("proj123", "bucket456")
      expect(key).toContain("proj123")
      expect(key).toContain("bucket456")
    })

    it("should generate key with path", () => {
      const key = generateBucketCacheKey("proj123", "bucket456", "folder/file.txt")
      expect(key).toContain("folder/file.txt")
    })
  })

  describe("generateBucketsListCacheKey", () => {
    it("should generate key with default params", () => {
      const key = generateBucketsListCacheKey("proj123")
      expect(key).toContain("proj123")
    })

    it("should generate key with pagination params", () => {
      const key = generateBucketsListCacheKey("proj123", {
        limit: 50,
        search: "test",
        sortColumn: "name",
        sortOrder: "asc",
      })
      expect(key).toBeDefined()
    })
  })

  describe("isCacheValid", () => {
    it("should return false for null/undefined", () => {
      expect(isCacheValid(null)).toBe(false)
      expect(isCacheValid(undefined)).toBe(false)
    })

    it("should return true for valid entry", () => {
      const entry: CacheEntry<string> = {
        data: "test",
        timestamp: Date.now(),
        ttl: 3600,
      }
      expect(isCacheValid(entry)).toBe(true)
    })

    it("should return false for expired entry", () => {
      const entry: CacheEntry<string> = {
        data: "test",
        timestamp: Date.now() - 7200000, // 2 hours ago
        ttl: 3600,
      }
      expect(isCacheValid(entry)).toBe(false)
    })
  })

  describe("getRemainingTTL", () => {
    it("should return remaining TTL for valid entry", () => {
      const entry: CacheEntry<string> = {
        data: "test",
        timestamp: Date.now(),
        ttl: 60000, // 60 seconds in ms
      }
      const remaining = getRemainingTTL(entry)
      expect(remaining).toBeGreaterThan(0)
      expect(remaining).toBeLessThanOrEqual(60)
    })

    it("should return 0 for expired entry", () => {
      const entry: CacheEntry<string> = {
        data: "test",
        timestamp: Date.now() - 120000,
        ttl: 60000,
      }
      expect(getRemainingTTL(entry)).toBe(0)
    })
  })

  describe("createCacheEntry", () => {
    it("should create entry with default TTL", () => {
      const entry = createCacheEntry({ name: "test" })
      expect(entry.data).toEqual({ name: "test" })
      expect(entry.ttl).toBe(CACHE_DURATIONS.DEFAULT)
      expect(entry.timestamp).toBeDefined()
    })

    it("should create entry with custom TTL", () => {
      const entry = createCacheEntry("data", 120)
      expect(entry.ttl).toBe(120)
    })

    it("should estimate size", () => {
      const entry = createCacheEntry({ key: "value" })
      expect(entry.size_bytes).toBeGreaterThan(0)
    })
  })

  describe("StorageCacheManager", () => {
    let manager: StorageCacheManager

    beforeEach(() => {
      manager = new StorageCacheManager()
    })

    it("should set and get values", () => {
      manager.set("key1", { name: "test" })
      const value = manager.get<{ name: string }>("key1")
      expect(value).toEqual({ name: "test" })
    })

    it("should return null for missing keys", () => {
      expect(manager.get("nonexistent")).toBeNull()
    })

    it("should invalidate specific keys", () => {
      manager.set("key1", "value1")
      manager.set("key2", "value2")
      manager.invalidate("key1")
      expect(manager.get("key1")).toBeNull()
      expect(manager.get("key2")).toBe("value2")
    })

    it("should invalidate by prefix", () => {
      manager.set("bucket:123:file1", "data1")
      manager.set("bucket:123:file2", "data2")
      manager.set("bucket:456:file1", "data3")
      manager.invalidateByPrefix("bucket:123")
      expect(manager.get("bucket:123:file1")).toBeNull()
      expect(manager.get("bucket:123:file2")).toBeNull()
      expect(manager.get("bucket:456:file1")).toBe("data3")
    })

    it("should clear all entries", () => {
      manager.set("key1", "value1")
      manager.set("key2", "value2")
      manager.clear()
      expect(manager.get("key1")).toBeNull()
      expect(manager.get("key2")).toBeNull()
    })

    it("should return stats", () => {
      manager.set("key1", "value1")
      manager.set("key2", "value2")
      const stats = manager.getStats()
      expect(stats.entries).toBe(2)
      expect(stats.sizeBytes).toBeGreaterThan(0)
    })
  })

  describe("formatCacheDuration", () => {
    it("should format seconds", () => {
      expect(formatCacheDuration(30)).toBe("30s")
      expect(formatCacheDuration(59)).toBe("59s")
    })

    it("should format minutes", () => {
      expect(formatCacheDuration(60)).toBe("1m")
      expect(formatCacheDuration(120)).toBe("2m")
      expect(formatCacheDuration(3599)).toBe("59m")
    })

    it("should format hours", () => {
      expect(formatCacheDuration(3600)).toBe("1h")
      expect(formatCacheDuration(7200)).toBe("2h")
    })
  })

  describe("parseCacheControlHeader", () => {
    it("should parse max-age value", () => {
      expect(parseCacheControlHeader("max-age=3600")).toBe(3600)
      expect(parseCacheControlHeader("public, max-age=86400")).toBe(86400)
    })

    it("should return null for missing max-age", () => {
      expect(parseCacheControlHeader("no-cache")).toBeNull()
      expect(parseCacheControlHeader("private")).toBeNull()
    })
  })
})
