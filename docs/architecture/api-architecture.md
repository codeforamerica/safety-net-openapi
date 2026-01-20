# API Architecture

How the Safety Net Benefits API is organized, layered, and operated.

See also: [Domain Design](domain-design.md) | [Design Decisions](design-decisions.md) | [Roadmap](roadmap.md)

---

## 1. API Layer Organization

Following API-led connectivity principles, APIs are organized into layers.

### System APIs vs Process APIs

| Layer | Purpose | Style | Example |
|-------|---------|-------|---------|
| **System APIs** | Direct access to domain data | RESTful CRUD | `GET /tasks/{id}`, `POST /applications` |
| **Process APIs** | Orchestrate business operations | RPC-style actions | `POST /processes/workflow/tasks/claim` |

**Key distinctions:**
- **System APIs** own canonical schemas and provide granular CRUD operations on resources
- **Process APIs** call multiple System APIs to perform business operations; they don't access data directly
- Process APIs define purpose-built request/response DTOs optimized for specific use cases

### Folder Structure

```
openapi/
├── domains/                              # System APIs (resource-based)
│   ├── workflow/
│   │   ├── tasks.yaml
│   │   ├── queues.yaml
│   │   └── components/schemas.yaml       # Canonical schemas
│   ├── case-management/
│   ├── intake/
│   └── eligibility/
│
├── processes/                            # Process APIs (domain/resource/action)
│   ├── workflow/
│   │   ├── tasks/
│   │   │   ├── claim.yaml
│   │   │   ├── complete.yaml
│   │   │   └── reassign.yaml
│   │   └── verification/
│   │       ├── start.yaml
│   │       └── complete.yaml
│   ├── case-management/
│   │   ├── workers/
│   │   │   └── assign.yaml
│   │   └── cases/
│   │       └── transfer.yaml
│   ├── communication/
│   │   └── notices/
│   │       └── send.yaml
│   └── components/schemas.yaml           # Process-specific DTOs
│
└── components/                           # Shared primitives (Address, Name, etc.)
```

### Process API Organization

Process APIs are organized **by domain, then resource, then action**:

```
/processes/{domain}/{resource}/{action}
```

**Examples:**
```
/processes/workflow/tasks/claim
/processes/workflow/tasks/complete
/processes/workflow/verification/start
/processes/case-management/workers/assign
/processes/case-management/cases/transfer
/processes/communication/notices/send
```

**Convention:** When an operation involves multiple resources, place it under **the resource being acted upon** (not the primary output). This matches natural language and improves discoverability:

| Operation | Resource acted upon | Path |
|-----------|---------------------|------|
| Claim a task | Task | `/processes/workflow/tasks/claim` |
| Assign a worker | Worker | `/processes/case-management/workers/assign` |
| Transfer a case | Case | `/processes/case-management/cases/transfer` |
| Send a notice | Notice | `/processes/communication/notices/send` |

**Metadata:** Each operation includes actor and capability metadata:

```yaml
# processes/workflow/tasks/claim.yaml
post:
  x-actors: [caseworker]          # Who can call this
  x-capability: task-management   # Business capability
```

### What This Repo Provides

| Asset | Purpose | State Usage |
|-------|---------|-------------|
| Domain architecture | Patterns, entity relationships, terminology | Adopt/adapt |
| System API specs | Base schemas + overlay support | Extend via overlays |
| Process API contracts | Interface definitions (inputs/outputs) | Implement against |
| Mock System APIs | Testing tool | Use for development/testing |
| Reference implementations | Educational examples (TypeScript) | Learn from, don't extend |

**Important:** Reference implementations are examples, not production code to extend. States implement Process APIs from the contracts in their preferred language.

### Mock Server Scope

The mock server provides dynamic responses for **System APIs only**:
- Reads OpenAPI specs and examples
- Maintains mock database state
- Supports CRUD operations

Process APIs are **not mocked** because:
- Process APIs are orchestration logic—that's what you want to test
- Real Process API implementations call mock System APIs during development
- States implement Process APIs; this repo provides the contracts

---

## 2. Vendor Independence

This architecture helps states avoid vendor lock-in when procuring backend systems (workflow management, case management, etc.).

### Adapter Pattern

```
┌─────────────────────────────────────────────────────────┐
│  Process APIs (state's business logic)                  │
│  - Implements eligibility, orchestration                │
│  - Calls System API contracts, NOT vendor APIs          │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  System API Contracts (this repo's OpenAPI specs)       │
│  - Canonical domain model (Task, Case, Application)     │
│  - Vendor-agnostic interface                            │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Adapter Layer (thin, replaceable)                      │
│  - Maps vendor data ↔ canonical model                   │
│  - Implements System API contract                       │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Vendor System (workflow tool, case mgmt, etc.)         │
└─────────────────────────────────────────────────────────┘
```

### Impact of Switching Vendors

| Layer | Impact |
|-------|--------|
| Process APIs | No change |
| System API Contracts | No change |
| Adapter Layer | Rewrite for new vendor |
| Vendor System | Replace |

### Guidance for States

