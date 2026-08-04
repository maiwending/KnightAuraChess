# KnightAuraChess

A full-stack, real-time multiplayer chess variant where pieces near knights gain the ability to jump over blocking pieces. 

KnightAuraChess features a completely custom game engine that natively supports advanced jump logic, a resilient offline Artificial Intelligence opponent, and a fully integrated Firebase Cloud backend for anonymous & registered online matchmaking with a complete Elo Rating system.

## 🌟 Key Features

*   **Custom Game Engine:** Built on top of `chess.js`, the custom `KnightJumpChess` engine validates completely new move modalities, enforces check/checkmate variant rules, and prevents pseudo-legal jump checks.
*   **Real-Time Multiplayer:** Instant matchmaking and live board synchronization powered by Firebase Firestore. Play with friends via Game ID or match globally.
*   **Elo Rating System:** Earn and lose points based on game outcomes (Checkmate, Draw, King Capture, and Resignation penalties). The UI live-updates your rating immediately when the match concludes.
*   **Web Worker AI Engine:** A powerful Minimax chess AI with Alpha-Beta pruning runs in an isolated background thread. Play perfectly smoothly against the AI offline without ever freezing the UI.
*   **Google Auth & Guest Profiles:** Sign in with Google to save your Elo rating permanently, or play instantly as a Guest with a temporary generated profile.
*   **Cloudflare Pages Optimization:** Lightning-fast PWA deployment structure.

## 🧱 Project Structure

At a high level, the app is split into a few clear layers:

- [`src/main.jsx`](./src/main.jsx) bootstraps React and wraps the app with auth state.
- [`src/App.jsx`](./src/App.jsx) is the main controller for routing, game state, AI, clocks, and online play.
- [`src/components/`](./src/components) contains the visible UI: board shell, sidebar, pages, modals, and social panels.
- [`src/KnightJumpChess.js`](./src/KnightJumpChess.js) implements the custom chess variant rules.
- [`src/utils/`](./src/utils) holds Firebase, move API, text AI, and helper modules.
- [`src/workers/`](./src/workers) contains background logic such as offline AI and online clock helpers.
- [`functions/api/`](./functions/api) contains the serverless endpoints used by the frontend.
- [`firestore.rules`](./firestore.rules) defines the Firestore security rules for online features.

The runtime flow is:

`main.jsx` -> `AuthProvider` -> `App.jsx` -> `AppPageRouter` -> board/sidebar/pages

That split makes it easier to reason about where a bug belongs:
- UI issues usually live in `src/components/`
- rules issues usually live in `src/KnightJumpChess.js`
- cloud/auth issues usually live in `src/utils/`, `src/contexts/`, or `functions/api/`

## 🎮 Variant Rules

### Core Mechanic: Knight Proximity Jumping

**Jump Ability Trigger:**
*   A piece can jump if it is **adjacent to** OR **within a knight's move** of a **friendly knight** (same color).
*   Adjacent means horizontally, vertically, or diagonally next to a knight.
*   Knight's move means the standard L-shape (2 squares in one direction, 1 in perpendicular).
*   **Important**: Only friendly knights enable jumping—enemy knights do not grant the aura.

**Jump Rules:**
1.  **Standard Pieces (Rook, Bishop, Queen)**:
    *   Move along their normal paths.
    *   Can jump over **ONE blocking piece** along that path.
    *   After jumping, they continue sliding normally and can land on any empty square beyond the jumped piece.
    *   Can capture an enemy piece after the jump (stops there).
    *   Stops when hitting a friendly piece after the jump.
2.  **Pawns**:
    *   Can jump **one square forward** when blocked (landing two squares ahead).
    *   Can jump **diagonally** when an enemy piece blocks a diagonal capture.
3.  **Kings**:
    *   Can jump **one square in any direction** when blocked (landing two squares away).
4.  **Knights**:
    *   Move normally (they *generate* the aura for others, but do not get jump powers themselves).

**Variant Checkmate:** Checkmate strictly occurs when a King is under attack and has no legal standard *or* jump moves available to escape.

## 📦 Installation & Local Development

### Prerequisites
*   Node.js v20.19+ 
*   A Firebase Project (Firestore + Authentication)

### Setup

```bash
# Clone the repository
git clone https://github.com/bobwdmai/KnightAuraChess.git
cd KnightAuraChess

# Use the repo's Node version
nvm use
```

Run the guided setup script for your shell:

```bash
./setup.sh
```

```powershell
.\setup.ps1
```

