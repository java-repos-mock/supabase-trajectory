/**
 * Query key factory for organization invitation queries.
 */

export const invitationKeys = {
  all: ['invitations'] as const,

  lists: () => [...invitationKeys.all, 'list'] as const,

  list: (organizationSlug: string | undefined) =>
    [...invitationKeys.lists(), organizationSlug] as const,

  pending: (organizationSlug: string | undefined) =>
    [...invitationKeys.list(organizationSlug), 'pending'] as const,

  details: () => [...invitationKeys.all, 'detail'] as const,

  detail: (organizationSlug: string | undefined, invitationId: string | undefined) =>
    [...invitationKeys.details(), organizationSlug, invitationId] as const,

  byToken: (token: string | undefined) =>
    [...invitationKeys.all, 'token', token] as const,
}
