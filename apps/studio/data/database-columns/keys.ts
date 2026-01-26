export const databaseColumnKeys = {
  /**
   * Base key for all column-related queries
   */
  all: (projectRef: string | undefined) => ['projects', projectRef, 'columns'] as const,

  /**
   * Key for listing columns in a specific table
   */
  list: (projectRef: string | undefined, schema: string, table: string) =>
    [...databaseColumnKeys.all(projectRef), 'list', { schema, table }] as const,

  /**
   * Key for a specific column's details
   */
  column: (projectRef: string | undefined, schema: string, table: string, column: string) =>
    [...databaseColumnKeys.all(projectRef), 'column', { schema, table, column }] as const,

  /**
   * Key for column comments
   */
  comment: (projectRef: string | undefined, schema: string, table: string, column: string) =>
    [...databaseColumnKeys.all(projectRef), 'comment', { schema, table, column }] as const,

  /**
   * Key for column statistics (used in query optimization)
   */
  statistics: (projectRef: string | undefined, schema: string, table: string) =>
    [...databaseColumnKeys.all(projectRef), 'statistics', { schema, table }] as const,
}
