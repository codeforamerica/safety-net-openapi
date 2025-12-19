# API Client Generator

Generate type-safe Zodios/TypeScript clients from OpenAPI specs.

## Quick Start

```bash
STATE=california npm run clients:generate
```

Output: `generated/clients/zodios/*.ts`

## Integrating into Your Front-End Application

The generated clients are state-specific and designed to be copied into your front-end project. Here's how to integrate them:

### Step 1: Generate Clients for Your State

```bash
# In the safety-net-openapi toolkit
STATE=california npm run clients:generate
```

### Step 2: Copy to Your Front-End Project

```bash
# Copy the generated clients to your project
cp -r generated/clients/zodios/* ../your-frontend/src/api/

# Or set up a script in your frontend's package.json
```

### Step 3: Install Dependencies

The generated clients require these packages:

```bash
npm install @zodios/core zod axios
```

### Step 4: Configure the Client

Create a configuration file to set your API base URL and authentication:

```typescript
// src/api/config.ts
import { Zodios } from '@zodios/core';
import { personsApi } from './persons';
import { householdsApi } from './households';
import { applicationsApi } from './applications';

const BASE_URL = process.env.REACT_APP_API_URL || 'https://api.example.com';

// Create configured clients
export const personsClient = new Zodios(BASE_URL, personsApi, {
  axiosConfig: {
    headers: {
      'Content-Type': 'application/json',
    },
  },
});

export const householdsClient = new Zodios(BASE_URL, householdsApi);
export const applicationsClient = new Zodios(BASE_URL, applicationsApi);

// Add auth token dynamically
export function setAuthToken(token: string) {
  const authHeader = { Authorization: `Bearer ${token}` };
  personsClient.axios.defaults.headers.common = authHeader;
  householdsClient.axios.defaults.headers.common = authHeader;
  applicationsClient.axios.defaults.headers.common = authHeader;
}
```

### Step 5: Use in Components

```typescript
// src/components/PersonList.tsx
import { useEffect, useState } from 'react';
import { personsClient } from '../api/config';

// Types are automatically inferred from the API definition
type Person = Awaited<ReturnType<typeof personsClient.getPerson>>;

export function PersonList() {
  const [persons, setPersons] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    personsClient
      .listPersons({ queries: { limit: 25 } })
      .then((response) => setPersons(response.items))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <ul>
      {persons.map((person) => (
        <li key={person.id}>
          {person.name.firstName} {person.name.lastName}
        </li>
      ))}
    </ul>
  );
}
```

### With React Query

For better caching and state management:

```typescript
// src/hooks/usePersons.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { personsClient } from '../api/config';

export function usePersons(options?: { limit?: number; offset?: number }) {
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
    mutationFn: (data: Parameters<typeof personsClient.createPerson>[0]) =>
      personsClient.createPerson(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['persons'] });
    },
  });
}

export function useUpdatePerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      personId,
      data,
    }: {
      personId: string;
      data: Parameters<typeof personsClient.updatePerson>[0];
    }) => personsClient.updatePerson({ params: { personId }, ...data }),
    onSuccess: (_, { personId }) => {
      queryClient.invalidateQueries({ queryKey: ['persons', personId] });
      queryClient.invalidateQueries({ queryKey: ['persons'] });
    },
  });
}
```

### Keeping Clients Updated

When the API spec changes, regenerate and copy the clients:

```bash
# In safety-net-openapi toolkit
git pull
STATE=california npm run clients:generate

# Copy to your project
cp -r generated/clients/zodios/* ../your-frontend/src/api/
```

Consider adding a script to your front-end's `package.json`:

```json
{
  "scripts": {
    "api:update": "cd ../safety-net-openapi && git pull && STATE=california npm run clients:generate && cp -r generated/clients/zodios/* ../your-frontend/src/api/"
  }
}
```

---

## Basic Usage

```typescript
import { personsClient } from './generated/clients/zodios/persons';

// List with pagination and search
const persons = await personsClient.listPersons({
  queries: { limit: 10, offset: 0, q: 'status:active' }
});

// Get by ID
const person = await personsClient.getPerson({
  params: { personId: '123e4567-e89b-12d3-a456-426614174000' }
});

// Create
const newPerson = await personsClient.createPerson({
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com'
});

// Update
const updated = await personsClient.updatePerson({
  params: { personId: '...' },
  body: { monthlyIncome: 7500 }
});

// Delete
await personsClient.deletePerson({ params: { personId: '...' } });
```

## What's Generated

- Full TypeScript types from OpenAPI schemas
- Zod schemas for runtime validation
- Type-safe function parameters and return values
- All endpoints with proper HTTP methods

## Requirements

Your OpenAPI spec needs:
- `operationId` on each endpoint (used for function names)
- Schemas for request/response bodies
- Parameters defined (path, query)

## Troubleshooting

**Generation fails:**
```bash
npm run validate   # Check for spec errors
```

**Type errors:** Regenerate clients after spec changes.

**Runtime validation errors:** Zod validates responses against the schema. If your backend returns unexpected data, you'll get a Zod error. Check that your backend matches the spec.
