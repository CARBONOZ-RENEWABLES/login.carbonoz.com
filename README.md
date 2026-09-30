# Carbonoz Login & Dashboard Application

Carbonoz customer platform: React frontend and NestJS backend. Customers sign in
with Keycloak (or, during the migration, a password), complete the Carbonoz
onboarding (partners, Redex, system steps) and see their SolarBMS
installations on the Solar dashboard. SolarBMS devices send data to the
authenticated ingestion API (Redis stream → worker → MongoDB).

Architecture: [docs/platform-architecture.md](docs/platform-architecture.md) ·
SolarBMS contract: [docs/solarbms-ingestion.md](docs/solarbms-ingestion.md)

## Prerequisites

- Node.js 18+ and npm/yarn
- MongoDB 5+ with replica set enabled
- Redis (AOF persistence, `maxmemory-policy noeviction`)
- Keycloak (realms `customers` and `machines`) for SSO / machine credentials
- PM2 (for production deployment)

## Project Structure

- `offsettingdashboard/` - React + Vite frontend
- `server-api/` - NestJS backend API

## Installation

### 1. Clone the repository
```bash
git clone https://github.com/CARBONOZ-RENEWABLES/login.carbonoz.com.git
cd login.carbonoz.com
```

### 2. Install dependencies

**Backend:**
```bash
cd server-api
npm install
```

**Frontend:**
```bash
cd offsettingdashboard
npm install
```

### 3. Configure environment variables

**Backend (.env in server-api/):** see [`server-api/.env.example`](server-api/.env.example)
for every setting (database, Redis, Keycloak, sessions, machine auth, SolarBMS
pipeline, `LEGACY_AUTH_ENABLED`, `SWAGGER_ENABLED`).

**Frontend (.env in offsettingdashboard/):**
```env
VITE_API_URL=/api            # same origin as the SPA (Nginx proxies /api)
VITE_AUTH_MODE=keycloak      # omit for the legacy password login
```

### 4. Setup MongoDB Replica Set
Prisma needs MongoDB running as a replica set (a single node is enough):
```bash
mongod --replSet rs0 --dbpath /var/lib/mongodb --bind_ip 127.0.0.1
mongosh --eval 'rs.initiate({_id: "rs0", members: [{_id: 0, host: "127.0.0.1:27017"}]})'
```

### 5. Generate Prisma Client
```bash
cd server-api
npm run prisma:generate
```

## Development

**Backend:**
```bash
cd server-api
npm run start:dev
```

**Frontend:**
```bash
cd offsettingdashboard
npm run dev
```

## Production Deployment on 192.168.160.190

### Build the applications

**Backend:**
```bash
cd server-api
npm run build
```

**Frontend:**
```bash
cd offsettingdashboard
npm run build
```

### Run with PM2

Use the provided ecosystem.config.js file:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Nginx Configuration

Configure Nginx to serve the application at login.carbonoz.com pointing to 192.168.160.190.

## Available Scripts

### Backend (server-api)
- `npm run start` - Start production server
- `npm run start:dev` - Start development server with watch mode
- `npm run build` - Build for production
- `npm test` - Unit tests
- `npm run test:e2e` - End-to-end tests against a disposable MongoDB, Redis and
  mock Keycloak (needs `redis-server` on PATH; downloads a MongoDB binary)
- `npm run audit:admins` - Read-only report of ADMIN/SUB_ADMIN accounts
- `npm run prisma:studio` - Open Prisma Studio

### Frontend (offsettingdashboard)
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm test` - Unit tests (Solar data model)
- `npm run typecheck` - TypeScript check
- `npm run preview` - Preview production build

## License

UNLICENSED - Private
