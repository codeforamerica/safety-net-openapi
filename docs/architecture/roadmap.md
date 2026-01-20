# Roadmap

Migration plan, implementation phases, future considerations, and documentation gaps.

See also: [Domain Design](domain-design.md) | [API Architecture](api-architecture.md) | [Design Decisions](design-decisions.md)

---

## 1. Migration Considerations

### Current Schema Mapping

| Current Entity | Proposed Domain | Proposed Entity | Notes |
|----------------|-----------------|-----------------|-------|
| Person | Client Management | Client | Rename - "Client" indicates someone we serve |
| Household | Split | LivingArrangement (Client Mgmt/Intake) + EligibilityUnit (Eligibility) | Separate factual from regulatory |
| Application | Intake | Application | Move to Intake domain |
| HouseholdMember | Intake | Person | Simplify name, domain provides context |
| Income | Split | Income (Client Mgmt - stable) + Income (Intake - reported) | Split by stability |

### New Entities Needed

| Entity | Domain | Priority |
|--------|--------|----------|
| Task | Workflow | High |
| CaseWorker | Case Management | High |
| Supervisor | Case Management (extends CaseWorker) | High |
| Notice | Communication | High |
| Case | Case Management | Medium |
| EligibilityRequest | Eligibility | Medium |
| EligibilityUnit | Eligibility | Medium |
| Determination | Eligibility | Medium |
| LivingArrangement | Client Management / Intake | Medium |
| Appointment | Scheduling | Low |
| Document | Document Management | Low |

---

## 2. Implementation Phases

### Phase 1: Workflow & Case Management (Priority)
1. Create Workflow domain (Task, VerificationTask, TaskAuditEvent)
2. Create Case Management domain (CaseWorker, Assignment)
3. Create Communication entities (Notice) - cross-cutting, consumed by multiple domains

### Phase 2: Domain Reorganization
1. Restructure existing schemas into domain folders
2. Create Client Management domain (rename Person → Client)
3. Create Intake domain (reorganize Application)
4. Create Eligibility domain (EligibilityUnit, EligibilityRequest, Determination)

### Phase 3: Additional Domains
1. Create Scheduling domain
2. Create Document Management domain

---

## 3. Future Considerations

Potential domains and functionality not included in the current design, for future evaluation.

### High Priority

**Benefits/Issuance**
- Benefit amounts and calculations
- EBT card issuance and management
- Payment tracking
- Benefit history and adjustments

*Rationale*: Core to safety net programs - what happens after eligibility is determined. Currently out of scope but essential for end-to-end benefits administration.

**Appeals**
- Appeal requests
- Fair hearing scheduling
- Hearing outcomes and decisions
- Appeal workflow (distinct from standard eligibility workflow)

*Rationale*: Required by law for all safety net programs. Has distinct workflow, timelines, and participants (hearing officers). Currently only represented as task types.

### Medium Priority

**Staffing Forecasting**
- Project task volume based on historical patterns and upcoming deadlines
- Calculate required staff hours vs current capacity
- Identify staffing gaps by office, queue, or program
- Potential entities: `StaffingForecast`, `DeadlineProjection`

*Rationale*: Helps supervisors plan staffing during surges and avoid SLA breaches. Depends on mature Task and Caseload data to be useful.

**Change Reporting**
- Mid-certification changes reported by clients
- Change processing and verification
- Impact assessment on current benefits
- Change-triggered recertifications

*Rationale*: Common client interaction between certifications. Changes can affect eligibility and benefit amounts. Related to but distinct from Intake (not a new application).

**Programs**
- Program definitions (SNAP, TANF, Medicaid, etc.)
- Eligibility rules and criteria
- Income/asset limits
- Deduction rules
- Program-specific configurations

*Rationale*: Reference data needed across all domains. Currently assumed but not explicitly modeled. Could be configuration vs. a domain.

### Low Priority

**Fraud/Integrity**
- Fraud investigations
- Overpayment identification and tracking
- Recovery efforts
- Intentional Program Violations (IPVs)
- Disqualification periods

*Rationale*: Important for program integrity but specialized function. Often handled by separate units with different workflows.

**Referrals**
- Referrals to other services (employment, housing, childcare)
- Partner agency connections
- Community resource linking
- Referral tracking and outcomes

*Rationale*: Valuable for holistic client support but secondary to core benefits administration. May vary significantly by state/agency.

**Provider Management**
- Healthcare providers (Medicaid)
- SNAP authorized retailers
- TANF service providers
- Provider enrollment and verification

*Rationale*: Program-specific (primarily Medicaid). Often managed by separate systems. Complex enough to be its own domain.

**Quality Assurance**
- Case reviews and audits
- Error tracking and categorization
- Corrective action plans
- Federal reporting metrics (timeliness, accuracy)

*Rationale*: Important for compliance but often aggregated from other domains. May be better as cross-cutting reporting than a separate domain.

---

## 4. Documentation Gaps

Topics identified but not yet fully documented or implemented.