The setup scripts:
- prompt for Firebase, Cloudflare, and optional backend values
- write a local `.env`
- install npm dependencies if you choose
- validate the Cloudflare Pages + Workers AI config
- optionally run a production build

Setup implementation files live in `setup/`; only the root `setup.sh` and `setup.ps1` launchers stay outside the folder.

Manual fallback:

```bash
npm install
touch .env
```

Add your Firebase configuration to `.env`:

```env
VITE_FIREBASE_PROJECT_ID="your_project_id"
VITE_FIREBASE_API_KEY="your_web_api_key_here"
```

The app auto-fills the normal Firebase Auth domain and Storage bucket from `VITE_FIREBASE_PROJECT_ID`.

## 🔥 Firebase Setup From Scratch

Follow these steps if you are making a new Firebase backend for the app.

### 1. Create a Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project**.
3. Enter a project name, for example `knightaurachess`.
4. Choose whether to enable Google Analytics. The app does not require Analytics.
5. Click **Create project**.

### 2. Add a web app

1. Open your new Firebase project.
2. Click the web icon: `</>`.
3. Register the app with a nickname, for example `KnightAuraChess Web`.
4. You do not need Firebase Hosting for local development.
5. Copy the project id and web API key from the Firebase config.

Put those values in `.env`:

```env
VITE_FIREBASE_PROJECT_ID="your-project-id"
VITE_FIREBASE_API_KEY="..."
```

The app auto-configures:

```text
authDomain    -> your-project-id.firebaseapp.com
storageBucket -> your-project-id.appspot.com
```

If Firebase gives you custom values, or you prefer pasting the full web config, use:

```env
VITE_FIREBASE_CONFIG='{"apiKey":"...","authDomain":"your-project-id.firebaseapp.com","projectId":"your-project-id","storageBucket":"your-project-id.appspot.com","messagingSenderId":"...","appId":"..."}'
```

Individual `VITE_FIREBASE_*` values override `VITE_FIREBASE_CONFIG`.

Restart `npm run dev` after editing `.env`.

### 3. Enable Authentication

1. In Firebase Console, go to **Build** -> **Authentication**.
2. Click **Get started**.
3. Open the **Sign-in method** tab.
4. Enable **Anonymous** sign-in.
5. Enable **Google** sign-in.
6. Add a project support email when Firebase asks for one.
7. Click **Save**.

For deployed sites, also add your domains under **Authentication** -> **Settings** -> **Authorized domains**. Include any domains you use, such as:

```text
localhost
bobwdmai.github.io
knightaurachess.com
www.knightaurachess.com
```

### 4. Create Firestore

1. In Firebase Console, go to **Build** -> **Firestore Database**.
2. Click **Create database**.
3. Choose **Production mode**.
4. Pick a region close to your players.
5. Click **Enable**.

The app creates documents as players use features. You do not need to manually create collections first.

Main collections used by the app:

```text
users
games
dms
friend_requests
game_challenges
announcements
community_puzzles
puzzle_creators
mail
```

### 5. Install and log in to Firebase CLI

```bash
npm install -g firebase-tools
firebase login
firebase use --add
```

When prompted, select your Firebase project and give it an alias such as `default`.

### 6. Deploy Firestore rules

This repository already includes [firestore.rules](./firestore.rules).

```bash
firebase deploy --only firestore:rules
```

These rules are required for online games, chat, profiles, friends, community puzzles, and puzzle ratings.

### 7. Optional: test rules locally

```bash
npm run test:rules:emulator
```

This starts the Firestore emulator and runs the repository's security-rule tests.

### 8. Optional: service account for server move API

Only do this if you are using the Cloudflare `/api/move` backend.

1. In Firebase Console, open **Project settings**.
2. Go to **Service accounts**.
3. Click **Generate new private key**.
4. Store the service-account email and private key as deployment secrets, not in git.

Use these backend env names:

```env
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_WEB_API_KEY="your-web-api-key"
FIREBASE_SERVICE_ACCOUNT_EMAIL="firebase-adminsdk-...@your-project-id.iam.gserviceaccount.com"
FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Never commit real Firebase keys, service-account private keys, or `.env`.

### Running the App
```bash
npm run dev
```
Open the local URL shown by Vite in your browser.

## 🔐 Firebase Security Rules

Firestore rules are part of the app. After changing [firestore.rules](./firestore.rules), deploy them:

```bash
firebase deploy --only firestore:rules
```

This is required for online features such as game chat, profiles, friends, and match history.

## 🧭 Authoritative Move API (Rollout)

The client now supports an optional server-first move pipeline.

Enable it with:

```env
VITE_MOVE_API_ENABLED="true"
VITE_MOVE_API_STRICT="true"
VITE_MOVE_API_URL="/api/move"
```

Backend env required by `functions/api/move.js`:

```env
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_WEB_API_KEY="your-web-api-key"
FIREBASE_SERVICE_ACCOUNT_EMAIL="service-account@your-project.iam.gserviceaccount.com"
FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Client contract (`POST /api/move`):

