# OrganLink Backend - Deployment with NeonDB

Production deployment guide for OrganLink backend using **NeonDB (Neon.tech)** PostgreSQL and **Render** hosting.

---

## 🗄️ Why NeonDB?

You're using NeonDB instead of Render PostgreSQL because:
- ✅ **Generous Free Tier**: 0.5GB storage, 1GB data transfer/month
- ✅ **No Cold Starts**: Database is always ready
- ✅ **Auto Backups**: Automatic backups even on free tier
- ✅ **Serverless**: Auto-scaling compute
- ✅ **Better Performance**: Faster than Render free PostgreSQL
- ✅ **Automatic SSL**: Built-in security

---

## 📦 Complete Deployment Guide

### Step 1: Get NeonDB Connection String

1. Go to your NeonDB dashboard: https://console.neon.tech
2. Select your project (e.g., `organlink`)
3. Click **Dashboard** → **Connection Details**
4. Copy the **Connection String** (it looks like this):
   ```
   postgresql://username:password@ep-xxx-xxx.region.aws.neon.tech/organlink?sslmode=require
   ```
5. **⭐ Keep this URL safe** - you'll need it in Step 3!

---

### Step 2: Push Code to GitHub (If not done yet)

```bash
cd C:\Users\HP\builder-organlink\server
git init
git add .
git commit -m "Backend with NeonDB support"
git branch -M main
git remote add origin https://github.com/vignesh1973-creator/organlink-backend.git
git push -u origin main
```

---

### Step 3: Deploy on Render

#### 3.1 Create Web Service

1. Go to https://dashboard.render.com
2. Click **"New +"** → **"Web Service"**
3. Click **"Connect a repository"**
4. Select **"organlink-backend"** from your GitHub repos
5. Click **"Connect"**

#### 3.2 Configure Service

Fill in these settings:

**Basic Settings:**
- **Name**: `organlink-backend`
- **Region**: Choose closest to you (e.g., Singapore for Asia)
- **Branch**: `main`
- **Root Directory**: Leave empty
- **Runtime**: `Node`

**Build & Deploy:**
- **Build Command**: 
  ```
  npm install && npm run migrate:latest
  ```
- **Start Command**: 
  ```
  npm start
  ```

**Instance Type:**
- **Free** (for testing - spins down after 15min inactivity)
- **Starter $7/month** (recommended for production - always on)

#### 3.3 Add Environment Variables

Click **"Advanced"** → **"Add Environment Variable"**

Add these variables **ONE BY ONE**:

```env
NODE_ENV=production
```

```env
PORT=3000
```

```env
DATABASE_URL=postgresql://username:password@ep-xxx-xxx.region.aws.neon.tech/organlink?sslmode=require
```
> ⭐ Replace with YOUR NeonDB connection string from Step 1!

```env
JWT_SECRET=OrganLink2025SecureJWTSecret!@#$%^&*
```

```env
REFRESH_TOKEN_SECRET=OrganLinkRefreshToken2025Secure!@#$%^
```

```env
FRONTEND_URL=https://organlink-frontend.vercel.app
```
> ⚠️ You'll update this after deploying frontend in Step 4!

```env
BLOCKCHAIN_NETWORK=sepolia
```

```env
PRIVATE_KEY=your_ethereum_private_key_here
```
> ⭐ Replace with your Sepolia testnet private key (without 0x prefix)

```env
CONTRACT_ADDRESS=your_contract_address_here
```
> ⭐ Replace with your deployed smart contract address

```env
RPC_URL=https://sepolia.infura.io/v3/your_infura_project_id
```
> ⭐ Replace with your Infura project ID

```env
IPFS_API_URL=http://127.0.0.1:5001
```

```env
ADMIN_EMAIL=admin@organlink.org
```

```env
ADMIN_PASSWORD=YourSecureAdminPassword123!
```
> ⭐ Create a strong password for admin login

```env
BCRYPT_ROUNDS=10
```

```env
SESSION_SECRET=OrganLinkSessionSecret2025!@#$%^
```

```env
LOG_LEVEL=info
```

#### 3.4 Deploy Backend

1. Click **"Create Web Service"**
2. Wait for deployment (5-10 minutes)
3. Watch the build logs for any errors
4. Once deployed, you'll see: **"Your service is live 🎉"**
5. **⭐ COPY YOUR BACKEND URL**: `https://organlink-backend-xxxx.onrender.com`

#### 3.5 Verify Backend Works

Open your backend URL in browser: `https://organlink-backend-xxxx.onrender.com`

