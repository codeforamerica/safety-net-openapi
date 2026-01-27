# Identity & Access

Authentication, authorization, and user management patterns for the Safety Net Benefits API.

See also: [ADR: Auth Patterns](../../architecture-decisions/adr-auth-patterns.md) | [User Service API](../../../packages/schemas/openapi/users.yaml)

---

## Overview

Identity and access management uses three components:

| Component | Responsibility |
|-----------|----------------|
| **Identity Provider (IdP)** | Authentication - "Who are you?" (login, MFA, sessions) |
| **User Service** | Authorization context - "What can you do?" (roles, permissions, county access) |
| **Domain APIs** | Authorization enforcement - Apply permissions to data access |

```
┌─────────────────────────────────────────────────────────────────┐
│                    Identity Provider (IdP)                      │
│  Auth0, Okta, Keycloak, AWS Cognito, etc.                      │
│  - Authenticates users (login, MFA, SSO)                       │
│  - Issues JWTs                                                  │
│  - Calls User Service to enrich tokens                         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ JWT with embedded claims
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         User Service                            │
│  - Stores role and county assignments                          │
│  - Provides claims for JWT enrichment at login                 │
│  - Manages user lifecycle (invite, activate, deactivate)       │
│  - Links users to domain entities (Person, CaseWorker)         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ Permissions flow through JWT
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Domain APIs                              │
│  - Validate JWT signature                                       │
│  - Read permissions from claims                                 │
│  - Filter data by county/user scope                            │
│  - No runtime calls to User Service                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## JWT Claims

Domain APIs expect these claims in the JWT. The IdP embeds them by calling the User Service during login.

**Schema definitions:**
- Full JWT structure: [`common.yaml#/JwtClaims`](../../../packages/schemas/openapi/components/common.yaml)
- Authorization claims only: [`common.yaml#/AuthorizationContext`](../../../packages/schemas/openapi/components/common.yaml)
- Role enum: [`common.yaml#/RoleType`](../../../packages/schemas/openapi/components/common.yaml)

### Claims Structure

```yaml
# Standard claims (from IdP)
sub: string           # Unique user identifier from IdP
iss: string           # Token issuer (IdP URL)
aud: string           # Intended audience (API identifier)
exp: integer          # Expiration timestamp
iat: integer          # Issued-at timestamp

# Identity claims
email: string
name: string

# Authorization claims (from User Service via AuthorizationContext schema)
userId: uuid          # User Service ID
role: RoleType        # Authorization role (see below)
permissions: string[] # Explicit permission grants
countyCode: string    # Primary county (for staff)
counties: string[]    # All accessible counties
organizationId: uuid  # Organization/agency

# Domain links
personId: uuid        # If user is an applicant (links to Person)
caseWorkerId: uuid    # If user is staff (links to CaseWorker, when implemented)
```

### Example JWT Payload

```json
{
  "sub": "auth0|507f1f77bcf86cd799439011",
  "iss": "https://your-tenant.auth0.com/",
  "aud": "https://api.safetynet.example.com",
  "exp": 1706300000,
  "iat": 1706296400,
  "email": "jane.smith@alameda.gov",
  "name": "Jane Smith",
  "userId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "role": "case_worker",
  "permissions": [
    "applications:read",
    "applications:create",
    "applications:update",
    "persons:read",
    "households:read"
  ],
  "countyCode": "06001",
  "counties": ["06001"],
  "caseWorkerId": "b2c3d4e5-f6a7-8901-bcde-f12345678901"
}
```

---

## Roles

Roles determine base permissions and data scoping.

| Role | Description | Data Scope |
|------|-------------|------------|
| `applicant` | Self-service access to own applications | Own records only (by personId) |
| `case_worker` | Process applications for assigned county | Assigned county |
| `supervisor` | Oversee case workers, approve determinations | Assigned counties (may have multiple) |
| `county_admin` | Administer county staff | Assigned county |
| `state_admin` | Statewide oversight and administration | All counties |
| `partner_readonly` | External partner with limited read access | Per agreement |

### Role Hierarchy

```
state_admin
    │
    ├── county_admin
    │       │
    │       └── supervisor
    │               │
    │               └── case_worker
    │
    └── partner_readonly

applicant (separate hierarchy - self-service only)
```

