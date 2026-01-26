export const auditKeys = {
  all: (projectRef?: string, organizationId?: string) =>
    ['audit', { projectRef, organizationId }] as const,

  list: (projectRef?: string, organizationId?: string, filters?: Record<string, unknown>) =>
    [...auditKeys.all(projectRef, organizationId), 'list', filters] as const,

  detail: (projectRef?: string, organizationId?: string, logId: string) =>
    [...auditKeys.all(projectRef, organizationId), 'detail', logId] as const,

  stats: (projectRef?: string, organizationId?: string) =>
    [...auditKeys.all(projectRef, organizationId), 'stats'] as const,
}
