import { useState, useCallback, useRef } from 'react'
import {
  UploadProgress,
  UploadConfig,
  DEFAULT_UPLOAD_CONFIG,
  calculateProgress,
  validateFile,
  calculateChunkSize,
  formatBytes,
  formatSpeed,
  formatTimeRemaining,
} from 'lib/upload-utils'

export type UploadStatus = 'idle' | 'validating' | 'uploading' | 'paused' | 'completed' | 'error'

export interface UseFileUploadOptions {
  config?: Partial<UploadConfig>
  onProgress?: (progress: UploadProgress) => void
  onComplete?: (file: File) => void
  onError?: (error: Error) => void
}

export interface UseFileUploadReturn {
  status: UploadStatus
  progress: UploadProgress | null
  error: string | null
  
  upload: (file: File) => Promise<void>
  pause: () => void
  resume: () => void
  cancel: () => void
  reset: () => void
  
  formattedProgress: string
  formattedSpeed: string
  formattedRemaining: string
}

/**
 * Hook for managing file uploads with progress tracking.
 */
export function useFileUpload(options: UseFileUploadOptions = {}): UseFileUploadReturn {
  const { config, onProgress, onComplete, onError } = options
  const uploadConfig = { ...DEFAULT_UPLOAD_CONFIG, ...config }

  const [status, setStatus] = useState<UploadStatus>('idle')
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const abortControllerRef = useRef<AbortController | null>(null)
  const startTimeRef = useRef<number>(0)

  const upload = useCallback(async (file: File) => {
    setStatus('validating')
    setError(null)

    const validation = validateFile(file, uploadConfig)
    if (!validation.valid) {
      setStatus('error')
      setError(validation.error || 'Validation failed')
      onError?.(new Error(validation.error))
      return
    }

    setStatus('uploading')
    startTimeRef.current = Date.now()
    abortControllerRef.current = new AbortController()

    try {
      const chunkSize = calculateChunkSize(file.size)
      let uploadedBytes = 0

      while (uploadedBytes < file.size) {
        if (abortControllerRef.current.signal.aborted) {
          throw new Error('Upload cancelled')
        }

        const chunk = file.slice(uploadedBytes, uploadedBytes + chunkSize)
        uploadedBytes += chunk.size

        const currentProgress = calculateProgress(
          uploadedBytes,
          file.size,
          startTimeRef.current
        )

        setProgress(currentProgress)
        onProgress?.(currentProgress)

        await new Promise(resolve => setTimeout(resolve, 100))
      }

      setStatus('completed')
      onComplete?.(file)
    } catch (err) {
      if (err instanceof Error && err.message === 'Upload cancelled') {
        setStatus('idle')
      } else {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Upload failed')
        onError?.(err instanceof Error ? err : new Error('Upload failed'))
      }
    }
  }, [uploadConfig, onProgress, onComplete, onError])

  const pause = useCallback(() => {
    if (status === 'uploading') {
      setStatus('paused')
    }
  }, [status])

  const resume = useCallback(() => {
    if (status === 'paused') {
      setStatus('uploading')
    }
  }, [status])

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort()
    setStatus('idle')
    setProgress(null)
  }, [])

  const reset = useCallback(() => {
    abortControllerRef.current?.abort()
    setStatus('idle')
    setProgress(null)
    setError(null)
  }, [])

  return {
    status,
    progress,
    error,
    upload,
    pause,
    resume,
    cancel,
    reset,
    formattedProgress: progress ? `${progress.percentage}%` : '0%',
    formattedSpeed: progress ? formatSpeed(progress.speed) : '0 B/s',
    formattedRemaining: progress ? formatTimeRemaining(progress.remaining) : 'calculating...',
  }
}

/**
 * Hook for handling multiple file uploads.
 */
export function useMultiFileUpload(options: UseFileUploadOptions = {}) {
  const [uploads, setUploads] = useState<Map<string, { file: File; progress: UploadProgress | null; status: UploadStatus }>>(new Map())

  const addFile = useCallback((file: File) => {
    const id = `${file.name}-${Date.now()}`
    setUploads(prev => {
      const next = new Map(prev)
      next.set(id, { file, progress: null, status: 'idle' })
      return next
    })
    return id
  }, [])

  const removeFile = useCallback((id: string) => {
    setUploads(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const uploadAll = useCallback(async () => {
    for (const [id, upload] of uploads) {
      if (upload.status === 'idle') {
        setUploads(prev => {
          const next = new Map(prev)
          const entry = next.get(id)
          if (entry) {
            next.set(id, { ...entry, status: 'uploading' })
          }
          return next
        })
      }
    }
  }, [uploads])

  return {
    uploads: Array.from(uploads.entries()).map(([id, data]) => ({ id, ...data })),
    addFile,
    removeFile,
    uploadAll,
  }
}