You should see:
```json
{"message": "OrganLink API is running", "status": "ok"}
```

---

### Step 4: Deploy Frontend on Vercel

#### 4.1 Connect Repository

1. Go to https://vercel.com/dashboard
2. Click **"Add New..."** → **"Project"**
3. Click **"Import Git Repository"**
4. Select **"organlink-frontend"** repository
5. Click **"Import"**

#### 4.2 Configure Project

**Framework Preset**: Vite (auto-detected)

**Build Settings**:
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

**Root Directory**: `/` (leave as is)

#### 4.3 Add Environment Variable

In **"Environment Variables"** section:

**Key**: `VITE_API_URL`  
**Value**: `https://organlink-backend-xxxx.onrender.com`

> ⭐ Use YOUR backend URL from Step 3.4!
> ⚠️ Don't add quotes in Vercel!

#### 4.4 Deploy Frontend

1. Click **"Deploy"**
2. Wait for build (3-5 minutes)
3. Once done, click **"Visit"** or copy the URL
4. **⭐ YOUR FRONTEND IS LIVE**: `https://organlink-frontend-xxxx.vercel.app`

---

### Step 5: Update Backend CORS

Now that you have your frontend URL, update backend:

1. Go back to Render dashboard
2. Click on your **organlink-backend** service
3. Click **"Environment"** tab
4. Find **`FRONTEND_URL`** variable
5. **Update value** to your actual Vercel URL:
   ```
   https://organlink-frontend-xxxx.vercel.app
   ```
6. Click **"Save Changes"**
7. Backend will automatically redeploy (1-2 minutes)

---

### Step 6: Run Database Migrations (If needed)

If migrations didn't run during build:

1. In Render dashboard → Your service
2. Click **"Shell"** tab (top right)
3. Wait for shell to connect
4. Run:
   ```bash
   npm run migrate:latest
   ```
5. Verify migrations succeeded

---

### Step 7: Test Everything

#### 7.1 Test Backend
```
https://your-backend.onrender.com/api/health
```
Should return: `{"status": "ok"}`

#### 7.2 Test Frontend
1. Open `https://your-frontend.vercel.app`
2. Navigate to `/admin/login`
3. Login with:
   - Email: `admin@organlink.org`
   - Password: (your admin password from env vars)

#### 7.3 Test Mobile Responsiveness
1. Open Chrome DevTools (F12)
2. Click device toolbar icon (or Ctrl+Shift+M)
3. Select "iPhone 12 Pro" or "Pixel 5"
4. Test AI Matching page:
   - ✅ Tabs should show 2x2 grid (not cramped row)
   - ✅ Forms should stack properly
   - ✅ Navigation should show hamburger menu

#### 7.4 Test IST Timezone
1. Create a new organ request
2. Note the current time (IST)
3. Check the timestamp in the app
4. ✅ Should match your local IST time (not 5.5 hours behind)

#### 7.5 Test Badge Clearing
1. Go to AI Matching → Received tab
2. Badge should clear when you open the tab
3. ✅ Badge disappears after viewing

---

## 📋 Environment Variables Summary

### Required Variables

| Variable | Example | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://user:pass@ep-xxx.neon.tech/db` | NeonDB connection string |
| `JWT_SECRET` | `long-random-string` | JWT token secret |
| `REFRESH_TOKEN_SECRET` | `another-long-string` | Refresh token secret |
| `FRONTEND_URL` | `https://your-app.vercel.app` | Your Vercel frontend URL |
| `BLOCKCHAIN_NETWORK` | `sepolia` | Ethereum network |
| `PRIVATE_KEY` | `your-private-key` | Ethereum wallet private key |
| `CONTRACT_ADDRESS` | `0x123...` | Smart contract address |
| `RPC_URL` | `https://sepolia.infura.io/v3/xxx` | Ethereum RPC endpoint |
| `ADMIN_EMAIL` | `admin@organlink.org` | Admin login email |
| `ADMIN_PASSWORD` | `SecurePassword123!` | Admin login password |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `production` | Environment |
| `BCRYPT_ROUNDS` | `10` | Password hashing rounds |
| `SESSION_SECRET` | - | Session encryption key |
| `LOG_LEVEL` | `info` | Logging level |

---

## 🚨 Troubleshooting

### Backend Won't Start

**Check Logs**: Render Dashboard → Your Service → Logs

**Common Issues**:
1. **Database connection fails**:
   - Verify `DATABASE_URL` is correct
   - Check NeonDB project is active
   - Ensure `?sslmode=require` is in connection string

