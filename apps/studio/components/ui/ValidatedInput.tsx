import { forwardRef, InputHTMLAttributes } from 'react'
import { Input } from 'ui'
import { cn } from 'lib/helpers'

export interface ValidatedInputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string
  touched?: boolean
  showErrorOnlyWhenTouched?: boolean
}

/**
 * Input component with validation error display.
 */
export const ValidatedInput = forwardRef<HTMLInputElement, ValidatedInputProps>(
  function ValidatedInput(
    { error, touched, showErrorOnlyWhenTouched = true, className, ...props },
    ref
  ) {
    const showError = error && (!showErrorOnlyWhenTouched || touched)

    return (
      <div className="space-y-1">
        <Input
          ref={ref}
          className={cn(
            showError && 'border-destructive focus-visible:ring-destructive',
            className
          )}
          {...props}
        />
        {showError && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </div>
    )
  }
)

export default ValidatedInput
