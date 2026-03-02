# Carbonoz Login & Dashboard Application

Full-stack application with React frontend and NestJS backend for carbon offsetting management.

## Prerequisites

- Node.js 18+ and npm/yarn
- MongoDB with replica set enabled
- Redis server
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

**Backend (.env in server-api/):**
```env
DATABASE_URL="mongodb://localhost:27017/carbonoz?replicaSet=rs0"
JWT_SECRET="your-secret-key-change-this-in-production"
NODE_ENV=production
PORT=3000
REDIS_URL=redis://192.168.160.155
FRONTED_URL=http://login.carbonoz.com
ADMIN_EMAIL=admin@carbonoz.com
ADMIN_PASSWORD=Admin@123
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_MODE=sandbox
STRIPE_SECRET_KEY=your_stripe_secret_key
```

**Frontend (.env in offsettingdashboard/):**
```env
VITE_API_URL=http://192.168.160.190:3000/api
VITE_PAYPAL_CLIENT_ID=your_paypal_client_id
VITE_STRIPE_PUBLIC_KEY=your_stripe_public_key
VITE_GRAFANA_URL=http://192.168.160.185:3001
```

### 4. Setup MongoDB Replica Set
```bash
cd server-api
chmod +x setup-mongo-replica.sh
./setup-mongo-replica.sh
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
- `npm run prisma:studio` - Open Prisma Studio

### Frontend (offsettingdashboard)
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## License

UNLICENSED - Private