1. **Never call vendor APIs directly from Process APIs** - always go through the System API layer
2. **Keep adapters thin** - translation only, no business logic
3. **Domain model is source of truth** - vendor models map to yours, not vice versa
4. **Test against mocks** - proves your code isn't secretly coupled to a vendor

---

## 3. Operational Architecture

### Configuration Management

**Principle:** If a policy analyst needs to change it, it's configuration. If a developer needs to change it, it's code.

**Business-configurable settings:**

| Configurable | Example | Changed By |
|--------------|---------|------------|
| Workflow rules | Assignment rules, priority rules | Program managers |
| Eligibility thresholds | Income limits, asset limits, FPL percentages | Policy analysts |
| SLA timelines | Days to process, warning thresholds | Operations managers |
| Notice templates | Content, formatting | Communications staff |
| Feature flags | Enable/disable programs, pilots | Product owners |
| Business calendars | Holidays, office hours | Office managers |

**Architecture:**

```
┌─────────────────────────────────────────────┐
│  Admin UI (for business users)              │
└───────────────────────┬─────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────┐
│  Admin/Config APIs                          │
│  - GET/PUT /config/eligibility-thresholds   │
│  - GET/PUT /config/workflow-rules           │
│  - GET/PUT /config/sla-settings             │
└───────────────────────┬─────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────┐
│  Config Store (versioned, audited)          │
└─────────────────────────────────────────────┘
```

**Key requirements:**
- All configuration changes are audited (who changed what, when)
- Configuration is versioned (rollback capability)
- Changes take effect without deployment
- Validation prevents invalid configurations

### Observability

**For operations staff to monitor and support the APIs:**

| Capability | Purpose | Standard |
|------------|---------|----------|
| Health endpoints | Is the system up? | `GET /health`, `GET /ready` |
| Metrics | Request rates, latencies, error rates | Prometheus format |
| Structured logging | Searchable, consistent format | JSON with correlation IDs |
| Distributed tracing | Follow requests across APIs | OpenTelemetry |
| Audit logs | Who did what when | Domain events (e.g., TaskAuditEvent) |
| Alerting hooks | Integration with incident management | Webhooks, PagerDuty, etc. |

**Standard endpoints for all APIs:**

```yaml
/health:
  get:
    summary: Liveness check
    responses:
      200: { description: Service is running }

/ready:
  get:
    summary: Readiness check (dependencies healthy)
    responses:
      200: { description: Service is ready to accept traffic }
      503: { description: Service is not ready }

/metrics:
  get:
    summary: Prometheus metrics
    responses:
      200: { description: Metrics in Prometheus format }
```

**Logging standards:**
- All logs include correlation ID for request tracing
- Structured JSON format for searchability
- Standard fields: timestamp, level, service, correlationId, message
- PII is masked or excluded from logs

**Key SLI Metrics (API-level):**

| Metric | Description | Target |
|--------|-------------|--------|
| `process_api_latency_seconds` | Process API response time (p50, p95, p99) | p95 < 500ms |
| `system_api_latency_seconds` | System API response time (p50, p95, p99) | p95 < 200ms |
| `error_rate` | API error rate by endpoint (4xx, 5xx) | < 1% |
| `availability` | Service uptime percentage | 99.9% |