2. **Migrations fail**:
   - Run manually via Shell: `npm run migrate:latest`
   - Check database tables in NeonDB console

3. **Port binding error**:
   - Ensure `PORT` env var is set to `3000`
   - Don't hardcode port in code

### Frontend Build Fails

**Check Vercel Logs**: Deployment → Build Logs

**Common Issues**:
1. **API calls fail**:
   - Verify `VITE_API_URL` is set in Vercel
   - Check backend is deployed and running
   - Test backend URL in browser first

2. **CORS errors**:
   - Update `FRONTEND_URL` in Render to exact Vercel URL
   - Must include `https://`
   - No trailing slash

### Database Issues

**Connection Timeout**:
```bash
# Test NeonDB connection
psql "postgresql://user:pass@ep-xxx.neon.tech/db?sslmode=require"
```

**Migrations Not Applied**:
```bash
# In Render Shell
npm run migrate:latest
```

**Table Not Found**:
- Migrations didn't run
- Run migrations manually
- Check migration files exist

---

## 💡 Performance Tips

### NeonDB Optimization

1. **Use Connection Pooling**:
   - NeonDB has built-in pooling
   - No additional setup needed

2. **Monitor Usage**:
   - Check NeonDB dashboard for usage stats
   - Free tier: 0.5GB storage, 1GB transfer/month
   - Upgrade if you exceed limits

### Render Optimization

1. **Upgrade to Starter Plan** ($7/month):
   - No cold starts
   - Always-on service
   - Better performance

2. **Enable Health Checks**:
   - Add `/health` endpoint
   - Render auto-checks every 30 seconds

---

## 🔐 Security Checklist

Before going to production:

- [ ] Strong JWT secrets (32+ characters, random)
- [ ] Strong admin password
- [ ] HTTPS enabled (automatic on Render/Vercel)
- [ ] CORS properly configured
- [ ] Environment variables secured
- [ ] Database credentials not in code
- [ ] API rate limiting enabled
- [ ] Error messages don't expose secrets

---

## 📊 Monitoring

### Render Dashboard
- **Logs**: Real-time application logs
- **Metrics**: CPU, memory, response times
- **Events**: Deployments, restarts, crashes

### NeonDB Console
- **Storage**: Database size and usage
- **Connections**: Active database connections
- **Queries**: Query performance and slow queries

### Vercel Analytics
- **Visits**: Page views and unique visitors
- **Performance**: Core Web Vitals
- **Errors**: Runtime errors and issues

---

## 🎯 Production Checklist

Backend (Render):
- [ ] Code pushed to GitHub
- [ ] NeonDB connection string obtained
- [ ] Web service created on Render
- [ ] All environment variables set
- [ ] Build command includes migrations
- [ ] Deployment successful
- [ ] `/api/health` endpoint responds
- [ ] Database connected (test queries work)
- [ ] CORS configured with frontend URL

Frontend (Vercel):
- [ ] Code pushed to GitHub
- [ ] Repository connected to Vercel
- [ ] Vite build settings configured
- [ ] `VITE_API_URL` environment variable set
- [ ] Deployment successful
- [ ] Site loads correctly
- [ ] API calls to backend work
- [ ] No CORS errors in console

Testing:
- [ ] Admin login works
- [ ] Hospital registration works
- [ ] Patient/Donor registration works
- [ ] AI matching works
- [ ] Timestamps show IST (not UTC)
- [ ] Badge counts clear properly
- [ ] Policy pause/resume works
- [ ] Mobile tabs show 2x2 grid
- [ ] Forms responsive on mobile

---

## 🎉 Success!

Your OrganLink platform is now live with:
- ✅ **Backend**: Deployed on Render with NeonDB
- ✅ **Frontend**: Deployed on Vercel
- ✅ **Database**: Serverless PostgreSQL on NeonDB
- ✅ **Mobile**: Fully responsive design
- ✅ **Timezone**: All timestamps in IST
- ✅ **Features**: Badge clearing, policy pause, etc.

**Share your URLs and start using the platform! 🚀**

---

## 📞 Support

For issues:
1. Check troubleshooting section above
2. Review Render/Vercel/NeonDB logs
3. Test backend endpoint directly
4. Verify all environment variables

**Deployment URLs**:
- Frontend: https://your-app.vercel.app
- Backend: https://your-api.onrender.com
- Database: NeonDB (Neon.tech console)

Good luck! 🎯