**Recently Addressed:**
- Performance specifics (caching TTLs, pagination limits, query complexity) → [api-architecture.md](api-architecture.md#performance)
- Circuit breaker pattern → [api-patterns.yaml](../../packages/schemas/openapi/patterns/api-patterns.yaml#circuit-breakers)
- Data classification annotations → [api-patterns.yaml](../../packages/schemas/openapi/patterns/api-patterns.yaml#data-classification)
- Domain-specific SLI metrics → [workflow.md](domains/workflow.md#operational-metrics)
- Quality attributes summary → [api-architecture.md](api-architecture.md#4-quality-attributes-summary)

### Added to api-patterns.yaml (Not Yet Implemented)

The following patterns have been added to [api-patterns.yaml](../../packages/schemas/openapi/patterns/api-patterns.yaml) but require implementation:

| Pattern | Description | Implementation Required |
|---------|-------------|------------------------|
| **Error Handling** | Standard error response structure, error codes, HTTP status guidance | Update `common-responses.yaml` schemas, mock server error responses |
| **API Versioning** | URL-path versioning strategy, deprecation headers | Update OpenAPI specs with version prefix, mock server routing |
| **Idempotency** | `Idempotency-Key` header for safe retries | Mock server must track keys and return stored responses |
| **Batch Operations** | `POST /{resources}/batch` pattern | Add batch endpoints to specs, mock server batch handling |
| **Authentication** | OAuth 2.0/OIDC, API keys, mTLS options; state-configurable IdP | OpenAPI security schemes, mock server token validation |
| **Authorization** | Scopes, RBAC roles, ABAC rules, field-level filtering | Middleware for scope/role checks, response filtering |
| **Rate Limiting** | Request limits with standard headers | API gateway configuration, mock server rate limit simulation |
| **Security Headers** | HSTS, CORS, cache control | API gateway or middleware configuration |
| **Audit Logging** | Required fields, sensitive access logging, PII handling | Logging infrastructure, correlation ID propagation |
| **Process API Metadata** | `x-actors`, `x-capability` extensions | Validation rules, documentation generation |
| **Correlation IDs** | `X-Correlation-ID` header for request tracing | Header propagation, logging integration |
| **ETags / Optimistic Concurrency** | `If-Match`, `If-None-Match` for conflict prevention | ETag generation, conditional request handling |
| **Sorting** | `sort` query parameter for list endpoints | Add to list endpoint specs, mock server support |
| **Long-Running Operations** | Async pattern with operation status polling | Operation status endpoints, background job infrastructure |

Each section in `api-patterns.yaml` is marked with `# STATUS: Not yet implemented` to indicate work remaining.

**Note on state configurability:** Authentication and authorization patterns define the interface contract, not specific provider implementations. States configure their own identity providers (Okta, Azure AD, state-specific IdP) and may customize role definitions while maintaining interoperability.

### API Patterns to Consider

Additional patterns that may be valuable depending on implementation needs. These are not commitments—evaluate each based on actual requirements.

| Pattern | Description | Consider When |
|---------|-------------|---------------|
| **Webhooks / Event Subscriptions** | Subscribe to events, delivery guarantees | Event-driven integration is needed |
| **Partial Responses / Field Selection** | `?fields=id,name` to reduce payload size | Mobile or bandwidth-constrained clients emerge |
| **Advanced Caching** | `Cache-Control` directives, `Vary` headers | Caching strategy is defined |
| **Hypermedia / HATEOAS** | `_links` in responses for discoverability | API discovery becomes important |
| **Content Negotiation** | `Accept` header handling, multiple formats | Non-JSON formats are needed |
| **Health Check Details** | Detailed `/health` and `/ready` patterns | Observability standards are finalized |

### Needs Architecture Documentation

**Data Retention & Archival**

| Data Type | Active Retention | Archive | Purge |
|-----------|------------------|---------|-------|
| Applications | 7 years after closure | Cold storage | Per state policy |
| Audit logs | 7 years | Immutable archive | Never (compliance) |
| PII | Per program requirements | Encrypted archive | On request + retention period |
| Session/tokens | 24 hours | N/A | Immediate |

*Considerations*:
- Federal programs have specific retention requirements
- Right to deletion must balance against audit requirements
- Archived data must remain queryable for audits

*Compliance Cross-References*:

| Program | Regulation | Requirement |
|---------|------------|-------------|
| SNAP | 7 CFR 272.1 | Record retention requirements |
| Medicaid | 42 CFR 431.17 | Records and reports |
| TANF | 45 CFR 265.2 | Data collection and reporting |
| All | HIPAA | Protected health information (Medicaid) |
| All | FERPA | Education records (when used for eligibility) |

*See also*: [API Architecture - Compliance](api-architecture.md#compliance) for field-level handling and right-to-deletion process.

**Event-Driven Architecture / Webhooks**

For external system integration without polling.

| Event | Trigger | Typical Consumers |
|-------|---------|-------------------|
| `application.submitted` | New application received | Document management, eligibility engine |
| `determination.completed` | Eligibility decided | Notice generation, benefits issuance |
| `task.sla_warning` | Task approaching deadline | Supervisor dashboards, alerting |
| `task.assigned` | Task assignment changed | Caseworker notifications |

*Pattern*:
- Events published to message broker (not direct HTTP calls)
- Webhook subscriptions for external consumers
- At-least-once delivery with idempotent consumers
- Event schema versioning aligned with API versioning

**Integration Patterns**

How legacy systems and external services connect.

| Pattern | Use Case | Example |
|---------|----------|---------|
| API Gateway | All external access | Authentication, rate limiting, routing |
| Adapter | Vendor system integration | Workflow vendor → System API translation |
| Anti-corruption layer | Legacy system integration | Mainframe → modern API translation |
| Event bridge | Async integration | Real-time updates to data warehouse |
| Batch file | Legacy batch systems | Nightly SSA data exchange |

### Separate Documents (Future)

**Testing Strategy**

Warrants its own document covering:
- Contract testing (Process APIs against System API contracts)
- Mock server usage patterns
- Integration test data management
- Performance/load testing approach

**State Security Implementation Guide**

The security patterns in `api-patterns.yaml` define the interface contract. A separate guide may be needed for states covering:
- Identity provider setup (Okta, Azure AD, state IdP)
- Role mapping to state organizational structure
- Break-glass procedures and emergency access
- Compliance documentation (FedRAMP, StateRAMP, etc.)
