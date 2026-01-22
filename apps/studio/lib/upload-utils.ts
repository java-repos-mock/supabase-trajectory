/**
 * File upload utilities for the Studio dashboard.
 * Provides helpers for upload progress tracking, size formatting, and validation.
 */

/**
 * Upload progress state.
 */
export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
  speed: number
  elapsed: number
  remaining: number
}

/**
 * Upload configuration options.
 */
export interface UploadConfig {
  chunkSize: number
  maxFileSize: number
  allowedMimeTypes: string[]
  retryAttempts: number
  retryDelay: number
}

/**
 * Default upload configuration.
 */
export const DEFAULT_UPLOAD_CONFIG: UploadConfig = {
  chunkSize: 6 * 1024 * 1024, // 6MB
  maxFileSize: 50 * 1024 * 1024 * 1024, // 50GB
  allowedMimeTypes: [],
  retryAttempts: 3,
  retryDelay: 1000,
}

/**
 * Calculate upload progress metrics.
 */
export function calculateProgress(
  bytesUploaded: number,
  bytesTotal: number,
  startTime: number
): UploadProgress {
  const elapsed = Date.now() - startTime
  const percentage = Math.round((bytesUploaded / bytesTotal) * 100)
  const speed = elapsed > 0 ? bytesUploaded / (elapsed / 1000) : 0
  const bytesRemaining = bytesTotal - bytesUploaded
  const remaining = speed > 0 ? bytesRemaining / speed : 0

  return {
    loaded: bytesUploaded,
    total: bytesTotal,
    percentage,
    speed,
    elapsed: elapsed / 1000,
    remaining,
  }
}

/**
 * Format bytes to human-readable size.
 * Uses binary prefixes (KiB, MiB, GiB).
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`
}

/**
 * Format upload speed to human-readable string.
 */
export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`
}

/**
 * Format remaining time to human-readable string.
 */
export function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return 'calculating...'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`
}

/**
 * Validate file against upload configuration.
 */
export function validateFile(
  file: File,
  config: Partial<UploadConfig> = {}
): { valid: boolean; error?: string } {
  const { maxFileSize, allowedMimeTypes } = { ...DEFAULT_UPLOAD_CONFIG, ...config }

  if (file.size > maxFileSize) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed (${formatBytes(maxFileSize)})`,
    }
  }

  if (allowedMimeTypes.length > 0 && !allowedMimeTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type "${file.type}" is not allowed`,
    }
  }

  return { valid: true }
}

/**
 * Calculate optimal chunk size based on file size.
 */
export function calculateChunkSize(fileSize: number): number {
  const minChunk = 5 * 1024 * 1024 // 5MB
  const maxChunk = 500 * 1024 * 1024 // 500MB

  if (fileSize <= minChunk) {
    return fileSize
  }

  const targetChunks = 100
  const optimalChunk = Math.ceil(fileSize / targetChunks)

  return Math.min(Math.max(optimalChunk, minChunk), maxChunk)
}

/**
 * Calculate number of chunks for a file.
 */
export function calculateChunkCount(fileSize: number, chunkSize: number): number {
  return Math.ceil(fileSize / chunkSize)
}

/**
 * Get chunk range for a specific chunk index.
 */
export function getChunkRange(
  chunkIndex: number,
  chunkSize: number,
  fileSize: number
): { start: number; end: number } {
  const start = chunkIndex * chunkSize
  const end = Math.min(start + chunkSize, fileSize)
  return { start, end }
}

/**
 * Check if a MIME type matches a pattern.
 * Supports wildcards like "image/*".
 */
export function matchesMimeType(mimeType: string, pattern: string): boolean {
  if (pattern === '*/*') return true
  
  if (pattern.endsWith('/*')) {
    const category = pattern.slice(0, -2)
    return mimeType.startsWith(category + '/')
  }

  return mimeType === pattern
}

/**
 * Get file extension from filename.
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1 || lastDot === filename.length - 1) {
    return ''
  }
  return filename.slice(lastDot + 1).toLowerCase()
}

/**
 * Generate a unique filename to avoid conflicts.
 */
export function generateUniqueFilename(
  originalName: string,
  existingNames: string[]
): string {
  if (!existingNames.includes(originalName)) {
    return originalName
  }

  const extension = getFileExtension(originalName)
  const baseName = extension
    ? originalName.slice(0, -(extension.length + 1))
    : originalName

  let counter = 1
  let newName: string

  do {
    newName = extension
      ? `${baseName} (${counter}).${extension}`
      : `${baseName} (${counter})`
    counter++
  } while (existingNames.includes(newName))

  return newName
}

/**
 * Parse Content-Range header to get upload progress.
 */
export function parseContentRange(header: string): { start: number; end: number; total: number } | null {
  const match = header.match(/bytes (\d+)-(\d+)\/(\d+|\*)/)
  if (!match) return null

  return {
    start: parseInt(match[1], 10),
    end: parseInt(match[2], 10),
    total: match[3] === '*' ? -1 : parseInt(match[3], 10),
  }
}

/**
 * Create a resumable upload URL.
 */
export function createUploadUrl(
  baseUrl: string,
  bucketName: string,
  objectPath: string
): string {
  const encodedPath = objectPath
    .split('/')
    .map(encodeURIComponent)
    .join('/')

  return `${baseUrl}/storage/v1/object/${bucketName}/${encodedPath}`
}

/**
 * Determine if upload should be resumed.
 */
export function shouldResumeUpload(
  previousUpload: { uploadedBytes: number; timestamp: number } | null,
  maxAge: number = 24 * 60 * 60 * 1000 // 24 hours
): boolean {
  if (!previousUpload) return false
  
  const age = Date.now() - previousUpload.timestamp
  return age < maxAge && previousUpload.uploadedBytes > 0
}

/**
 * Calculate retry delay with exponential backoff.
 */
export function calculateRetryDelay(
  attempt: number,
  baseDelay: number = 1000,
  maxDelay: number = 30000
): number {
  const delay = baseDelay * Math.pow(2, attempt)
  return Math.min(delay, maxDelay)
}

/**
 * Check if an error is retryable.
 */
export function isRetryableError(status: number): boolean {
  return [408, 429, 500, 502, 503, 504].includes(status)
}

/**
 * Create upload metadata for TUS protocol.
 */
export function createUploadMetadata(
  file: File,
  bucketName: string,
  objectPath: string
): Record<string, string> {
  return {
    bucketName,
    objectName: objectPath,
    contentType: file.type,
    filename: file.name,
  }
}

/**
 * Encode metadata for TUS Upload-Metadata header.
 */
export function encodeUploadMetadata(metadata: Record<string, string>): string {
  return Object.entries(metadata)
    .map(([key, value]) => `${key} ${btoa(value)}`)
    .join(',')
}

/**
 * Decode TUS Upload-Metadata header.
 */
export function decodeUploadMetadata(header: string): Record<string, string> {
  const result: Record<string, string> = {}
  
  for (const part of header.split(',')) {
    const [key, encodedValue] = part.trim().split(' ')
    if (key && encodedValue) {
      result[key] = atob(encodedValue)
    }
  }
  
  return result
}

/**
 * Estimate upload time based on file size and connection speed.
 */
export function estimateUploadTime(
  fileSize: number,
  connectionSpeedBps: number = 10 * 1024 * 1024 // Default 10 Mbps
): number {
  return fileSize / (connectionSpeedBps / 8)
}
