# API Client Packages

State-specific npm packages with type-safe Zodios clients and Zod schemas.

## Installation

### 1. Configure GitHub Packages

Create `.npmrc` in your project root:

```
@codeforamerica:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

### 2. Install Your State Package

```bash
# Colorado
npm install @codeforamerica/safety-net-colorado

# California
npm install @codeforamerica/safety-net-california

# Peer dependencies
npm install @zodios/core zod axios
```

## Package Structure

Each package exports four modules:

```typescript
import { persons, applications, households, incomes } from '@codeforamerica/safety-net-colorado';
```

Each module contains:

| Export | Description |
|--------|-------------|
| `schemas` | Zod schemas for validation and types |
| `api` | Pre-configured Zodios API instance |
| `createApiClient(baseUrl)` | Factory to create client with custom base URL |

### Available Schemas

```typescript
// persons.schemas
persons.schemas.Person          // Main person schema
persons.schemas.PersonList      // Paginated list response
persons.schemas.PersonCreate    // Create request body
persons.schemas.PersonUpdate    // Update request body

// applications.schemas
applications.schemas.Application
applications.schemas.ApplicationList
applications.schemas.ApplicationCreate
applications.schemas.ApplicationUpdate

// households.schemas
households.schemas.Household
households.schemas.HouseholdList
households.schemas.HouseholdCreate
households.schemas.HouseholdUpdate

// incomes.schemas
incomes.schemas.Income
incomes.schemas.IncomeList
incomes.schemas.IncomeCreate
incomes.schemas.IncomeUpdate
```

## Basic Usage

### Using Schemas for Validation

```typescript
import { persons } from '@codeforamerica/safety-net-colorado';
import { z } from 'zod';

// Get the schema
const { Person, PersonList } = persons.schemas;

// Infer TypeScript types
type Person = z.infer<typeof Person>;
type PersonList = z.infer<typeof PersonList>;

// Validate data
const result = Person.safeParse(apiResponse);
if (result.success) {
  console.log('Valid person:', result.data);
} else {
  console.error('Validation errors:', result.error.issues);
}
```

### Using the API Client

```typescript
import { persons } from '@codeforamerica/safety-net-colorado';

const BASE_URL = process.env.API_URL || 'http://localhost:1080';
const client = persons.createApiClient(BASE_URL);

// List with pagination and search
const response = await client.listPersons({
  queries: { limit: 10, offset: 0, q: 'status:active' }
});

// Get by ID
const person = await client.getPerson({
  params: { personId: '123e4567-e89b-12d3-a456-426614174000' }
});

// Create
const newPerson = await client.createPerson({
  body: {
    name: { firstName: 'Jane', lastName: 'Doe' },
    email: 'jane@example.com',
    dateOfBirth: '1990-01-15',
    phoneNumber: '555-123-4567',
    citizenshipStatus: 'citizen',
    householdSize: 1,
    monthlyIncome: 3500
  }
});

// Update
const updated = await client.updatePerson({
  params: { personId: '...' },
  body: { monthlyIncome: 4000 }
});

// Delete
await client.deletePerson({ params: { personId: '...' } });
```

## Recommended Setup

### Re-export Schemas

Create a central schemas file for your app:

```typescript
// src/schemas/index.ts
import { persons, applications, households } from '@codeforamerica/safety-net-colorado';
import { z } from 'zod';

// Person
export const Person = persons.schemas.Person;
export type Person = z.infer<typeof Person>;

export const PersonList = persons.schemas.PersonList;
export type PersonList = z.infer<typeof PersonList>;

// Application
export const Application = applications.schemas.Application;
export type Application = z.infer<typeof Application>;

export const ApplicationList = applications.schemas.ApplicationList;
export type ApplicationList = z.infer<typeof ApplicationList>;

// Household
export const Household = households.schemas.Household;
export type Household = z.infer<typeof Household>;

// Error (define locally if not in package)
export const Error = z.object({
  code: z.string(),
  message: z.string(),
  details: z.array(z.object({}).passthrough()).optional(),
});
export type Error = z.infer<typeof Error>;
```

### Configure API Clients

```typescript
// src/api/client.ts
import { persons, applications, households } from '@codeforamerica/safety-net-colorado';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:1080';

export const personsClient = persons.createApiClient(BASE_URL);
export const applicationsClient = applications.createApiClient(BASE_URL);
export const householdsClient = households.createApiClient(BASE_URL);

// Add authentication header to all clients
export function setAuthToken(token: string) {
  const authHeader = { Authorization: `Bearer ${token}` };
  personsClient.axios.defaults.headers.common = authHeader;
  applicationsClient.axios.defaults.headers.common = authHeader;
  householdsClient.axios.defaults.headers.common = authHeader;
}
```

## With React Query

For better caching and state management:

```typescript
// src/hooks/usePersons.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { personsClient } from '../api/client';

export function usePersons(options?: { limit?: number; offset?: number; q?: string }) {
  return useQuery({
    queryKey: ['persons', options],
    queryFn: () => personsClient.listPersons({ queries: options }),
  });
}

export function usePerson(personId: string) {
  return useQuery({
    queryKey: ['persons', personId],
    queryFn: () => personsClient.getPerson({ params: { personId } }),
    enabled: !!personId,
  });
}

export function useCreatePerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof personsClient.createPerson>[0]['body']) =>
      personsClient.createPerson({ body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['persons'] });
    },
  });
}

export function useUpdatePerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ personId, data }: { personId: string; data: Record<string, unknown> }) =>
      personsClient.updatePerson({ params: { personId }, body: data }),
    onSuccess: (_, { personId }) => {
      queryClient.invalidateQueries({ queryKey: ['persons', personId] });
      queryClient.invalidateQueries({ queryKey: ['persons'] });
    },
  });
}

export function useDeletePerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (personId: string) =>
      personsClient.deletePerson({ params: { personId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['persons'] });
    },
  });
}
```

Usage in components:

```typescript
// src/components/PersonList.tsx
import { usePersons, useDeletePerson } from '../hooks/usePersons';

export function PersonList() {
  const { data, isLoading, error } = usePersons({ limit: 25 });
  const deletePerson = useDeletePerson();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <ul>
      {data?.items.map((person) => (
        <li key={person.id}>
          {person.name.firstName} {person.name.lastName}
          <button onClick={() => deletePerson.mutate(person.id)}>
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}
```

## State-Specific Fields

Each state package includes state-specific schema fields. For example, the Colorado package includes:

**Person schema:**
- `countyName` - Enum of Colorado counties
- `countyCode` - Colorado FIPS code pattern
- `peakAccountId` - Colorado PEAK account identifier
- `coloradoWorksEligible`, `snapEligible`, `healthFirstColoradoEligible`, `andcsEligible`
- `incomeSources` includes `colorado_works_cash`, `old_age_pension`, `andcs`

**Application schema:**
- Uses generic field names (`isStateResident`, `tanfProgram`) that work across states

## Updating the Package

When a new version is released:

```bash
npm update @codeforamerica/safety-net-colorado
```

Check the changelog for breaking changes to schema fields or API endpoints.

## Troubleshooting

**401 Unauthorized during install:**
- Ensure `GITHUB_TOKEN` is set with `read:packages` scope
- Check `.npmrc` configuration

**Type errors after update:**
- Schema fields may have changed
- Check for renamed or removed fields
- Run TypeScript compilation to find issues

**Runtime validation errors:**
- Zod validates responses against the schema
- Ensure your API returns data matching the expected schema
- Check for missing required fields or incorrect types
