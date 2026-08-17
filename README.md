# Gadget Bidding System

A Nigerian gadget auction platform with real-time bidding, featuring React Native mobile apps and Node.js backend.

## Features

- Real-time English auction bidding
- Wallet system with multiple payment gateways
- Paystack, Monnify, and bank transfer integration
- SMS notifications via Termii
- Push notifications
- Secure escrow system for bids
- Nigerian-optimized (Naira currency, offline support)

## Tech Stack

### Mobile
- React Native (iOS/Android)
- React Navigation
- Socket.io client
- Redux Toolkit/Zustand

### Backend
- Node.js + Express + TypeScript
- PostgreSQL (ACID compliance)
- Socket.io (real-time)
- Redis (pub/sub, caching)
- Bull (background jobs)

### Infrastructure
- Railway/Render (hosting)
- Cloudinary (image storage)
- Termii (SMS)
- FCM (push notifications)

## Project Structure

```
gadget-bidding/
├── packages/
│   ├── backend/          # Node.js API server
│   ├── mobile/           # React Native app
│   ├── shared/           # Shared TypeScript types
│   └── admin-dashboard/  # Admin backoffice (Vite)
├── pnpm-workspace.yaml
└── package.json
```

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- PostgreSQL >= 14
- Redis >= 6

### Installation

1. Install dependencies:
```bash
pnpm install
```

2. Set up environment variables:
```bash
# Backend
cp packages/backend/.env.example packages/backend/.env

# Mobile
cp packages/mobile/.env.example packages/mobile/.env
```

3. Set up PostgreSQL database:
```bash
# Create database
createdb gadget_bidding

# Run migrations
cd packages/backend
pnpm migrate
```

4. Start development servers:
```bash
# Backend
pnpm dev:backend

# Mobile (in another terminal)
pnpm dev:mobile
```

## Scripts

- `pnpm dev:backend` - Start backend dev server
- `pnpm dev:mobile` - Start React Native dev server
- `pnpm build:backend` - Build backend for production
- `pnpm lint` - Lint all packages
- `pnpm format` - Format code with Prettier
- `pnpm test` - Run tests

## Environment Variables

### Backend (.env)
```
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/gadget_bidding
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret

# Payment Gateways
PAYSTACK_SECRET_KEY=sk_test_xxx
MONNIFY_API_KEY=MK_TEST_xxx
MONNIFY_SECRET_KEY=xxx
MONNIFY_CONTRACT_CODE=xxx

# SMS
TERMII_API_KEY=xxx
TERMII_SENDER_ID=GadgetBid

# Cloudinary
CLOUDINARY_CLOUD_NAME=xxx
CLOUDINARY_API_KEY=xxx
CLOUDINARY_API_SECRET=xxx
```

### Mobile (.env)
```
API_URL=http://localhost:3000
SOCKET_URL=http://localhost:3000
```

## Database Schema

15 core tables:
- users, user_verifications, refresh_tokens
- wallets, wallet_transactions, payment_transactions
- gadget_categories, gadgets
- auctions, bids, bid_holds
- orders, notifications, disputes, audit_logs

User roles: `bidder` (buyer), `seller`, `admin`

See `packages/backend/src/database/schema.sql` for full schema.

## API Documentation

Base URL: `http://localhost:3000/api/v1`

### Endpoints
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login
- `GET /auctions` - List auctions
- `POST /auctions/:id/place-bid` - Place bid
- `GET /wallet/balance` - Get wallet balance

See plan file for complete API documentation.

## Architecture

### Real-time Bidding Flow
1. User joins auction room via Socket.io
2. Places bid through REST API
3. Server validates with PostgreSQL row-level locking
4. Broadcasts bid to all users in room
5. Updates auction state in real-time

### Payment Flow
1. User funds wallet via Paystack/Monnify
2. Gateway webhook verifies payment
3. Wallet balance updated
4. When bidding, amount held in escrow (bid_holds)
5. Winner charged, losers refunded automatically

## Security

- JWT authentication (15-min access, 30-day refresh)
- PostgreSQL transactions for bid integrity
- Webhook signature verification
- Rate limiting on all endpoints
- bcrypt password hashing
- HTTPS only in production

## Testing

```bash
# Unit tests
pnpm test

# E2E tests
pnpm test:e2e

# Load testing
pnpm test:load
```

## Deployment

### Backend
```bash
# Build
pnpm build:backend

# Start production
pnpm start:backend
```

### Mobile
```bash
# Build Android APK
cd packages/mobile
eas build --platform android

# Build iOS
eas build --platform ios
```

## Contributing

1. Create a feature branch
2. Make changes
3. Run tests and linting
4. Submit pull request

## License

Proprietary - All rights reserved

## Support

For issues and questions, contact: support@gadgetbid.ng
