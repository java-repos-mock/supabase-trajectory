import { memo, useState, useRef, useEffect } from 'react'
import { truncate } from 'lib/encoding-utils'
import { Tooltip, TooltipContent, TooltipTrigger } from 'ui'

export interface TruncatedTextProps {
  text: string
  maxLength?: number
  showTooltip?: boolean
  className?: string
}

/**
 * Display text with automatic truncation and optional tooltip.
 */
export const TruncatedText = memo(function TruncatedText({
  text,
  maxLength = 50,
  showTooltip = true,
  className = '',
}: TruncatedTextProps) {
  const isTruncated = text.length > maxLength
  const displayText = isTruncated ? truncate(text, maxLength) : text

  if (!isTruncated || !showTooltip) {
    return <span className={className}>{displayText}</span>
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`cursor-help ${className}`}>{displayText}</span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs break-words">{text}</p>
      </TooltipContent>
    </Tooltip>
  )
})

/**
 * Display text that truncates based on container width.
 */
export const AutoTruncate = memo(function AutoTruncate({
  text,
  className = '',
}: {
  text: string
  className?: string
}) {
  const [isTruncated, setIsTruncated] = useState(false)
  const textRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const element = textRef.current
    if (!element) return

    const checkTruncation = () => {
      setIsTruncated(element.scrollWidth > element.clientWidth)
    }

    checkTruncation()
    
    const observer = new ResizeObserver(checkTruncation)
    observer.observe(element)
    
    return () => observer.disconnect()
  }, [text])

  const content = (
    <span
      ref={textRef}
      className={`block truncate ${className}`}
    >
      {text}
    </span>
  )

  if (!isTruncated) {
    return content
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {content}
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs break-words">{text}</p>
      </TooltipContent>
    </Tooltip>
  )
})

export default TruncatedText
