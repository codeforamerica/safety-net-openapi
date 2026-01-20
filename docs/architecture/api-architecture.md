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
| **Process APIs** | Orchestrate business operations | RPC-style actions | `POST /processes/applications/submit` |

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
├── processes/                            # Process API contracts (use-case-based)
│   ├── applications/
│   │   ├── submit.yaml
│   │   └── withdraw.yaml
│   ├── eligibility/
│   │   └── determine.yaml
│   ├── tasks/
│   │   └── bulk-reassign.yaml
│   └── components/schemas.yaml           # Process-specific DTOs
│
└── components/                           # Shared primitives (Address, Name, etc.)
```

### Process API Organization

Process APIs are organized **by capability** (not by actor), with actor metadata:

```yaml
# processes/applications/submit.yaml
x-actors: [client, caseworker]    # Who can call this
x-capability: application-intake
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

---

## Related Resources

- [api-patterns.yaml](../../packages/schemas/openapi/patterns/api-patterns.yaml) - Detailed API design patterns including security, error handling, versioning
- [Domain Design](domain-design.md) - Domain organization and entity relationships
- [Design Decisions](design-decisions.md) - Rationale for architectural choices
