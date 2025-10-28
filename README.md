# OrganLink Backend

Decentralized Organ Donation Platform - Node.js + Express + PostgreSQL Backend

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### Local Development

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your configuration

3. **Set up database**
   ```bash
   # Create database
   createdb organlink_db
   
   # Run migrations
   npm run migrate:latest
   ```

4. **Run development server**
   ```bash
   npm run dev
   ```

## 📦 Deployment on Render

### Step-by-Step Render Deployment

#### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/vignesh1973-creator/organlink-backend.git
git push -u origin main
```

#### 2. Create PostgreSQL Database on Render

1. Go to [https://render.com](https://render.com)
2. Click "New" → "PostgreSQL"
3. Configure:
   - **Name**: `organlink-db`
   - **Database**: `organlink_db`
   - **User**: `organlink_user`
   - **Region**: Choose closest to your users
   - **Plan**: Free (for testing) or Starter ($7/month for production)
4. Click "Create Database"
5. **Copy the Internal Database URL** (starts with `postgresql://...`)

#### 3. Deploy Backend Web Service

1. Click "New" → "Web Service"
2. Connect your GitHub repository `organlink-backend`
3. Configure:
   - **Name**: `organlink-backend`
   - **Region**: Same as database
   - **Branch**: `main`
   - **Root Directory**: Leave empty (or `server` if in monorepo)
   - **Runtime**: Node
   - **Build Command**: `npm install && npm run migrate:latest`
   - **Start Command**: `npm start`
   - **Plan**: Free (for testing) or Starter ($7/month)

#### 4. Set Environment Variables

In Render dashboard → Your web service → Environment tab, add:

```env
NODE_ENV=production
PORT=3000

# Database (Use Internal Database URL from step 2)
DATABASE_URL=postgresql://organlink_user:password@dpg-xxxxx/organlink_db

# JWT Secrets (Generate strong random strings)
JWT_SECRET=your-generated-super-secret-key
REFRESH_TOKEN_SECRET=your-generated-refresh-secret

# Frontend URL (Update after Vercel deployment)
FRONTEND_URL=https://your-frontend.vercel.app

# Blockchain (Use your actual values)
BLOCKCHAIN_NETWORK=sepolia
PRIVATE_KEY=your-ethereum-private-key
CONTRACT_ADDRESS=your-contract-address
RPC_URL=https://sepolia.infura.io/v3/your-infura-id

# IPFS (If using local IPFS or Pinata)
IPFS_API_URL=http://127.0.0.1:5001

# Admin
ADMIN_EMAIL=admin@organlink.org
ADMIN_PASSWORD=your-secure-password

# Security
BCRYPT_ROUNDS=10
SESSION_SECRET=your-session-secret

# Optional
LOG_LEVEL=info
```

#### 5. Deploy

1. Click "Create Web Service"
2. Wait for deployment (5-10 minutes)
3. Your backend will be live at `https://organlink-backend.onrender.com`

#### 6. Run Database Migrations

After first deployment:
1. Go to your web service → "Shell" tab
2. Run:
   ```bash
   npm run migrate:latest
   ```

### Important Notes for Render

1. **Free Tier Limitations**:
   - Spins down after 15 minutes of inactivity
   - First request after spin-down takes 30-60 seconds
   - Use Starter plan ($7/month) to keep always active

2. **Database Backups**:
   - Free PostgreSQL: No backups
   - Paid plans: Automatic daily backups

3. **Health Checks**:
   - Render automatically checks `/` endpoint
   - Make sure your root endpoint returns 200 OK

4. **Logs**:
   - Access via Dashboard → Logs tab
   - Enable persistent logs in paid plans

## 🗄️ Database Migrations

```bash
# Create new migration
npm run migrate:make migration_name

# Run all pending migrations
npm run migrate:latest

# Rollback last migration
npm run migrate:rollback

# Rollback all migrations
npm run migrate:rollback:all
```

## 🔧 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for JWT tokens |
| `FRONTEND_URL` | Yes | Frontend URL for CORS |
| `PORT` | No | Server port (default: 3000) |
| `BLOCKCHAIN_NETWORK` | Yes | Ethereum network (sepolia) |
| `PRIVATE_KEY` | Yes | Ethereum private key |
| `CONTRACT_ADDRESS` | Yes | Smart contract address |
| `RPC_URL` | Yes | Ethereum RPC endpoint |

## 🏗️ Tech Stack

- **Node.js** - Runtime
- **Express** - Web framework
- **PostgreSQL** - Database
- **Knex.js** - Query builder & migrations
- **JWT** - Authentication
- **Ethers.js** - Blockchain integration
- **IPFS** - Decentralized storage

## 📁 Project Structure

```
server/
├── db/
│   ├── migrations/     # Database migrations
│   └── knexfile.js     # DB configuration
├── routes/
│   ├── admin/          # Admin endpoints
│   ├── hospital/       # Hospital endpoints
│   └── organization/   # Organization endpoints
├── middleware/         # Auth, validation, etc.
├── utils/              # Helper functions
├── contracts/          # Smart contract ABIs
└── index.js            # Entry point
```

## 🔐 Security

- JWT-based authentication
- bcrypt password hashing
- SQL injection protection (Knex)
- XSS protection
- CORS configuration
- Rate limiting
- Helmet security headers

## 🧪 Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage
```

## 📝 API Documentation

Base URL: `https://organlink-backend.onrender.com/api`

### Endpoints

- `POST /api/admin/login` - Admin login
- `POST /api/hospital/login` - Hospital login
- `POST /api/hospital/patients/register` - Register patient
- `POST /api/hospital/donors/register` - Register donor
- `GET /api/hospital/matching/ai-matches` - Get AI matches
- And more...

## 🚨 Troubleshooting

### Database Connection Issues
```bash
# Check DATABASE_URL format
postgresql://user:password@host:port/database

# Test connection
psql $DATABASE_URL
```

### Migration Failures
```bash
# Reset database (⚠️ DESTROYS DATA)
npm run migrate:rollback:all
npm run migrate:latest
```

### Render Deployment Fails
1. Check build logs in Render dashboard
2. Verify all environment variables are set
3. Ensure `package.json` has correct start script

## 📞 Support

For issues, contact: vignesh@organlink.org

## 📝 License

MIT License

---

**Production Checklist**:
- [ ] Strong JWT secrets generated
- [ ] Database backups enabled
- [ ] HTTPS enforced
- [ ] Rate limiting configured
- [ ] Error logging set up
- [ ] Environment variables secured
- [ ] Frontend URL updated in CORS
