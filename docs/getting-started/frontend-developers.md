# Getting Started: Frontend Developers

This guide is for developers building frontend applications that consume Safety Net APIs. You'll use pre-built npm packages with TypeScript clients and Zod schemas.

## What You'll Do

- Install a state-specific npm package with type-safe schemas and API clients
- Integrate into your frontend application
- Develop against the mock server while the backend is in progress
- Set up CI/CD to test your frontend

## Prerequisites

- Node.js >= 18.0.0
- A frontend project (React, Vue, etc.)
- Familiarity with TypeScript
- GitHub account (for package access)

## Initial Setup

### 1. Configure npm for GitHub Packages

The packages are published to GitHub Packages. Create or update `.npmrc` in your project root:

```
@codeforamerica:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Set your GitHub token (needs `read:packages` scope):

```bash
export GITHUB_TOKEN=ghp_your_token_here
```

### 2. Install the Package

```bash
# For Colorado
npm install @codeforamerica/safety-net-colorado

# For California
npm install @codeforamerica/safety-net-california
```

### 3. Install Peer Dependencies

```bash
npm install @zodios/core zod axios
```

## Using the Package

### Importing Schemas

The package exports Zod schemas and TypeScript types:

```typescript
// src/schemas/index.ts
import { persons, applications, households } from '@codeforamerica/safety-net-colorado';
import { z } from 'zod';

// Re-export schemas for your app
export const Person = persons.schemas.Person;
export type Person = z.infer<typeof Person>;

export const PersonList = persons.schemas.PersonList;
export type PersonList = z.infer<typeof PersonList>;

export const Application = applications.schemas.Application;
export type Application = z.infer<typeof Application>;
```

### Using the Zodios API Client

Each module includes a pre-configured Zodios API client:

```typescript
// src/api/client.ts
import { persons, applications } from '@codeforamerica/safety-net-colorado';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:1080';

// Create clients with your base URL
export const personsClient = persons.createApiClient(BASE_URL);
export const applicationsClient = applications.createApiClient(BASE_URL);

// Add authentication
export function setAuthToken(token: string) {
  const authHeader = { Authorization: `Bearer ${token}` };
  personsClient.axios.defaults.headers.common = authHeader;
  applicationsClient.axios.defaults.headers.common = authHeader;
}
```

### Using in Components

```typescript
// src/components/PersonList.tsx
import { useEffect, useState } from 'react';
import { personsClient } from '../api/client';
import type { Person } from '../schemas';

export function PersonList() {
  const [persons, setPersons] = useState<Person[]>([]);

  useEffect(() => {
    personsClient
      .listPersons({ queries: { limit: 25 } })
      .then((response) => setPersons(response.items));
  }, []);

  return (
    <ul>
      {persons.map((person) => (
        <li key={person.id}>{person.name.firstName}</li>
      ))}
    </ul>
  );
}
```

### Runtime Validation

Use the Zod schemas for runtime validation:

```typescript
import { Person } from '../schemas';

// Validate API response
const parseResult = Person.safeParse(apiResponse);
if (parseResult.success) {
  return parseResult.data;
} else {
  console.error('Validation failed:', parseResult.error);
}
```

## Development Workflow

### Develop Against the Mock Server

While the backend is being built, use the mock server:

```bash
# Clone the toolkit (one-time setup)
git clone https://github.com/codeforamerica/safety-net-openapi.git
cd safety-net-openapi
npm install

# Start the mock server
npm run mock:start:all
```

The mock server runs at http://localhost:1080 with realistic test data.

Point your frontend at it:

```bash
# In your frontend
REACT_APP_API_URL=http://localhost:1080 npm start
```

### When the Package Updates

Simply update your package version:

```bash
npm update @codeforamerica/safety-net-colorado
```

## Exploring the API

### Swagger UI

Browse the API documentation interactively:

```bash
cd safety-net-openapi
npm run mock:start:all
npm run mock:swagger
```

Visit http://localhost:3000 to see all endpoints and schemas.

### Example Requests

```bash
# List persons
curl http://localhost:1080/persons

# Search
curl "http://localhost:1080/persons?q=status:active"

# Get by ID
curl http://localhost:1080/persons/{id}
```

## Package Contents

Each state package exports:

| Module | Exports |
|--------|---------|
| `persons` | `schemas`, `api`, `createApiClient()` |
| `applications` | `schemas`, `api`, `createApiClient()` |
| `households` | `schemas`, `api`, `createApiClient()` |
| `incomes` | `schemas`, `api`, `createApiClient()` |

Each `schemas` object contains:
- Main schema (e.g., `Person`, `Application`)
- List schema (e.g., `PersonList`, `ApplicationList`)
- Create/Update variants

## Next Steps

- [API Clients](../integration/api-clients.md) — Detailed client usage and React Query integration
- [Mock Server](../guides/mock-server.md) — Search, pagination, and data management
- [CI/CD for Frontend](../integration/ci-cd-frontend.md) — Testing setup
