import { memo } from 'react'
import { Progress } from 'ui'
import { formatBytes, formatSpeed, formatTimeRemaining, UploadProgress as UploadProgressType } from 'lib/upload-utils'
import { cn } from 'lib/helpers'

export interface UploadProgressProps {
  progress: UploadProgressType
  filename?: string
  showDetails?: boolean
  className?: string
}

/**
 * Display upload progress with optional details.
 */
export const UploadProgress = memo(function UploadProgress({
  progress,
  filename,
  showDetails = true,
  className,
}: UploadProgressProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {filename && (
        <div className="flex items-center justify-between text-sm">
          <span className="truncate font-medium">{filename}</span>
          <span className="text-foreground-muted">{progress.percentage}%</span>
        </div>
      )}
      
      <Progress value={progress.percentage} className="h-2" />
      
      {showDetails && (
        <div className="flex items-center justify-between text-xs text-foreground-muted">
          <span>
            {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
          </span>
          <span className="flex items-center gap-2">
            <span>{formatSpeed(progress.speed)}</span>
            <span>•</span>
            <span>{formatTimeRemaining(progress.remaining)} remaining</span>
          </span>
        </div>
      )}
    </div>
  )
})

/**
 * Upload progress list for multiple files.
 */
export interface UploadProgressListProps {
  uploads: Array<{
    id: string
    filename: string
    progress: UploadProgressType | null
    status: 'idle' | 'uploading' | 'completed' | 'error'
    error?: string
  }>
  className?: string
}

export const UploadProgressList = memo(function UploadProgressList({
  uploads,
  className,
}: UploadProgressListProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {uploads.map((upload) => (
        <div key={upload.id} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="truncate font-medium">{upload.filename}</span>
            <StatusBadge status={upload.status} />
          </div>
          
          {upload.progress && upload.status === 'uploading' && (
            <UploadProgress progress={upload.progress} showDetails={false} />
          )}
          
          {upload.error && (
            <p className="text-xs text-destructive">{upload.error}</p>
          )}
        </div>
      ))}
    </div>
  )
})

function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; className: string }> = {
    idle: { label: 'Waiting', className: 'text-foreground-muted' },
    uploading: { label: 'Uploading', className: 'text-brand' },
    completed: { label: 'Completed', className: 'text-brand' },
    error: { label: 'Failed', className: 'text-destructive' },
  }

  const config = statusConfig[status] || statusConfig.idle

  return (
    <span className={cn('text-xs', config.className)}>
      {config.label}
    </span>
  )
}

export default UploadProgress