---

## Permissions

Permission strings follow the pattern `{resource}:{action}`.

### Resources

Resources align with API resources:

- `applications`
- `persons`
- `households`
- `incomes`
- `users` (for admin operations)

### Actions

| Action | HTTP Method | Description |
|--------|-------------|-------------|
| `read` | GET | View resources |
| `create` | POST | Create new resources |
| `update` | PATCH | Modify existing resources |
| `delete` | DELETE | Remove resources |
| `approve` | POST | Approve/deny (status changes) |
| `export` | GET | Bulk data export |

### Permission Examples

```yaml
# Application permissions
applications:read       # View applications (scoped by county)
applications:create     # Submit new applications
applications:update     # Modify existing applications
applications:delete     # Remove applications (soft delete)
applications:approve    # Change status to approved/denied

# Person permissions
persons:read            # View person records
persons:read:pii        # View sensitive PII (SSN unmasked)
persons:create          # Create person records
persons:update          # Modify person records

# User management (admin)
users:read              # View user accounts
users:create            # Create user accounts
users:update            # Modify roles and assignments
users:deactivate        # Deactivate user accounts
```

### Role-to-Permission Mapping

| Role | Permissions | Scoping |
|------|-------------|---------|
| `applicant` | applications:read, applications:create, applications:update, persons:read, households:read, incomes:read, incomes:create | Own records (personId) |
| `case_worker` | applications:*, persons:*, households:*, incomes:* | Assigned county |
| `supervisor` | All of case_worker + applications:approve, persons:read:pii, users:read | Assigned counties |
| `county_admin` | All of supervisor + users:create, users:update, applications:delete | Assigned county |
| `state_admin` | All permissions | All counties |
| `partner_readonly` | applications:read, persons:read | Per agreement |

---

## User vs Domain Entities

The User Service manages authentication/authorization identity. Domain-specific details live in domain entities.

### User (User Service)

```yaml
User:
  id: uuid
  idpSubject: string      # Links to IdP
  email: string
  name: string
  role: enum              # Authorization role
  permissions: string[]   # Computed from role
  counties: string[]      # Data access scope
  status: enum            # active, inactive, pending, suspended

  # Links to domain entities
  personId: uuid          # If applicant
  caseWorkerId: uuid      # If staff (future)
```

### Future: CaseWorker (Case Management Domain)

When the Case Management domain is implemented, staff users will link to a CaseWorker record:

```yaml
CaseWorker:
  id: uuid
  name: string
  employeeId: string
  role: enum              # Job function (intake_worker, eligibility_worker, etc.)
  skills: Skill[]         # Certifications, languages
  programs: enum[]        # Programs certified to work
  teamId: uuid
  supervisorId: uuid
  officeId: uuid
  workloadCapacity: integer
```

**Key distinction:**

| Concern | User (User Service) | CaseWorker (Case Management) |
|---------|---------------------|------------------------------|
| "Can they log in?" | Yes | N/A |
| "What data can they see?" | permissions, counties | N/A |
| "What's their job function?" | N/A | role (eligibility_worker) |
| "What are their skills?" | N/A | skills, programs |
| "Who's their supervisor?" | N/A | supervisorId |
| "What's their workload?" | N/A | Caseload entity |

---

## Data Scoping

Domain APIs filter data based on JWT claims.

### By County (Staff)

```python
# Pseudocode for list endpoint
def list_applications(request):
    claims = request.jwt_claims

    if "applications:read" not in claims["permissions"]:
        raise Forbidden()

    query = db.query(Application)

    # Scope by county unless state_admin
    if claims["role"] != "state_admin":
        query = query.filter(
            Application.countyCode.in_(claims["counties"])
        )

    return query.all()
```

### By User (Applicants)

```python
def list_applications(request):
    claims = request.jwt_claims

    if claims["role"] == "applicant":
        # Applicants only see their own applications
        query = query.filter(
            Application.applicantPersonId == claims["personId"]
        )

    return query.all()
```

---

## Authentication Flow

### Staff Login

