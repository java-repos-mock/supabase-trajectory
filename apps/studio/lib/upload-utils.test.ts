import { describe, it, expect, vi } from 'vitest'
import {
  calculateProgress,
  formatBytes,
  formatSpeed,
  formatTimeRemaining,
  validateFile,
  calculateChunkSize,
  calculateChunkCount,
  getChunkRange,
  matchesMimeType,
  getFileExtension,
  generateUniqueFilename,
  parseContentRange,
  createUploadUrl,
  shouldResumeUpload,
  calculateRetryDelay,
  isRetryableError,
  encodeUploadMetadata,
  decodeUploadMetadata,
  estimateUploadTime,
} from './upload-utils'

describe('upload-utils', () => {
  describe('calculateProgress', () => {
    it('calculates progress percentage', () => {
      const startTime = Date.now() - 5000
      const progress = calculateProgress(50, 100, startTime)
      
      expect(progress.percentage).toBe(50)
      expect(progress.loaded).toBe(50)
      expect(progress.total).toBe(100)
    })

    it('calculates speed and remaining time', () => {
      const startTime = Date.now() - 2000
      const progress = calculateProgress(1024 * 1024, 2 * 1024 * 1024, startTime)
      
      expect(progress.speed).toBeGreaterThan(0)
      expect(progress.remaining).toBeGreaterThan(0)
    })
  })

  describe('formatBytes', () => {
    it('formats bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 Bytes')
      expect(formatBytes(1024)).toBe('1 KB')
      expect(formatBytes(1024 * 1024)).toBe('1 MB')
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB')
    })

    it('respects decimal places', () => {
      expect(formatBytes(1536, 1)).toBe('1.5 KB')
      expect(formatBytes(1536, 0)).toBe('2 KB')
    })
  })

  describe('formatSpeed', () => {
    it('formats speed with units', () => {
      expect(formatSpeed(1024 * 1024)).toBe('1 MB/s')
    })
  })

  describe('formatTimeRemaining', () => {
    it('formats seconds', () => {
      expect(formatTimeRemaining(45)).toBe('45s')
    })

    it('formats minutes', () => {
      expect(formatTimeRemaining(125)).toBe('2m')
    })

    it('formats hours', () => {
      expect(formatTimeRemaining(3700)).toBe('1h 2m')
    })

    it('handles zero', () => {
      expect(formatTimeRemaining(0)).toBe('calculating...')
    })
  })

  describe('validateFile', () => {
    it('accepts valid files', () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' })
      const result = validateFile(file)
      expect(result.valid).toBe(true)
    })

    it('rejects oversized files', () => {
      const file = new File(['x'.repeat(100)], 'large.txt', { type: 'text/plain' })
      const result = validateFile(file, { maxFileSize: 50 })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('exceeds maximum')
    })

    it('rejects invalid MIME types', () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' })
      const result = validateFile(file, { allowedMimeTypes: ['image/png'] })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('not allowed')
    })
  })

  describe('calculateChunkSize', () => {
    it('returns file size for small files', () => {
      expect(calculateChunkSize(1024 * 1024)).toBe(1024 * 1024)
    })

    it('calculates optimal chunk size', () => {
      const size = 1024 * 1024 * 1024 // 1GB
      const chunkSize = calculateChunkSize(size)
      expect(chunkSize).toBeGreaterThanOrEqual(5 * 1024 * 1024)
      expect(chunkSize).toBeLessThanOrEqual(500 * 1024 * 1024)
    })
  })

  describe('calculateChunkCount', () => {
    it('calculates correct chunk count', () => {
      expect(calculateChunkCount(100, 30)).toBe(4)
      expect(calculateChunkCount(100, 100)).toBe(1)
      expect(calculateChunkCount(100, 50)).toBe(2)
    })
  })

  describe('getChunkRange', () => {
    it('returns correct range for chunk', () => {
      const range = getChunkRange(0, 50, 100)
      expect(range.start).toBe(0)
      expect(range.end).toBe(50)
    })

    it('handles last chunk', () => {
      const range = getChunkRange(1, 60, 100)
      expect(range.start).toBe(60)
      expect(range.end).toBe(100)
    })
  })

  describe('matchesMimeType', () => {
    it('matches exact types', () => {
      expect(matchesMimeType('image/png', 'image/png')).toBe(true)
      expect(matchesMimeType('image/png', 'image/jpeg')).toBe(false)
    })

    it('matches wildcards', () => {
      expect(matchesMimeType('image/png', 'image/*')).toBe(true)
      expect(matchesMimeType('text/plain', 'image/*')).toBe(false)
    })

    it('matches any type', () => {
      expect(matchesMimeType('anything/here', '*/*')).toBe(true)
    })
  })

  describe('getFileExtension', () => {
    it('extracts extension', () => {
      expect(getFileExtension('file.txt')).toBe('txt')
      expect(getFileExtension('file.tar.gz')).toBe('gz')
    })

    it('handles no extension', () => {
      expect(getFileExtension('file')).toBe('')
      expect(getFileExtension('file.')).toBe('')
    })

    it('returns lowercase', () => {
      expect(getFileExtension('file.TXT')).toBe('txt')
    })
  })

  describe('generateUniqueFilename', () => {
    it('returns original if unique', () => {
      expect(generateUniqueFilename('file.txt', [])).toBe('file.txt')
    })

    it('adds counter for conflicts', () => {
      expect(generateUniqueFilename('file.txt', ['file.txt'])).toBe('file (1).txt')
      expect(generateUniqueFilename('file.txt', ['file.txt', 'file (1).txt'])).toBe('file (2).txt')
    })
  })

  describe('parseContentRange', () => {
    it('parses valid range', () => {
      const result = parseContentRange('bytes 0-99/200')
      expect(result).toEqual({ start: 0, end: 99, total: 200 })
    })

    it('handles unknown total', () => {
      const result = parseContentRange('bytes 0-99/*')
      expect(result).toEqual({ start: 0, end: 99, total: -1 })
    })

    it('returns null for invalid', () => {
      expect(parseContentRange('invalid')).toBeNull()
    })
  })

  describe('createUploadUrl', () => {
    it('creates correct URL', () => {
      const url = createUploadUrl('https://api.example.com', 'bucket', 'path/to/file.txt')
      expect(url).toBe('https://api.example.com/storage/v1/object/bucket/path/to/file.txt')
    })

    it('encodes special characters', () => {
      const url = createUploadUrl('https://api.example.com', 'bucket', 'path/file name.txt')
      expect(url).toContain('file%20name.txt')
    })
  })

  describe('shouldResumeUpload', () => {
    it('returns false for null', () => {
      expect(shouldResumeUpload(null)).toBe(false)
    })

    it('returns true for recent upload', () => {
      const upload = { uploadedBytes: 1000, timestamp: Date.now() - 1000 }
      expect(shouldResumeUpload(upload)).toBe(true)
    })

    it('returns false for old upload', () => {
      const upload = { uploadedBytes: 1000, timestamp: Date.now() - 48 * 60 * 60 * 1000 }
      expect(shouldResumeUpload(upload)).toBe(false)
    })
  })

  describe('calculateRetryDelay', () => {
    it('calculates exponential backoff', () => {
      expect(calculateRetryDelay(0, 1000)).toBe(1000)
      expect(calculateRetryDelay(1, 1000)).toBe(2000)
      expect(calculateRetryDelay(2, 1000)).toBe(4000)
    })

    it('caps at max delay', () => {
      expect(calculateRetryDelay(10, 1000, 30000)).toBe(30000)
    })
  })

  describe('isRetryableError', () => {
    it('identifies retryable errors', () => {
      expect(isRetryableError(500)).toBe(true)
      expect(isRetryableError(503)).toBe(true)
      expect(isRetryableError(429)).toBe(true)
    })

    it('rejects non-retryable errors', () => {
      expect(isRetryableError(400)).toBe(false)
      expect(isRetryableError(404)).toBe(false)
    })
  })

  describe('encodeUploadMetadata/decodeUploadMetadata', () => {
    it('encodes and decodes metadata', () => {
      const metadata = { bucketName: 'test', filename: 'file.txt' }
      const encoded = encodeUploadMetadata(metadata)
      const decoded = decodeUploadMetadata(encoded)
      expect(decoded).toEqual(metadata)
    })
  })

  describe('estimateUploadTime', () => {
    it('estimates time correctly', () => {
      const fileSize = 10 * 1024 * 1024 // 10MB
      const speed = 8 * 1024 * 1024 // 8 Mbps = 1 MB/s
      expect(estimateUploadTime(fileSize, speed)).toBe(10)
    })
  })
})
