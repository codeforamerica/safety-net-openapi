# ADR: Authentication and Authorization Patterns

**Status:** Proposed

**Date:** 2026-01-26

**Deciders:** Development Team

---

## Context

The Safety Net OpenAPI toolkit needs authentication and authorization patterns that can be implemented by adopters. The patterns must support multiple user types (applicants, case workers, supervisors, admins) with different levels of access to sensitive data.

### Requirements

- Support multiple user types with different permissions
- Multi-tenant (multiple counties/agencies sharing infrastructure)
- Data scoping by county for staff, by user for applicants
- Field-level access control for sensitive data (SSN)
- Audit trail for compliance
- Integrate with standard Identity Providers (IdP)
- Patterns must be implementable without specific vendor lock-in

### Constraints

- Must work with existing OpenAPI specifications
- Should not require runtime calls to authorization service on every API request
- Must support future domains (Case Management, Workflow) without redesign
- Applicants and staff have fundamentally different access patterns

---

## Proposed Approach

We propose a **three-layer architecture** with:

1. **Identity Provider (IdP)** for authentication
2. **User Service** for authorization context (roles, permissions, county assignments)
3. **JWT-based authorization** with permissions embedded in tokens

### Key Design Choices

| Recommendation | Rationale |
|----------|-----------|
| Separate IdP from User Service | IdP handles login/MFA; User Service handles domain-specific roles |
| Embed permissions in JWT | Avoid runtime calls to User Service on every API request |
| User Service as cross-cutting concern | Not part of Case Management; needed before any domain can be implemented |
| User links to domain entities | User.personId for applicants, User.caseWorkerId for staff |

---

## Options Considered

### Option 1: IdP-Only (No User Service)

Store all roles and permissions in the IdP using custom claims or groups.

| Pros | Cons |
|------|------|
| Simpler architecture (one system) | Limited flexibility for domain-specific roles |
| No additional service to maintain | County assignments don't fit IdP data model |
| | Requires IdP customization for each change |
| | Hard to link users to domain entities |

**Not recommended because:** IdP custom attributes are too limited for multi-county assignments and domain entity linking.

---

### Option 2: User Service with Runtime Calls

User Service provides permissions; domain APIs call it on each request.

| Pros | Cons |
|------|------|
| Always up-to-date permissions | Added latency on every request |
| Simple JWT (just identity) | User Service is single point of failure |
| | N requests = N permission lookups |
| | Requires caching to be performant |

**Not recommended because:** Runtime dependency on every request creates performance and availability concerns.

---

### Option 3: Policy Engine (OPA/Cedar)

Use a policy decision point (OPA, AWS Cedar) for authorization.

| Pros | Cons |
|------|------|
| Powerful policy language | Additional infrastructure to operate |
| Policies separate from code | Learning curve for policy language |
| Can handle complex rules | Overkill for role-based access |

**Not recommended because:** Adds operational complexity; our access patterns are straightforward role-based with county scoping.

---

### Option 4: Embedded Permissions + User Service for Management (RECOMMENDED)

IdP authenticates users. User Service stores roles and provides claims at login. Permissions are embedded in JWT. Domain APIs validate JWT and read claims directly.

| Pros | Cons |
|------|------|
| No runtime User Service calls | Permission changes require token refresh |
| Standard JWT validation | Token may contain many claims |
| User Service manages domain-specific data | Two systems to maintain (IdP + User Service) |
| Clear separation of concerns | |
| Scalable (stateless API requests) | |

**Recommended because:** Best balance of performance, flexibility, and operational simplicity.

---

## Rationale

| Factor | Benefit |
|--------|---------|
| **Separation of concerns** | IdP handles authentication; User Service handles authorization context |
| **No runtime dependency** | Domain APIs don't call User Service per request; permissions in JWT |
| **Multi-tenant support** | User Service manages county assignments naturally |
| **Domain entity linking** | User.personId and User.caseWorkerId enable scoped access |
| **Audit compliance** | User Service maintains permission change history |
| **Vendor independence** | Works with any IdP that supports JWT and token enrichment |

---

## Consequences

### Positive