1. User authenticates via IdP (login page, SSO)
2. IdP calls User Service: `POST /token/claims` with `sub` from authentication
3. User Service returns role, permissions, counties, caseWorkerId
4. IdP embeds claims in JWT and returns to user
5. Frontend stores JWT and calls `GET /users/me` for full profile
6. Subsequent API calls include JWT in Authorization header

### Applicant Login

1. User authenticates via IdP
2. IdP calls User Service: `POST /token/claims`
3. User Service returns role=applicant, personId, limited permissions
4. Applicant accesses self-service portal with scoped access

### New User Provisioning

1. Admin creates user in IdP (or user self-registers)
2. Admin creates User record in User Service with role and county assignments
3. (For staff) Admin creates CaseWorker record in Case Management and links to User
4. User logs in; IdP enriches JWT from User Service

---

## Security Considerations

### Token Security

- JWTs should have short expiration (15-60 minutes)
- Use refresh tokens for longer sessions
- Validate JWT signature on every request
- Check `aud` claim matches your API

### PII Protection

- `persons:read:pii` permission required for unmasked SSN
- Audit log access to sensitive fields
- Consider field-level encryption for SSN at rest

### Audit Trail

The User Service maintains an audit log of:
- User creation and deactivation
- Role changes
- County assignment changes
- Permission modifications

---

## Frontend Authorization

The `ui` object on the User provides computed flags for frontend feature toggling. This keeps authorization logic on the backend while giving frontends a simple API.

### Why Not Use `permissions` Directly?

The `permissions` array (`applications:read`, `persons:read:pii`, etc.) is designed for API enforcement, not frontend logic. Problems with parsing it in the frontend:

- Permission strings may change format
- Complex conditions (e.g., "can approve" requires role + permission + county)
- Frontend duplicates authorization logic
- Inconsistent implementations across apps

### The `ui` Object

```yaml
ui:
  availableModules: [cases, tasks, documents]  # Which nav items to show
  canApproveApplications: true                  # Show approve button
  canViewSensitivePII: false                    # Mask SSN fields
  canExportData: true                           # Show export button
  canManageUsers: false                         # Hide admin section
  canImpersonate: false                         # Hide impersonation feature
```

### Example Response

`GET /users/me` returns the full user profile including `ui`:

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "email": "jane.smith@alameda.gov",
  "name": "Jane Smith",
  "role": "supervisor",
  "permissions": [
    "applications:read",
    "applications:approve",
    "persons:read",
    "persons:read:pii"
  ],
  "ui": {
    "availableModules": ["cases", "tasks", "reports", "documents"],
    "canApproveApplications": true,
    "canViewSensitivePII": true,
    "canExportData": false,
    "canManageUsers": false,
    "canImpersonate": false
  }
}
```

### Frontend Usage

```typescript
// React example
function AppShell({ user }: { user: User }) {
  return (
    <nav>
      {user.ui.availableModules.includes('cases') && <CasesLink />}
      {user.ui.availableModules.includes('admin') && <AdminLink />}
    </nav>
  );
}

function ApplicationDetail({ application, user }: Props) {
  return (
    <div>
      <h1>{application.name}</h1>
      <SSNField
        value={application.ssn}
        masked={!user.ui.canViewSensitivePII}
      />
      {user.ui.canApproveApplications && (
        <ApproveButton applicationId={application.id} />
      )}
    </div>
  );
}
```

### Relationship to `permissions`

| Field | Purpose | Consumer |
|-------|---------|----------|
| `permissions` | API enforcement | Backend APIs |
| `ui` | Feature toggling | Frontend apps |

The backend computes `ui` from `role` and `permissions`. Frontends should never parse `permissions` directly for UI decisions.

---

## Related Documents

| Document | Description |
|----------|-------------|
| [ADR: Auth Patterns](../../architecture-decisions/adr-auth-patterns.md) | Decision record for auth approach |
| [User Service API](../../../packages/schemas/openapi/users.yaml) | OpenAPI specification |
| [Common Schemas](../../../packages/schemas/openapi/components/common.yaml) | JwtClaims, AuthorizationContext, RoleType |
| [User Schemas](../../../packages/schemas/openapi/components/user.yaml) | User, Role, UserStatus, UserPreferences |
