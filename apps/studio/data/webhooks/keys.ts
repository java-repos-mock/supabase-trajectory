/**
 * Query key factory for webhook queries.
 */

export const webhookKeys = {
  all: ['webhooks'] as const,
  
  lists: () => [...webhookKeys.all, 'list'] as const,
  
  list: (projectRef: string | undefined) =>
    [...webhookKeys.lists(), projectRef] as const,
  
  details: () => [...webhookKeys.all, 'detail'] as const,
  
  detail: (projectRef: string | undefined, webhookId: string | undefined) =>
    [...webhookKeys.details(), projectRef, webhookId] as const,
  
  deliveries: (projectRef: string | undefined, webhookId: string | undefined) =>
    [...webhookKeys.detail(projectRef, webhookId), 'deliveries'] as const,
}
