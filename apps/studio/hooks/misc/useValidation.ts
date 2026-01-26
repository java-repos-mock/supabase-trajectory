import { useState, useCallback, useMemo } from 'react'
import {
  ValidationResult,
  validateEmail,
  validateURL,
  validateLength,
  validatePassword,
  validatePhoneNumber,
} from 'lib/validation-utils'

export type ValidatorFn = (value: string) => ValidationResult

export interface UseValidationOptions {
  validators: ValidatorFn[]
  validateOnChange?: boolean
  validateOnBlur?: boolean
}

export interface UseValidationReturn {
  value: string
  error: string | undefined
  isValid: boolean
  isDirty: boolean
  isTouched: boolean
  setValue: (value: string) => void
  validate: () => boolean
  reset: () => void
  onBlur: () => void
}

/**
 * Hook for field validation with multiple validators.
 */
export function useValidation(
  initialValue: string = '',
  options: UseValidationOptions
): UseValidationReturn {
  const { validators, validateOnChange = true, validateOnBlur = true } = options

  const [value, setValueState] = useState(initialValue)
  const [error, setError] = useState<string | undefined>()
  const [isDirty, setIsDirty] = useState(false)
  const [isTouched, setIsTouched] = useState(false)

  const runValidation = useCallback(
    (val: string): boolean => {
      for (const validator of validators) {
        const result = validator(val)
        if (!result.valid) {
          setError(result.error)
          return false
        }
      }
      setError(undefined)
      return true
    },
    [validators]
  )

  const setValue = useCallback(
    (newValue: string) => {
      setValueState(newValue)
      setIsDirty(true)
      if (validateOnChange) {
        runValidation(newValue)
      }
    },
    [validateOnChange, runValidation]
  )

  const validate = useCallback(() => {
    return runValidation(value)
  }, [value, runValidation])

  const reset = useCallback(() => {
    setValueState(initialValue)
    setError(undefined)
    setIsDirty(false)
    setIsTouched(false)
  }, [initialValue])

  const onBlur = useCallback(() => {
    setIsTouched(true)
    if (validateOnBlur) {
      runValidation(value)
    }
  }, [validateOnBlur, runValidation, value])

  const isValid = useMemo(() => !error, [error])

  return {
    value,
    error,
    isValid,
    isDirty,
    isTouched,
    setValue,
    validate,
    reset,
    onBlur,
  }
}

/**
 * Hook for email validation.
 */
export function useEmailValidation(initialValue: string = '') {
  return useValidation(initialValue, {
    validators: [validateEmail],
  })
}

/**
 * Hook for URL validation.
 */
export function useURLValidation(initialValue: string = '') {
  return useValidation(initialValue, {
    validators: [validateURL],
  })
}

/**
 * Hook for password validation.
 */
export function usePasswordValidation(initialValue: string = '') {
  return useValidation(initialValue, {
    validators: [validatePassword],
  })
}

/**
 * Hook for phone validation.
 */
export function usePhoneValidation(initialValue: string = '') {
  return useValidation(initialValue, {
    validators: [validatePhoneNumber],
  })
}

/**
 * Create a length validator.
 */
export function createLengthValidator(
  min: number,
  max: number
): ValidatorFn {
  return (value: string) => validateLength(value, min, max)
}

/**
 * Create a required validator.
 */
export function createRequiredValidator(fieldName: string = 'This field'): ValidatorFn {
  return (value: string) => {
    if (!value || value.trim().length === 0) {
      return { valid: false, error: `${fieldName} is required` }
    }
    return { valid: true }
  }
}

/**
 * Create a pattern validator.
 */
export function createPatternValidator(
  pattern: RegExp,
  message: string
): ValidatorFn {
  return (value: string) => {
    if (!pattern.test(value)) {
      return { valid: false, error: message }
    }
    return { valid: true }
  }
}