- Domain APIs are stateless and performant (no external auth calls)
- Clear separation between identity (IdP) and authorization (User Service)
- Multi-county staff supported via counties array in JWT
- Applicants and staff handled with same pattern (different roles, same flow)
- User Service can be implemented independently of domain services

### Negative

- Permission changes not immediate (requires token refresh)
- JWT may grow large with many permissions
- Two systems to maintain (IdP + User Service)
- IdP must be configured to call User Service during login

### Mitigations

| Concern | Mitigation |
|---------|------------|
| Stale permissions | Short token TTL (15-60 min); force re-login for role changes |
| Large JWT | Use permission categories vs. granular permissions; compress if needed |
| IdP configuration | Document integration patterns for common IdPs (Auth0, Okta) |

---

## User Service Scope

The User Service is intentionally minimal:

**Included:**
- User CRUD (linked to IdP identity)
- Role and county assignments
- Token claims endpoint (called by IdP at login)
- Current user endpoint (called by frontend on load)
- Audit log of permission changes

**Excluded (belong in other domains):**
- CaseWorker details (skills, team, workload) → Case Management
- Person details → Intake domain
- Work assignments → Workflow domain

---

## Implementation

### Files Added

| File | Purpose |
|------|---------|
| `docs/architecture/cross-cutting/identity-access.md` | JWT claims, permissions, data scoping patterns |
| `docs/architecture-decisions/adr-auth-patterns.md` | This ADR |
| `packages/schemas/openapi/users.yaml` | User Service API specification |
| `packages/schemas/openapi/components/user.yaml` | User schema components |

### Shared Components Added

| File | Components | Purpose |
|------|------------|---------|
| `components/common.yaml` | `AuthorizationClaims`, `JwtClaims`, `RoleType` | JWT structure and role definitions |
| `components/common-responses.yaml` | `Unauthorized`, `Forbidden` | Auth error responses (401, 403) |

### Integration Points

**Token Enrichment Flow:**

When a user logs in, the IdP needs to embed authorization claims in the JWT. This happens during OAuth token issuance:

1. User authenticates with IdP (Auth0, Okta, etc.)
2. IdP calls User Service to get authorization context
3. User Service returns role, permissions, and county assignments
4. IdP embeds these claims in the JWT it issues
5. Domain APIs read permissions directly from JWT (no runtime calls)

**IdP → User Service:**
```
GET /token/claims/{sub}
X-API-Key: <idp-api-key>

Response: { "userId": "...", "role": "case_worker", "permissions": [...], "counties": [...] }
```

The API key shown above is an example. Teams should use whatever authentication method makes sense for their IdP integration (API key, OAuth2 client credentials, mTLS, etc.).

**Frontend → User Service:**
```
GET /users/me
Authorization: Bearer <jwt>
Response: Full user profile including preferences
```

**Domain APIs → JWT:**
```python
# No User Service call - read from JWT
claims = validate_jwt(request.headers["Authorization"])
if "applications:read" not in claims["permissions"]:
    raise Forbidden()
```

---

## Security Schemes

The default security scheme is JWT bearer authentication:

```yaml
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

security:
  - bearerAuth: []
```

Different security schemes are supported either per state (via overlays) or per API, depending on requirements. For example, the User Service uses `apiKeyAuth` for the `/token/claims/{sub}` endpoint since it's a machine-to-machine call from the IdP before a JWT exists.

---

## Frontend Authorization Pattern

The `ui` object on the User model provides computed flags for frontend feature toggling. This keeps authorization logic on the backend while giving frontends a simple API for showing/hiding features.

### Options Considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| 1. Modules + action flags | Backend computes both modules and specific actions | Simple frontend, single source of truth | More fields to maintain |
| 2. Modules only | Backend returns modules; frontend checks permissions array | Simpler schema | Permission logic duplicated in frontend |
| 3. Raw permissions only | Frontend parses permissions array for everything | Minimal backend work | Complex frontend logic, inconsistent |

### Recommendation

**Option 1: Modules + action flags**

Authorization logic belongs on the backend. The `permissions` array is for API enforcement; the `ui` object is for frontend feature toggling. This separation ensures:

- Frontends don't need to understand permission string patterns
- Changes to permission structure don't break frontend logic
- UI-specific concepts (modules, feature flags) are explicit, not inferred

