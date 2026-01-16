# Workflow/Task Management API Design

Research and recommendations for adding workflow and task management capabilities to the Safety Net OpenAPI toolkit.

---

## 1. Background

### Why Workflow/Task Management?

Safety net programs require coordinated work across multiple staff members, with strict compliance requirements. A workflow/task API would enable:

- Tracking work items through the eligibility determination process
- Ensuring mandated timelines are met
- Providing audit trails for federal compliance
- Coordinating work across teams and agencies

### Existing Domain Objects

The toolkit already includes these core entities:

| Entity | Purpose |
|--------|---------|
| **Person** | Persistent identity and demographic data |
| **Household** | Container for people living together with relationships |
| **Application** | Central workflow entity with status lifecycle |
| **HouseholdMember** | Point-in-time eligibility snapshot within an application |
| **Income** | Detailed income records for eligibility |

The **Application** entity already has a status field with clear transitions:
```
draft → submitted → under_review → approved/denied/pending_information/withdrawn
```

---

## 2. Safety Net Specific Concerns

### Regulatory/Compliance

| Concern | Example |
|---------|---------|
| **Mandated timelines** | SNAP: 30-day processing, 7-day expedited; Medicaid: 45-day determination |
| **SLA tracking** | Federal reporting on timeliness rates |
| **Audit trails** | Everything must be documented for federal audits |
| **Notice requirements** | Specific notices at specific points (denial, approval, RFI) |

### Case-Centric Workflows

