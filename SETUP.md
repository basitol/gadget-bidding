# Gadget Bidding System - Setup Guide

## Prerequisites

1. **Node.js** >= 18.0.0
2. **pnpm** >= 8.0.0
3. **PostgreSQL** >= 14
4. **Redis** >= 6

## Installation Steps

### 1. Install Dependencies

Dependencies are already installed! If you need to reinstall:

```bash
pnpm install
```

### 2. Set Up PostgreSQL Database

```bash
# Create database
createdb gadget_bidding

# Run schema
psql gadget_bidding < packages/backend/src/database/schema.sql

# Verify tables were created
psql gadget_bidding -c "\dt"
```

You should see 15 tables created.

### 3. Set Up Redis

```bash
# macOS (using Homebrew)
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis

# Verify Redis is running
redis-cli ping
# Should return: PONG
```

### 4. Configure Environment Variables

```bash
# Copy example env file
cp packages/backend/.env.example packages/backend/.env
```

Edit `packages/backend/.env` with your configuration:

```env
# Minimum required for local development:
NODE_ENV=development
PORT=3000

# Database (adjust if needed)
DATABASE_URL=postgresql://postgres:password@localhost:5432/gadget_bidding

# Redis
REDIS_URL=redis://localhost:6379

# JWT Secrets (change these!)
JWT_SECRET=your_super_secret_jwt_key_here
JWT_REFRESH_SECRET=your_super_secret_refresh_key_here

# For SMS OTP (get from https://termii.com)
TERMII_API_KEY=your_termii_api_key
TERMII_SENDER_ID=GadgetBid

# For payments (get test keys from Paystack/Flutterwave)
PAYSTACK_SECRET_KEY=sk_test_your_key_here
FLUTTERWAVE_SECRET_KEY=FLWSECK_TEST-your_key_here

# For image uploads (get from Cloudinary)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### 5. Start the Backend Server

```bash
pnpm dev:backend
```

You should see:
```
✅ Database connected
✅ Redis connected
🚀 Server running on port 3000 in development mode
📡 API available at http://localhost:3000/api/v1
```

## Testing the Authentication API

### Health Check

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-...",
  "uptime": 1.234,
  "environment": "development"
}
```

### 1. Register a New User

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "+2348012345678",
    "full_name": "John Doe",
    "email": "john@example.com",
    "password": "Password123"
  }'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "verification_id": "uuid-here",
    "message": "OTP sent to your phone number"
  },
  "message": "Registration successful. Please verify your phone number"
}
```

**Note:** In development, check your terminal/logs to see the OTP code since SMS won't actually be sent without Termii credentials.

### 2. Verify OTP

```bash
curl -X POST http://localhost:3000/api/v1/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "verification_id": "uuid-from-registration",
    "otp": "123456"
  }'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "uuid",
      "phone_number": "+2348012345678",
      "full_name": "John Doe",
      "email": "john@example.com",
      "role": "user",
      "is_verified": true,
      "is_active": true
    }
  },
  "message": "Phone number verified successfully"
}
```

### 3. Login

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "+2348012345678",
    "password": "Password123"
  }'
```

Expected response (same as verify-otp):
```json
{
  "success": true,
  "data": {
    "access_token": "...",
    "refresh_token": "...",
    "user": { ... }
  }
}
```

### 4. Get Current User Profile (Protected Route)

```bash
curl http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 5. Refresh Access Token

```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "YOUR_REFRESH_TOKEN"
  }'
```

### 6. Logout

```bash
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "YOUR_REFRESH_TOKEN"
  }'
```

### 7. Resend OTP

```bash
curl -X POST http://localhost:3000/api/v1/auth/resend-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "+2348012345678"
  }'
```

## Troubleshooting

### Database Connection Issues

```bash
# Check if PostgreSQL is running
pg_isready

# Check if database exists
psql -l | grep gadget_bidding

# Check database connection
psql gadget_bidding -c "SELECT 1"
```

### Redis Connection Issues

```bash
# Check if Redis is running
redis-cli ping

# Start Redis
brew services start redis  # macOS
sudo systemctl start redis  # Linux
```

### Port Already in Use

If port 3000 is already in use, change it in `.env`:
```env
PORT=3001
```

### OTP Not Showing

Without Termii API key, OTPs won't be sent via SMS. For testing:
1. Check the database directly:
   ```bash
   psql gadget_bidding -c "SELECT verification_code FROM user_verifications ORDER BY created_at DESC LIMIT 1"
   ```
2. Or check server logs for the OTP

### TypeScript Errors

If you see TypeScript errors, rebuild the shared package:
```bash
cd packages/shared
pnpm build
```

## Database Queries for Testing

### Check registered users
```sql
SELECT id, phone_number, full_name, is_verified FROM users;
```

### Check wallet balances
```sql
SELECT u.full_name, w.balance FROM wallets w
JOIN users u ON w.user_id = u.id;
```

### Check OTP codes
```sql
SELECT v.verification_code, v.expires_at, v.is_verified, u.phone_number
FROM user_verifications v
JOIN users u ON v.user_id = u.id
ORDER BY v.created_at DESC
LIMIT 5;
```

### Check refresh tokens
```sql
SELECT u.phone_number, rt.expires_at, rt.is_revoked
FROM refresh_tokens rt
JOIN users u ON rt.user_id = u.id
ORDER BY rt.created_at DESC;
```

## Next Steps

After confirming authentication works:

1. **Build Wallet Service** - Fund wallet, view balance, transactions
2. **Build Auction Service** - Create auctions, list gadgets
3. **Build Bidding Service** - Place bids with escrow
4. **Add Socket.io** - Real-time bidding
5. **Build Mobile App** - React Native interface

## API Documentation

Full API documentation available at:
- Postman Collection: (to be created)
- Swagger UI: (to be added)

## Support

For issues:
1. Check logs in terminal
2. Verify PostgreSQL and Redis are running
3. Check environment variables
4. Review database schema
