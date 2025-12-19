# Getting Started: Frontend Developers

This guide is for developers building frontend applications that consume Safety Net APIs. You'll use generated TypeScript clients and the mock server for local development.

## What You'll Do

- Generate type-safe API clients for your state
- Integrate clients into your frontend application
- Develop against the mock server while the backend is in progress
- Set up CI/CD to test your frontend

## Prerequisites

- Node.js >= 18.0.0
- A frontend project (React, Vue, etc.)
- Familiarity with TypeScript

## Initial Setup

```bash
# Clone the repository
git clone https://github.com/codeforamerica/safety-net-openapi.git
cd safety-net-openapi

# Install dependencies
npm install

# Set your state
export STATE=california
```

## Your First Workflow

### 1. Generate API Clients

Generate TypeScript clients for your state:

```bash
STATE=california npm run clients:generate
```

This creates type-safe clients in `generated/clients/zodios/`:
- `persons.ts`
- `households.ts`
- `applications.ts`
- etc.

### 2. Copy Clients to Your Project

```bash
# Copy to your frontend project
cp -r generated/clients/zodios/* ../your-frontend/src/api/
```

### 3. Install Dependencies in Your Frontend

The generated clients require:

```bash
cd ../your-frontend
npm install @zodios/core zod axios
```

### 4. Configure and Use

Create a configuration file in your frontend:

```typescript
// src/api/config.ts
import { Zodios } from '@zodios/core';
import { personsApi } from './persons';
import { householdsApi } from './households';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:1080';

export const personsClient = new Zodios(BASE_URL, personsApi);
export const householdsClient = new Zodios(BASE_URL, householdsApi);

// Add authentication
export function setAuthToken(token: string) {
  const authHeader = { Authorization: `Bearer ${token}` };
  personsClient.axios.defaults.headers.common = authHeader;
  householdsClient.axios.defaults.headers.common = authHeader;
}
```

Use in your components:

```typescript
// src/components/PersonList.tsx
import { personsClient } from '../api/config';

export function PersonList() {
  const [persons, setPersons] = useState([]);

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

### 5. Develop Against the Mock Server

While the backend is being built, use the mock server for development:

```bash
# In the safety-net-openapi directory
STATE=california npm start
```

The mock server runs at http://localhost:1080 with realistic test data.

Point your frontend at it:

```bash
# In your frontend
REACT_APP_API_URL=http://localhost:1080 npm start
```

## Development Workflow

### Daily Development

```bash
# Terminal 1: Start mock server
cd safety-net-openapi
STATE=california npm start

# Terminal 2: Start your frontend
cd your-frontend
REACT_APP_API_URL=http://localhost:1080 npm start
```

### When the API Spec Changes

```bash
# Pull latest specs
cd safety-net-openapi
git pull

# Regenerate clients
STATE=california npm run clients:generate

# Copy to your project
cp -r generated/clients/zodios/* ../your-frontend/src/api/
```

Consider adding a script to your frontend's `package.json`:

```json
{
  "scripts": {
    "api:update": "cd ../safety-net-openapi && git pull && STATE=california npm run clients:generate && cp -r generated/clients/zodios/* src/api/"
  }
}
```

## CI/CD Integration

### Testing Against Mock Server

```yaml
# .github/workflows/test.yml
name: Frontend Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout frontend
        uses: actions/checkout@v4

      - name: Checkout API toolkit
        uses: actions/checkout@v4
        with:
          repository: codeforamerica/safety-net-openapi
          path: openapi-toolkit

      - name: Start mock server
        working-directory: openapi-toolkit
        run: |
          npm install
          STATE=california npm run mock:setup
          STATE=california npm run mock:start &
          sleep 5

      - name: Run frontend tests
        env:
          REACT_APP_API_URL: http://localhost:1080
        run: |
          npm install
          npm test
```

See [CI/CD for Frontend](../integration/ci-cd-frontend.md) for more options.

## Exploring the API

### Swagger UI

Browse the API documentation interactively:

```bash
cd safety-net-openapi
STATE=california npm start
```

Visit http://localhost:3000 to:
- See all available endpoints
- View request/response schemas
- Try out requests

### Example Requests

```bash
# List persons
curl http://localhost:1080/persons

# Search
curl "http://localhost:1080/persons?q=status:active"

# Get by ID
curl http://localhost:1080/persons/{id}
```

## Key Commands

| Command | When to Use |
|---------|-------------|
| `npm run clients:generate` | After spec changes, to get new types |
| `npm start` | To run mock server for development |
| `npm run mock:reset` | To reset test data |

## Next Steps

- [API Clients](../integration/api-clients.md) — Detailed client usage and React Query integration
- [Mock Server](../guides/mock-server.md) — Search, pagination, and data management
- [CI/CD for Frontend](../integration/ci-cd-frontend.md) — Testing setup