| Concern | Example |
|---------|---------|
| **Case vs Task** | Tasks tied to a "case" (household's application journey) |
| **Multi-program** | One application may require parallel workflows for SNAP, Medicaid, TANF |
| **Renewals/Recertification** | Recurring workflows triggered by benefit expiration dates |
| **Appeals** | Formal appeal processes with their own timelines |

### Operational

| Concern | Example |
|---------|---------|
| **Document verification** | Tasks to verify income, identity, residency |
| **Request for Information (RFI)** | Client has X days to respond before adverse action |
| **Inter-agency handoffs** | Tasks may transfer between county offices, state agencies |
| **Accommodations** | Language, disability, or other special handling flags |
| **Caseload management** | Assigning/balancing work across case workers |

### Privacy

| Concern | Example |
|---------|---------|
| **PII protection** | Task data may contain sensitive information |
| **Role-based access** | Different visibility for workers, supervisors, auditors |

---

## 3. Proposed Domain Objects

### Task

The core work item representing an action that needs to be completed.

```yaml
Task:
  properties:
    id: uuid
    taskType:
      # Document verification
      - verify_identity
      - verify_income
      - verify_employment
      - verify_residency
      - verify_citizenship
      - verify_resources
      - verify_expenses
      # Determination
      - eligibility_determination
      - benefit_calculation
      - expedited_screening
      # Communication
      - request_information
      - send_notice
      - schedule_interview
      - conduct_interview
      # Review
      - supervisor_review
      - quality_review
      # Inter-agency
      - inter_agency_referral
      - inter_agency_followup
      # Renewal
      - renewal_review
      - recertification
      # Appeals
      - appeal_review
      - hearing_preparation
    status:
      - pending
      - in_progress
      - awaiting_client
      - awaiting_verification
      - awaiting_review
      - completed
      - cancelled
      - escalated
    priority:
      - expedited      # 7-day SNAP, emergency
      - high           # Approaching deadline
      - normal         # Standard processing
      - low            # Deferred/backlog
    applicationId: uuid      # Reference to Application
    assignedToId: uuid       # Reference to CaseWorker
    programType: enum        # snap, tanf, medical_assistance
    dueDate: datetime        # SLA deadline
    slaInfo: TaskSLAInfo     # SLA tracking details
    sourceInfo: TaskSourceInfo  # What triggered this task
    parentTaskId: uuid       # For subtasks
    blockedByTaskIds: uuid[] # Dependencies
    outcomeInfo: TaskOutcomeInfo  # Completion details
    createdAt, updatedAt: datetime
```

#### TaskSLAInfo

```yaml
TaskSLAInfo:
  properties:
    slaType:
      - snap_standard       # 30 days
      - snap_expedited      # 7 days
      - medicaid_standard   # 45 days
      - medicaid_disability # 90 days
      - tanf_standard       # 30 days
      - rfi_response        # Variable
      - appeal_standard     # Variable by state
    slaDeadline: datetime
    clockStartDate: datetime
    clockPausedAt: datetime    # When paused (awaiting client)
    totalPausedDays: integer
    slaStatus:
      - on_track
      - at_risk
      - breached
      - paused
      - completed
    warningThresholdDays: integer
```

### CaseWorker

Staff member who processes applications and tasks.

```yaml
CaseWorker:
  properties:
    id: uuid
    name: Name
    employeeId: string
    email: Email
    phoneNumber: PhoneNumber
    role:
      - intake_worker
      - eligibility_worker
      - supervisor
      - quality_reviewer
      - appeals_specialist
      - administrator
    status:
      - active
      - inactive
      - on_leave
    supervisorId: uuid
    teamId: uuid
    certifications: CaseWorkerCertification[]
    workloadCapacity: integer
    languagesSpoken: Language[]
    createdAt, updatedAt: datetime
```

### Notice

Official communications sent to applicants/clients.

```yaml
Notice:
  properties:
    id: uuid
    noticeType:
      # Determination
      - approval
      - denial
      - partial_approval
      # Information requests
      - request_for_information
      - interview_scheduled
      - interview_missed
      # Status
      - application_received
      - pending_verification
      - under_review
      # Action
      - renewal_due
      - recertification_required
      - benefits_ending
      - benefits_change
      # Appeals
      - appeal_received
      - hearing_scheduled
      - appeal_decision
    applicationId: uuid
    programType: enum
    recipientInfo: NoticeRecipientInfo
    deliveryMethod:
      - postal_mail
      - email
      - both
      - in_person
    status:
      - draft
      - pending_review
      - approved
      - sent
      - delivered
      - returned
      - failed
    language: Language
    responseRequired: boolean
    responseDueDate: datetime
    responseReceivedDate: datetime
    denialReasons: DenialReason[]    # For denial notices
    rfiItems: RequestForInformationItem[]  # For RFI notices
    generatedByTaskId: uuid
    sentAt: datetime
    sentById: uuid
    createdAt, updatedAt: datetime
```

### TaskAuditEvent

Immutable audit trail for task actions.

```yaml
TaskAuditEvent:
  properties:
    id: uuid
    taskId: uuid
    eventType:
      - created
      - assigned
      - reassigned
      - status_changed
      - priority_changed
      - note_added
      - due_date_changed
      - escalated
      - completed
      - cancelled
      - sla_warning
      - sla_breached
    previousValue: string
    newValue: string
    performedById: uuid
    systemGenerated: boolean
    notes: string
    occurredAt: datetime (readonly)
```

---

## 4. Proposed API Endpoints

### Tasks API

```
GET    /tasks                      List tasks (searchable)
POST   /tasks                      Create task
GET    /tasks/{taskId}             Get task
PATCH  /tasks/{taskId}             Update task
DELETE /tasks/{taskId}             Delete task
POST   /tasks/{taskId}/assign      Assign to case worker
POST   /tasks/{taskId}/complete    Complete with outcome
POST   /tasks/{taskId}/escalate    Escalate to supervisor
GET    /tasks/{taskId}/audit-events  Get audit trail
```

### Case Workers API

```
GET    /case-workers                    List case workers
POST   /case-workers                    Create case worker
GET    /case-workers/{id}               Get case worker
PATCH  /case-workers/{id}               Update case worker
DELETE /case-workers/{id}               Delete case worker
GET    /case-workers/{id}/tasks         Get assigned tasks
GET    /case-workers/{id}/workload      Get workload stats
```

### Notices API

```
GET    /notices                         List notices
POST   /notices                         Create notice
GET    /notices/{id}                    Get notice
PATCH  /notices/{id}                    Update notice
DELETE /notices/{id}                    Delete notice
POST   /notices/{id}/send               Send notice
POST   /notices/{id}/record-response    Record client response
```

### Application Integration

```
GET    /applications/{id}/tasks         Tasks for application
GET    /applications/{id}/notices       Notices for application
GET    /applications/{id}/timeline      Complete event timeline
```

---

## 5. Integration with Application Lifecycle

### Task Generation from Application Events

When an application is submitted, generate tasks based on:

1. **Screening Flags** - Map flags to verification tasks:
   - `has_employment` → `verify_employment` task
   - `has_self_employment` → `verify_income` task
   - `non_citizens` → `verify_citizenship` task
   - `has_resources` → `verify_resources` task

2. **Program-specific workflows**:
   - SNAP: Always start with `expedited_screening` task
   - Medical assistance: `eligibility_determination` task
   - Multi-program: Tasks for each program

3. **SLA Assignment**:
   - SNAP: 30-day standard, 7-day expedited
   - Medicaid: 45-day standard, 90-day for disability
   - TANF: 30-day standard

### Status Synchronization

| Application Status | Task Actions |
|-------------------|--------------|
| `submitted` | Create initial tasks, start SLA clocks |
| `pending_information` | Create RFI tasks, pause other SLA clocks |
| `under_review` | Resume clocks, create review tasks |
| `approved`/`denied` | Complete tasks, generate notice tasks |

### Proposed Application Schema Additions

```yaml
# Add to Application schema
assignedCaseWorkerId: uuid
slaStatus: on_track | at_risk | breached
```

---

## 6. File Structure

```
packages/schemas/openapi/
├── tasks.yaml                    # Tasks API spec
├── case-workers.yaml             # Case Workers API spec
├── notices.yaml                  # Notices API spec
├── components/
│   ├── task.yaml                 # Task, TaskSLAInfo, TaskSourceInfo, etc.
│   ├── case-worker.yaml          # CaseWorker, CaseWorkerCertification
│   ├── notice.yaml               # Notice, NoticeRecipientInfo, etc.
│   └── audit.yaml                # TaskAuditEvent
├── examples/
│   ├── tasks.yaml
│   ├── case-workers.yaml
│   └── notices.yaml
```

---

## 7. Design Decisions

### Explicit Tasks vs Workflow Engine

**Decision**: Use explicit Task entities rather than a full workflow engine (BPMN).

| Approach | Pros | Cons |
|----------|------|------|
| Explicit Tasks | Simpler, follows existing patterns, flexible | Workflow logic in consuming systems |
| Workflow Engine | Declarative workflows, visual modeling | Complex runtime, additional dependencies |

**Rationale**: Explicit tasks are appropriate for v1. A workflow engine can be layered on top later if needed.

### Standalone vs Nested Endpoints

**Decision**: Both.

- Standalone (`/tasks`) for bulk operations and worker queues
- Nested (`/applications/{id}/tasks`) for convenience when working with specific applications

### SLA Clock Management

**Decision**: Track at task level, not application level.

**Rationale**: Allows different SLA rules per task type, granular pause/resume, and better visibility into delays.

---

## 8. Implementation Phases

### Phase 1: Core Schemas
1. Create `components/task.yaml`
2. Create `components/case-worker.yaml`
3. Create `components/notice.yaml`
4. Create `components/audit.yaml`

### Phase 2: API Specs
1. Create `tasks.yaml`
2. Create `case-workers.yaml`
3. Create `notices.yaml`
4. Update `applications.yaml` with relationship endpoints

### Phase 3: Examples & Validation
1. Create example data files
2. Run `npm run validate`
3. Generate clients

---

## 9. References

### Existing Files to Follow

- `packages/schemas/openapi/applications.yaml` - API spec structure pattern
- `packages/schemas/openapi/components/application.yaml` - Complex schema pattern
- `packages/schemas/openapi/components/common.yaml` - Shared schemas (Name, Address, etc.)
- `packages/schemas/openapi/patterns/api-patterns.yaml` - Naming and CRUD conventions
