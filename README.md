# Mémoire — Private Photo Vault

A beautiful, self-hosted photo storage app with login protection, gallery view, and drag-and-drop uploads.

---

## ✦ Features
- Password-protected login
- Drag & drop or click-to-upload (multiple photos at once)
- Elegant dark gallery with lightbox viewer
- Captions for your photos
- Delete photos from your vault
- Photos stored on your own server

---

## ✦ Quick Start (Local)

### 1. Install Node.js
Download from https://nodejs.org (v18 or higher)

### 2. Install dependencies
```bash
cd memoire-photo-vault
npm install
```

### 3. Run the server
```bash
npm start
```

### 4. Open in browser
Go to http://localhost:3000

**Default credentials:**
- Username: `admin`
- Password: `memories123`

> ⚠️ Change your password! See "Changing Credentials" below.

---

## ✦ Changing Credentials

Open `server.js` and find this section near the top:

```js
db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('admin', hash);
```

To change credentials, **delete `photos.db`** (this resets everything) then edit the seeded username and the `bcrypt.hashSync('memories123', 10)` call with your new password before restarting.

Or better — add a `/api/change-password` route (ask Claude to add this!).

---

## ✦ Deploy to the Web (Free)

### Option A: Railway.app (Recommended — easiest)
1. Go to https://railway.app and sign up
2. Click "New Project" → "Deploy from GitHub repo"
3. Push this folder to GitHub first, then connect it
4. Railway auto-detects Node.js and runs `npm start`
5. Go to Settings → Add a custom domain or use the generated URL

### Option B: Render.com
1. Go to https://render.com
2. New → Web Service → Connect your GitHub repo
3. Build command: `npm install`
4. Start command: `node server.js`
5. Free tier available

### Option C: VPS (DigitalOcean, Linode, etc.)
1. SSH into your server
2. Install Node.js and git
3. Clone your repo, run `npm install && npm start`
4. Use `pm2` to keep it running: `npm i -g pm2 && pm2 start server.js`

---

## ✦ Important for Production

Set this environment variable on your host:
```
SESSION_SECRET=some-very-long-random-string-here
```

Photos are stored in the `uploads/` folder on your server. Back this up regularly!

---

## ✦ Tech Stack
- **Backend**: Node.js + Express
- **Database**: SQLite (via better-sqlite3)
- **Auth**: bcrypt + express-session
- **File uploads**: Multer
- **Frontend**: Vanilla HTML/CSS/JS
