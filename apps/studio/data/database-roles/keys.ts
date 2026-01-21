export const databaseRoleKeys = {
  /**
   * Base key for all role-related queries
   */
  all: (projectRef: string | undefined) => ['projects', projectRef, 'roles'] as const,

  /**
   * Key for listing all roles in a project
   */
  list: (projectRef: string | undefined) =>
    [...databaseRoleKeys.all(projectRef), 'list'] as const,

  /**
   * Key for a specific role's details
   */
  role: (projectRef: string | undefined, roleName: string) =>
    [...databaseRoleKeys.all(projectRef), 'role', roleName] as const,

  /**
   * Key for role membership information
   */
  membership: (projectRef: string | undefined, roleName: string) =>
    [...databaseRoleKeys.all(projectRef), 'membership', roleName] as const,

  /**
   * Key for role privileges on a specific object
   */
  privileges: (projectRef: string | undefined, roleName: string, objectType: string) =>
    [...databaseRoleKeys.all(projectRef), 'privileges', roleName, objectType] as const,
}
