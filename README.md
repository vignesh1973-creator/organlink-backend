# OrganLink Backend

**Decentralized Organ Donation Platform** - Node.js + Express + NeonDB PostgreSQL

---

## 🗄️ Database: NeonDB (Serverless PostgreSQL)

This project uses **NeonDB** - serverless PostgreSQL with:
- ✅ Free tier: 0.5GB storage, 1GB data transfer/month
- ✅ No cold starts - always ready
- ✅ Automatic backups on free tier
- ✅ Auto-scaling compute
- ✅ Built-in SSL

**Your NeonDB Connection:**
```
postgresql://neondb_owner:npg_gV6OIzYPR0Jh@ep-quiet-thunder-adtsc7t7-pooler.c-2.us-east-1.aws.neon.tech/organlink_db?sslmode=require&channel_binding=require
```

---

## 🚀 Deployment Guide - Complete Steps

### STEP 1: Deploy Backend on Render

#### 1.1 Go to Render Dashboard
Visit: https://dashboard.render.com

#### 1.2 Create Web Service
1. Click **"New +"** → **"Web Service"**
2. Click **"Connect a repository"**
3. Select **"organlink-backend"** from GitHub
4. Click **"Connect"**

#### 1.3 Configure Service Settings

Fill in these settings:

**Name**: `organlink-backend`

**Region**: `Singapore` (or closest to you)

**Branch**: `main`

**Root Directory**: *Leave empty*

**Runtime**: `Node`

**Build Command**:
```
npm install && npm run migrate:latest
```

**Start Command**:
```
npm start
```

**Instance Type**: 
- Free (spins down after 15min) 
- **Recommended**: Starter $7/month (always on)

#### 1.4 Add Environment Variables

Click **"Advanced"** → **"Add Environment Variable"**

Add these **ONE BY ONE**:

| Variable | Value | Notes |
|----------|-------|-------|
| `NODE_ENV` | `production` | |
| `PORT` | `3000` | |
| `DATABASE_URL` | `postgresql://neondb_owner:npg_gV6OIzYPR0Jh@ep-quiet-thunder-adtsc7t7-pooler.c-2.us-east-1.aws.neon.tech/organlink_db?sslmode=require&channel_binding=require` | Your NeonDB URL |
| `JWT_SECRET` | `OrganLink2025SecureJWT!@#$%^&*()_+` | Strong random string |
| `REFRESH_TOKEN_SECRET` | `OrganLinkRefresh2025Secure!@#$%^` | Strong random string |
| `FRONTEND_URL` | `https://organlink-frontend.vercel.app` | Update after Vercel deploy |
| `BLOCKCHAIN_NETWORK` | `sepolia` | |
| `PRIVATE_KEY` | `your_ethereum_private_key` | ⚠️ Replace with YOUR key |
| `CONTRACT_ADDRESS` | `your_contract_address` | ⚠️ Replace with YOUR address |
| `RPC_URL` | `https://sepolia.infura.io/v3/YOUR_INFURA_ID` | ⚠️ Replace YOUR_INFURA_ID |
| `IPFS_API_URL` | `http://127.0.0.1:5001` | |
| `ADMIN_EMAIL` | `admin@organlink.org` | |
| `ADMIN_PASSWORD` | `Admin@Organ2025!` | ⚠️ Change this! |
| `BCRYPT_ROUNDS` | `10` | |
| `SESSION_SECRET` | `OrganLinkSession2025!@#$%^&*` | |
| `LOG_LEVEL` | `info` | |

> **⚠️ IMPORTANT**: Replace these with YOUR actual values:
> - `PRIVATE_KEY` - Your Ethereum Sepolia private key
> - `CONTRACT_ADDRESS` - Your deployed contract address  
> - `RPC_URL` - Your Infura/Alchemy project ID
> - `ADMIN_PASSWORD` - Create a strong password

#### 1.5 Deploy Backend

1. Click **"Create Web Service"**
2. Wait 5-10 minutes for deployment
3. Watch build logs for errors
4. Once live: **"Your service is live 🎉"**
5. **⭐ COPY YOUR BACKEND URL**:
   ```
   https://organlink-backend-XXXX.onrender.com
   ```

#### 1.6 Verify Backend Works

Open in browser: `https://your-backend-url.onrender.com`

Should see:
```json
{"message": "OrganLink API is running", "status": "ok"}
```

---

### STEP 2: Deploy Frontend on Vercel

#### 2.1 Go to Vercel Dashboard
Visit: https://vercel.com/dashboard

#### 2.2 Create New Project
1. Click **"Add New..."** → **"Project"**
2. Click **"Import Git Repository"**
3. Find and select **"organlink-frontend"**
4. Click **"Import"**

