# NBA Bracket Challenge 2025-26

A real-time bracket prediction app for the 2026 NBA Playoffs. 6 players fill out brackets on their own devices, and everything syncs live via Firebase.

---

## Firebase Setup (5 minutes, free)

### 1. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → name it anything (e.g. `nba-bracket`) → click through the steps → **Create project**

### 2. Create a Realtime Database

1. In the Firebase console sidebar, click **Build → Realtime Database**
2. Click **Create Database**
3. Choose a location (pick the one closest to you)
4. Select **Start in test mode** → click **Enable**

> **Note:** Test mode allows open read/write for 30 days, which is fine for the playoffs. If you want it to last longer, go to the **Rules** tab and set:
> ```json
> {
>   "rules": {
>     ".read": true,
>     ".write": true
>   }
> }
> ```

### 3. Register a web app

1. On the project overview page, click the **</>** (web) icon to add a web app
2. Give it a nickname (e.g. `bracket-app`) — you do NOT need Firebase Hosting
3. Click **Register app**
4. You'll see a `firebaseConfig` object — copy it

### 4. Paste the config

Open `src/firebase.js` and replace the placeholder config with your values:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "nba-bracket-xxxxx.firebaseapp.com",
  databaseURL: "https://nba-bracket-xxxxx-default-rtdb.firebaseio.com",
  projectId: "nba-bracket-xxxxx",
  storageBucket: "nba-bracket-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef",
};
```

That's it for Firebase.

---

## Local Development

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`. Share your local network URL with friends to test multi-device.

---

## Deploy to GitHub Pages

### 1. Create a GitHub repo

Go to github.com → **New repository** → name it (e.g. `nba-bracket-challenge`)

### 2. Set the base path

Open `vite.config.js` and set `base` to match your repo name:

```js
base: '/nba-bracket-challenge/',
```

### 3. Push

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/nba-bracket-challenge.git
git push -u origin main
```

### 4. Deploy

```bash
npm run deploy
```

### 5. Enable Pages

Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch: `gh-pages` / `/ (root)` → **Save**

Live at: `https://YOUR_USERNAME.github.io/nba-bracket-challenge/`

To redeploy after changes: `npm run deploy`

---

## How It Works

- **Multi-device**: Everyone opens the same URL, enters their name, and fills out their bracket on their own phone/laptop. All data syncs in real time via Firebase.
- **Locking**: Brackets lock automatically on April 18, 2026 at noon ET. No edits after that.
- **Admin mode**: Select "Actual Results (Admin)" from the dropdown to enter real outcomes as games finish. Everyone's scores update live.
- **Scoring**: First Round = 10 pts · Conf. Semis = 20 pts · Conf. Finals = 40 pts · NBA Finals = 80 pts · **Max: 240**
- **Viewing**: Use the dropdown to peek at anyone's bracket, but you can only edit your own.
- **Remember me**: The app stores your name locally so you don't have to re-select each visit.