Domain-specific metrics (task completion time, SLA breach rate, etc.) are documented in domain files. See [Workflow Operational Metrics](domains/workflow.md#operational-metrics).

### Performance

**Caching:**

| Data Type | TTL | Rationale |
|-----------|-----|-----------|
| TaskType (config) | 5 minutes | Rarely changes, high read volume |
| SLAType (config) | 5 minutes | Rarely changes, used in every task |
| WorkflowRule (config) | 1 minute | May be updated by admins |
| Queue (config) | 1 minute | May be updated by admins |
| User session/permissions | 5 minutes | Balance security vs performance |

**Pagination:**
- Default limit: 25 items
- Maximum limit: 100 items
- Clients requesting more than 100 receive 100

**Query Complexity:**
- JSON Logic rules (WorkflowRule.conditions) are limited to:
  - Maximum depth: 5 levels of nesting
  - Maximum operations: 20 logical operators per rule
  - Evaluation timeout: 100ms
- Search queries (`q` parameter) are limited to 10 filter conditions

### Reliability

**Idempotency:**
All state-changing operations support idempotent retries. See [api-patterns.yaml](../../packages/schemas/openapi/patterns/api-patterns.yaml#idempotency) for implementation details.

**Circuit Breakers:**
Circuit breakers protect the system when external dependencies fail. See [api-patterns.yaml](../../packages/schemas/openapi/patterns/api-patterns.yaml#circuit-breakers) for configuration.

Key circuit breaker locations:
- External verification sources (IRS, SSA, state databases)
- Vendor system adapters (workflow tools, case management systems)
- Notice delivery services (email, SMS, postal)

### Security

**Data Classification:**

All API fields are classified for appropriate handling. See [api-patterns.yaml](../../packages/schemas/openapi/patterns/api-patterns.yaml#data-classification) for the full taxonomy.

| Classification | Description | Example Fields |
|----------------|-------------|----------------|
| `pii` | Personally Identifiable Information | SSN, DOB, name, address |
| `sensitive` | Sensitive but not PII | income, case notes, medical info |
| `internal` | Internal operational data | assignedToId, queueId, timestamps |
| `public` | Non-sensitive reference data | programType, taskTypeCode, status |

**PII Handling:**
- PII is encrypted at rest
- PII is masked in logs (last 4 digits only for SSN)
- PII access is logged for audit
- PII fields are excluded from search indexes

### Compliance

**Data Retention:**
See [Roadmap - Data Retention](roadmap.md#needs-architecture-documentation) for retention periods by data type.

**Right to Deletion:**
- Deletion requests must balance client rights against audit requirements
- Application data may be anonymized rather than deleted if audit trail is required
- States must document their deletion process per program requirements

**Regulatory References:**
- SNAP: 7 CFR 272.1 (record retention)
- Medicaid: 42 CFR 431.17 (records and reports)
- TANF: 45 CFR 265.2 (data collection)
- HIPAA: Applies to Medicaid-related health information
- FERPA: May apply when education data is used for eligibility

*Note:* Detailed compliance mapping is state-specific. States should map these requirements to their specific field-level handling.

---

## 4. Quality Attributes Summary

This section provides a central index of architectural quality attributes (-ilities) and where each is documented.

| Quality Attribute | Status | Documentation Location |
|-------------------|--------|------------------------|
| **Reliability** | | |
| Idempotency | Addressed | [api-patterns.yaml](../../packages/schemas/openapi/patterns/api-patterns.yaml#idempotency) |
| Circuit breakers | Addressed | [api-patterns.yaml](../../packages/schemas/openapi/patterns/api-patterns.yaml#circuit-breakers) |
| Error handling | Addressed | [api-patterns.yaml](../../packages/schemas/openapi/patterns/api-patterns.yaml#error-handling) |
| Long-running operations | Addressed | [api-patterns.yaml](../../packages/schemas/openapi/patterns/api-patterns.yaml#long-running-operations) |
| **Security** | | |
| Authentication | Addressed | [api-patterns.yaml](../../packages/schemas/openapi/patterns/api-patterns.yaml#authentication) |
| Authorization (RBAC/ABAC) | Addressed | [api-patterns.yaml](../../packages/schemas/openapi/patterns/api-patterns.yaml#authorization) |
| Data classification | Addressed | [api-patterns.yaml](../../packages/schemas/openapi/patterns/api-patterns.yaml#data-classification) |
| Security headers | Addressed | [api-patterns.yaml](../../packages/schemas/openapi/patterns/api-patterns.yaml#security-headers) |
| Audit logging | Addressed | [api-patterns.yaml](../../packages/schemas/openapi/patterns/api-patterns.yaml#audit-logging) |
| **Performance** | | |
| Caching | Addressed | [api-architecture.md](#performance) (this file) |
| Pagination | Addressed | [api-patterns.yaml](../../packages/schemas/openapi/patterns/api-patterns.yaml#list-endpoints) |
| Rate limiting | Addressed | [api-patterns.yaml](../../packages/schemas/openapi/patterns/api-patterns.yaml#rate-limiting) |
| Query complexity limits | Addressed | [api-architecture.md](#performance) (this file) |
| **Observability** | | |
| Health endpoints | Addressed | [api-architecture.md](#observability) (this file) |
| Metrics (API-level) | Addressed | [api-architecture.md](#observability) (this file) |
| Metrics (domain-specific) | Addressed | [workflow.md](domains/workflow.md#operational-metrics) |
| Correlation IDs | Addressed | [api-patterns.yaml](../../packages/schemas/openapi/patterns/api-patterns.yaml#correlation-ids) |
| Distributed tracing | Addressed | [api-architecture.md](#observability) (this file) |
| **Compliance** | | |
| Data retention | Partially addressed | [roadmap.md](roadmap.md#needs-architecture-documentation) |
| Right to deletion | Addressed | [api-architecture.md](#compliance) (this file) |
| Regulatory references | Addressed | [api-architecture.md](#compliance) (this file) |
| **Interoperability** | | |
| API versioning | Addressed | [api-patterns.yaml](../../packages/schemas/openapi/patterns/api-patterns.yaml#versioning) |
| ETags/concurrency | Addressed | [api-patterns.yaml](../../packages/schemas/openapi/patterns/api-patterns.yaml#etags) |
| Vendor independence | Addressed | [api-architecture.md](#2-vendor-independence) (this file) |
| **Maintainability** | | |
| Configuration management | Addressed | [api-architecture.md](#configuration-management) (this file) |
| Schema patterns | Addressed | [api-patterns.yaml](../../packages/schemas/openapi/patterns/api-patterns.yaml#schema-patterns) |

---

## Related Resources

- [api-patterns.yaml](../../packages/schemas/openapi/patterns/api-patterns.yaml) - Detailed API design patterns including security, error handling, versioning
- [Domain Design](domain-design.md) - Domain organization and entity relationships
- [Design Decisions](design-decisions.md) - Rationale for architectural choices
