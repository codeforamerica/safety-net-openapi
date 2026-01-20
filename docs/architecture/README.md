# Architecture Documentation

This directory contains architecture documentation for the Safety Net Benefits API.

> **Status: Proposed Architecture**
> These documents describe the target architecture. The current implementation includes only a subset (Intake with Applications and Persons). The remaining domains and functionality are planned for future development.

## Documents

| Document | Description |
|----------|-------------|
| [Domain Design](domain-design.md) | Domain organization, entities, data flow, and safety net concerns |
| [API Architecture](api-architecture.md) | API layers, vendor independence, and operational architecture |
| [Design Decisions](design-decisions.md) | Key decisions with rationale and alternatives considered |
| [Roadmap](roadmap.md) | Migration, implementation phases, future considerations, and documentation gaps |

## Domain Schema Details

| Domain | File |
|--------|------|
| Workflow | [domains/workflow.md](domains/workflow.md) |
| Case Management | [domains/case-management.md](domains/case-management.md) |
| Communication | [cross-cutting/communication.md](cross-cutting/communication.md) |

*Additional domain schemas will be added as those domains are implemented.*

## Related Resources

| Resource | Description |
|----------|-------------|
| [api-patterns.yaml](../../packages/schemas/openapi/patterns/api-patterns.yaml) | Machine-readable API design patterns |
| [Architecture Decision Records](../architecture-decisions/) | Formal ADRs for significant decisions |
| [Guides](../guides/) | How-to guides for working with the toolkit |