#### 2.3 Configure Project

**Framework Preset**: Vite (auto-detected)

**Build Settings**:
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`
- **Root Directory**: `/` (leave as is)

#### 2.4 Add Environment Variable

In **"Environment Variables"** section:

**Key**: `VITE_API_URL`  
**Value**: `https://organlink-backend-XXXX.onrender.com`

> ⭐ Use YOUR actual backend URL from Step 1.5!  
> ⚠️ Don't add quotes in Vercel!

#### 2.5 Deploy Frontend

1. Click **"Deploy"**
2. Wait 3-5 minutes for build
3. Once done, you'll see: **"Congratulations! 🎉"**
4. **⭐ COPY YOUR FRONTEND URL**:
   ```
   https://organlink-frontend-XXXX.vercel.app
   ```

---

### STEP 3: Update Backend CORS

Now link backend with frontend:

1. Go back to **Render Dashboard**
2. Click on **"organlink-backend"** service
3. Click **"Environment"** tab
4. Find `FRONTEND_URL` variable
5. **Click Edit** and update to:
   ```
   https://organlink-frontend-XXXX.vercel.app
   ```
   (Use YOUR actual Vercel URL from Step 2.5)
6. Click **"Save Changes"**
7. Backend will auto-redeploy (1-2 minutes)

---

### STEP 4: Test Everything

#### ✅ Test 1: Backend Health
```
https://your-backend.onrender.com/api/health
```
Should return: `{"status": "ok"}`

#### ✅ Test 2: Admin Login
1. Open: `https://your-frontend.vercel.app`
2. Navigate to: `/admin/login`
3. Login with:
   - **Email**: `admin@organlink.org`
   - **Password**: *(your admin password)*
4. Should successfully login to admin dashboard

#### ✅ Test 3: Mobile Responsiveness
1. Open Chrome DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Select **"iPhone 12 Pro"**
4. Go to **AI Matching** page
5. Check:
   - ✅ Tabs show 2x2 grid (not cramped row)
   - ✅ Forms stack properly on mobile
   - ✅ Navigation shows hamburger menu
   - ✅ All cards responsive

#### ✅ Test 4: IST Timezone
1. Create a new organ request
2. Check the timestamp
3. ✅ Should show IST time (not UTC -5.5 hours)

#### ✅ Test 5: Badge Clearing
1. Go to **AI Matching** → **Received** tab
2. ✅ Badge count should clear when opening tab

---

## 📋 Environment Variables Reference

### Required for Render Backend

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | NeonDB connection string | See above - full URL with SSL |
| `JWT_SECRET` | JWT token secret | Random 32+ character string |
| `REFRESH_TOKEN_SECRET` | Refresh token secret | Random 32+ character string |
| `FRONTEND_URL` | Your Vercel URL | `https://app.vercel.app` |
| `BLOCKCHAIN_NETWORK` | Ethereum network | `sepolia` |
| `PRIVATE_KEY` | Ethereum wallet key | Your private key (no 0x) |
| `CONTRACT_ADDRESS` | Smart contract address | `0x123...` |
| `RPC_URL` | Ethereum RPC endpoint | Infura/Alchemy URL |
| `ADMIN_EMAIL` | Admin login email | `admin@organlink.org` |
| `ADMIN_PASSWORD` | Admin login password | Strong secure password |

### Required for Vercel Frontend

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend URL | `https://api.onrender.com` |

---

## 🚨 Troubleshooting

### Backend Won't Start

**Check Logs**: Render Dashboard → Your Service → Logs tab

**Common Issues**:

1. **Database connection failed**:
   - Verify `DATABASE_URL` is EXACTLY as shown above
   - Check NeonDB dashboard - project should be active
   - Ensure `?sslmode=require&channel_binding=require` is in URL

2. **Migrations failed**:
   ```bash
   # Go to Render → Shell tab → Run:
   npm run migrate:latest
   ```

3. **Port binding error**:
   - Verify `PORT=3000` in environment variables
   - Check `package.json` has correct start script

### Frontend Build Fails

**Check Logs**: Vercel → Deployment → Build Logs

**Common Issues**:

1. **API calls fail**:
   - Verify `VITE_API_URL` is set in Vercel
   - Test backend URL directly in browser first
   - Check browser console for CORS errors

2. **CORS errors** (most common):
   - Update `FRONTEND_URL` in Render to EXACT Vercel URL
   - Must include `https://`
   - No trailing slash `/`
   - After updating, backend will redeploy

### Test NeonDB Connection

