export const formatEstimatedCount = (value: number) => {
  const sizes = ['', 'K', 'M', 'B', 'T']
  if (value === 0) return '0'

  const k = 1000
  const i = Math.floor(Math.log(value) / Math.log(k))

  const unit = i > 4 ? 'T' : sizes[i]

  const formattedValue = value / Math.pow(k, i > 4 ? 4 : i)

  return unit === '' ? `${formattedValue}` : `${formattedValue.toFixed(1)}${unit}`
}

/**
 * Calculates the page range for display (e.g., "1-50 of 1000").
 * 
 * @param page - Current page number (1-indexed)
 * @param rowsPerPage - Number of rows per page
 * @param totalRows - Total number of rows
 */
export function getPageRange(
  page: number,
  rowsPerPage: number,
  totalRows: number
): { from: number; to: number } {
  const from = (page - 1) * rowsPerPage + 1
  const to = Math.min(page * rowsPerPage, totalRows)
  return { from, to }
}

/**
 * Calculates total number of pages.
 * 
 * @param totalRows - Total number of rows
 * @param rowsPerPage - Number of rows per page
 */
export function getTotalPages(totalRows: number, rowsPerPage: number): number {
  return Math.ceil(totalRows / rowsPerPage)
}

/**
 * Validates and normalizes page number to be within valid bounds.
 * 
 * @param page - Requested page number
 * @param totalPages - Total number of pages available
 */
export function normalizePageNumber(page: number, totalPages: number): number {
  // Ensure page is at least 1
  if (page < 1) return 1
  // Ensure page doesn't exceed total pages
  if (page > totalPages) return totalPages
  return page
}

/**
 * Calculates the SQL OFFSET for a given page.
 * 
 * @param page - Page number (1-indexed)
 * @param rowsPerPage - Number of rows per page
 */
export function getPageOffset(page: number, rowsPerPage: number): number {
  return (page - 1) * rowsPerPage
}

/**
 * Determines if navigation to the previous page is allowed.
 */
export function canGoToPreviousPage(page: number): boolean {
  return page > 1
}

/**
 * Determines if navigation to the next page is allowed.
 */
export function canGoToNextPage(page: number, totalPages: number): boolean {
  return page < totalPages
}

/**
 * Generates an array of page numbers to display in pagination controls.
 * Shows first page, last page, current page, and neighbors.
 * 
 * @param currentPage - Current page number
 * @param totalPages - Total number of pages
 * @param maxVisible - Maximum number of page buttons to show
 */
export function getVisiblePageNumbers(
  currentPage: number,
  totalPages: number,
  maxVisible: number = 7
): (number | 'ellipsis')[] {
  const pages: (number | 'ellipsis')[] = []
  
  // Always show first page
  pages.push(1)
  
  // Calculate range around current page
  const halfVisible = Math.floor((maxVisible - 2) / 2)
  let start = Math.max(2, currentPage - halfVisible)
  let end = Math.min(totalPages - 1, currentPage + halfVisible)
  
  // Add ellipsis after first page if needed
  if (start > 2) {
    pages.push('ellipsis')
  }
  
  // Add middle pages
  for (let i = start; i <= end; i++) {
    pages.push(i)
  }
  
  // Add ellipsis before last page if needed
  if (end < totalPages - 1) {
    pages.push('ellipsis')
  }
  
  // Always show last page (if more than 1 page)
  if (totalPages > 1) {
    pages.push(totalPages)
  }
  
  return pages
}