```json
{
  "gameId": "abc123",
  "from": "e2",
  "to": "e4",
  "promotion": null,
  "expectedMoveSeq": 12
}
```

Expected success response:

```json
{
  "ok": true,
  "gameId": "abc123",
  "moveSeq": 13,
  "status": "active"
}
```

`functions/api/move.js` now implements server-side move execution (auth check, legality check, sequence check, clocks/result update, and rating updates on game end).  
If `VITE_MOVE_API_STRICT="true"`, the client no longer falls back to direct Firestore move writes.

Additional hardening now included in the endpoint:
- OAuth access token cache (refreshes before expiry)
- Firebase ID-token verification cache with claim skew checks
- Hard rate limits (per user+game burst and per-user minute window)
- Structured JSON logs (`move_request_received`, `move_request_accepted`, `move_request_rejected`)

## 🤖 Text AI on `knightaurachess.com`

Browser chat now defaults to same-origin `/api/text-ai` on:
- `https://knightaurachess.com`
- `https://www.knightaurachess.com`

Cloudflare defaults are already in `wrangler.toml`:

```toml
name = "knightaurachess"
pages_build_output_dir = "./dist"

[ai]
binding = "knightaurachess"
```

Route:
- `functions/api/text-ai.js` calls Cloudflare Workers AI through the binding declared in `wrangler.toml`.
- The backend auto-detects `knightaurachess`, `AI`, or `ai`, so dashboard-created bindings with common names still work.
- `TEXT_AI_MODEL` defaults to `@cf/meta/llama-3-8b-instruct` if you do not set it.

For production builds you can still override explicitly:

```env
VITE_TEXT_AI_BASE_URL="/api/text-ai"
TEXT_AI_MODEL="@cf/meta/llama-3-8b-instruct"
```

Cloudflare deployment notes:
- The repo is pre-configured for Cloudflare Pages with `wrangler.toml`.
- Workers AI binding name: `knightaurachess` by default.
- `npm run validate:cloudflare` checks the Pages output directory and Workers AI binding before deploy.
- GitHub Actions includes a manual **Deploy to Cloudflare Pages** workflow. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub secrets, then run that workflow.
- If Cloudflare does not pick up `wrangler.toml` for an existing Pages project, add the Workers AI binding manually once and redeploy.
- If you prefer a proxy to another hosted LLM instead of Workers AI, keep `TEXT_AI_UPSTREAM_URL` and `TEXT_AI_UPSTREAM_AUTH_BEARER` configured as a fallback.

## 🚀 Deployment (Cloudflare Pages)

This project is configured for seamless deployment via Cloudflare Pages:

1. Connect your Github repository to Cloudflare Pages.
2. **Build command:** `npx vite build`
3. **Build directory:** `dist`
4. **Environment Variables:** Add at least `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_API_KEY` to Cloudflare Pages. Add `VITE_FIREBASE_CONFIG` or explicit `VITE_FIREBASE_*` overrides only if your Firebase project uses custom values.
5. **Workers AI binding:** already declared in `wrangler.toml` as `knightaurachess`.

Manual Cloudflare setup, only if an existing Pages project ignores `wrangler.toml` bindings:

1. Open Cloudflare Dashboard.
2. Go to **Workers & Pages**.
3. Open the **knightaurachess** Pages project.
4. Go to **Settings**.
5. Go to **Bindings**.
6. Add a **Workers AI** binding.
7. Set **Variable name** to `knightaurachess` (`AI` or `ai` also work because the backend auto-detects them).
8. Save.
9. Go to **Deployments**.
10. Redeploy the latest production deployment.

GitHub Actions setup:

1. In GitHub, open the repository settings.
2. Go to **Secrets and variables** → **Actions**.
3. Add `CLOUDFLARE_ACCOUNT_ID`.
4. Add `CLOUDFLARE_API_TOKEN` with Cloudflare Pages deploy permission.
5. Open **Actions** → **Deploy to Cloudflare Pages**.
6. Click **Run workflow**.

If the Cloudflare Pages project is connected to GitHub, Cloudflare can automatically build and deploy on each `main` push. If you use the included GitHub Action instead, run **Deploy to Cloudflare Pages** manually after changing deployment secrets or Cloudflare config.