```bash
psql "postgresql://neondb_owner:npg_gV6OIzYPR0Jh@ep-quiet-thunder-adtsc7t7-pooler.c-2.us-east-1.aws.neon.tech/organlink_db?sslmode=require&channel_binding=require"
```

If connection works, database is fine. Issue is likely in Render config.

---

## 🔧 Tech Stack

- **Node.js** - JavaScript runtime
- **Express** - Web framework  
- **PostgreSQL (NeonDB)** - Serverless database
- **Knex.js** - Query builder & migrations
- **JWT** - Authentication
- **Ethers.js** - Blockchain integration
- **IPFS** - File storage

---

## 📁 Project Structure

```
server/
├── db/
│   ├── migrations/        # Database migrations
│   └── knexfile.js        # DB configuration
├── routes/
│   ├── admin/             # Admin endpoints
│   ├── hospital/          # Hospital endpoints
│   └── organization/      # Organization endpoints
├── middleware/            # Auth, validation
├── utils/                 # Helper functions
├── contracts/             # Smart contract ABIs
└── index.ts               # Entry point
```

---

## 🗄️ Database Migrations

```bash
# Create new migration
npm run migrate:make migration_name

# Run pending migrations
npm run migrate:latest

# Rollback last migration
npm run migrate:rollback

# Rollback all migrations
npm run migrate:rollback:all
```

---

## 🔐 Security

- ✅ JWT authentication
- ✅ bcrypt password hashing
- ✅ SQL injection protection (Knex)
- ✅ XSS protection
- ✅ CORS configuration
- ✅ Rate limiting
- ✅ Helmet security headers
- ✅ HTTPS enforced (Render + Vercel)

---

## 📝 API Endpoints

Base URL: `https://your-backend.onrender.com/api`

### Authentication
- `POST /api/admin/login` - Admin login
- `POST /api/hospital/login` - Hospital login
- `POST /api/organization/login` - Organization login

### Hospital
- `POST /api/hospital/patients/register` - Register patient
- `POST /api/hospital/donors/register` - Register donor
- `GET /api/hospital/matching/ai-matches` - Get AI matches
- `POST /api/hospital/matching/request` - Send match request
- `GET /api/hospital/matching/received-requests` - Received requests

### Organization
- `GET /api/organization/policies` - Get policies
- `POST /api/organization/policies/propose` - Propose policy
- `POST /api/organization/policies/:id/vote` - Vote on policy
- `POST /api/organization/policies/:id/toggle-pause` - Pause policy

### Admin
- `GET /api/admin/hospitals` - List hospitals
- `GET /api/admin/organizations` - List organizations
- `GET /api/admin/logs/blockchain` - Blockchain logs

---

## ✅ Deployment Checklist

**Backend (Render + NeonDB)**:
- [ ] Repository pushed to GitHub
- [ ] NeonDB connection string ready
- [ ] Web service created on Render
- [ ] All 15 environment variables added
- [ ] Build command includes migrations
- [ ] Deployment successful (no errors)
- [ ] Backend URL accessible
- [ ] `/api/health` endpoint responds
- [ ] Migrations ran successfully

**Frontend (Vercel)**:
- [ ] Repository pushed to GitHub
- [ ] Project connected to Vercel
- [ ] Vite detected as framework
- [ ] `VITE_API_URL` environment variable set
- [ ] Build successful (no errors)
- [ ] Frontend URL accessible
- [ ] API calls to backend work
- [ ] No CORS errors in console

**Integration**:
- [ ] `FRONTEND_URL` updated in Render backend
- [ ] Backend redeployed after CORS update
- [ ] Admin login works
- [ ] Can register hospital
- [ ] Can register patient/donor
- [ ] AI matching works
- [ ] Timestamps show IST (not UTC)
- [ ] Badge counts clear properly
- [ ] Mobile tabs show 2x2 grid
- [ ] All forms responsive

---

## 🎉 Success!

Your OrganLink platform is now live:
- ✅ Backend on Render with NeonDB
- ✅ Frontend on Vercel
- ✅ Mobile-responsive design
- ✅ IST timezone display
- ✅ All features working

**Your URLs**:
- **Frontend**: `https://organlink-frontend-XXXX.vercel.app`
- **Backend**: `https://organlink-backend-XXXX.onrender.com`
- **Database**: NeonDB Console (console.neon.tech)

---

## 📞 Support

For deployment help:
1. Check troubleshooting section above
2. Review Render/Vercel logs
3. Test backend endpoint directly
4. Verify environment variables

Contact: vignesh@organlink.org

---

## 📝 License

MIT License

---

**Ready to deploy? Follow Steps 1-4 above! 🚀**