See [Identity & Access: Frontend Authorization](../architecture/cross-cutting/identity-access.md#frontend-authorization) for implementation details.

### Open Question: UiPermissions Structure

The current `UiPermissions` schema uses flat boolean flags (Option 1). This is simple but may not scale well. We need to decide on a structure before the schema stabilizes.

**Structures under consideration:**

```yaml
# Option 1: Flat booleans (current)
ui:
  availableModules: [cases, tasks, reports]
  canApproveApplications: true
  canViewSensitivePII: false
  canExportData: true

# Option 2: Nested by module
ui:
  modules:
    cases:
      enabled: true
      actions: [approve, export]
    admin:
      enabled: true
      actions: [manage_users]

# Option 3: Capabilities array
ui:
  modules: [cases, tasks, reports]
  capabilities: [approve_applications, view_pii, export_data]

# Option 4: Flat booleans + custom field
ui:
  availableModules: [cases, tasks]
  canApproveApplications: true
  custom:
    betaFeatures: true
```

**Trade-offs:**

| Option | Simplicity | Extensibility | Type Safety |
|--------|------------|---------------|-------------|
| 1. Flat booleans | High | Low | High |
| 2. Nested by module | Medium | High | High |
| 3. Capabilities array | Medium | High | Lower |
| 4. Flat + custom field | High | Medium | Mixed |

**Decision needed:** Which option best balances simplicity for initial adopters against extensibility for future growth?

---

## Alternative Authentication Mechanisms

The default approach uses JWT bearer tokens with embedded claims. States using different authentication mechanisms can adapt the patterns via the overlay system.

### What Changes by Auth Type

| Auth Mechanism | Token Enrichment Endpoint | Domain API Auth Pattern | Security Scheme |
|----------------|---------------------------|-------------------------|-----------------|
| **JWT (default)** | Used - IdP calls at login | Read claims from JWT | `bearerAuth` |
| **Session cookies** | Not needed | Permissions in session store, or runtime User Service calls | `cookieAuth` |
| **API keys** | Not needed | Runtime User Service calls per request | `apiKeyAuth` |
| **SAML** | Adapted for assertion | Session established after SAML assertion | `cookieAuth` or custom |

### Key Differences Without JWT

1. **Permission retrieval** - Without JWT claims, domain APIs need runtime calls to User Service (Option 2 trade-off: added latency, but always current permissions)
2. **`/token/claims/{sub}` endpoint** - Only needed for JWT enrichment flows; states not using JWT can remove it via overlay
3. **Security scheme** - Must be replaced in all API specs
4. **Frontend auth handling** - With session cookies, the browser manages authentication automatically (no token storage or refresh logic needed); `GET /users/me` still provides the user profile and `ui` permissions object

### Overlay Support

The overlay system can customize authentication for a state:

```yaml
# Example: State using session-based auth instead of JWT
actions:
  # Replace security scheme
  - target: $.components.securitySchemes
    file: users.yaml
    update:
      cookieAuth:
        type: apiKey
        in: cookie
        name: SESSION_ID
        description: Session cookie from state IdP

  # Update global security requirement
  - target: $.security
    file: users.yaml
    update:
      - cookieAuth: []

  # Remove JWT-specific endpoint (if not needed)
  - target: $.paths./token/claims/{sub}
    file: users.yaml
    remove: true

  # Add session validation endpoint (if needed)
  - target: $.paths./session/validate
    file: users.yaml
    update:
      get:
        summary: Validate session and return permissions
        # ...
```

### What Stays the Same

Regardless of auth mechanism:

- **User Service** still stores role/permission mappings
- **Separation of concerns** - IdP handles authentication, User Service handles authorization context
- **Permission model** - `{resource}:{action}` format, role-based with county scoping
- **Frontend pattern** - `GET /users/me` returns user profile with `ui` permissions object

---

## References

- [Identity & Access Documentation](../architecture/cross-cutting/identity-access.md)
- [User Service API Specification](../../packages/schemas/openapi/users.yaml)
- [Auth0 Actions](https://auth0.com/docs/customize/actions) - Example IdP integration
- [Okta Hooks](https://developer.okta.com/docs/concepts/event-hooks/) - Example IdP integration
- [JWT RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519)
