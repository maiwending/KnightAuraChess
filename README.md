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

# Install dependencies
npm install

# Create a local environment file
touch .env
```

Add your Firebase configuration to `.env`:
```env
VITE_FIREBASE_API_KEY="your_api_key_here"
VITE_FIREBASE_AUTH_DOMAIN="your_project_id.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your_project_id"
VITE_FIREBASE_STORAGE_BUCKET="your_project_id.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="your_sender_id"
VITE_FIREBASE_APP_ID="your_app_id"
```

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

This is required for online features such as game chat and peer voice signaling.

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

Configure Cloudflare Function env vars:

```env
TEXT_AI_MODEL="@cf/meta/llama-3-8b-instruct"
```

Route:
- `functions/api/text-ai.js` can call Cloudflare Workers AI directly through an `AI` binding.

For production builds you can still override explicitly:

```env
VITE_TEXT_AI_BASE_URL="/api/text-ai"
```

Cloudflare deployment notes:
- Add an AI binding named `AI` in your Cloudflare Pages project or Worker.
- In Cloudflare Pages, add the Workers AI binding from the dashboard and redeploy.
- If you prefer a proxy to another hosted LLM instead of Workers AI, keep `TEXT_AI_UPSTREAM_URL` and `TEXT_AI_UPSTREAM_AUTH_BEARER` configured as a fallback.

## 🚀 Deployment (Cloudflare Pages)

This project is configured for seamless deployment via Cloudflare Pages:

1. Connect your Github repository to Cloudflare Pages.
2. **Build command:** `npx vite build`
3. **Build directory:** `dist`
4. **Environment Variables:** Add all the `VITE_FIREBASE_*` variables from your `.env` file into the Cloudflare Pages settings.

Cloudflare will automatically build and deploy your app every time you push to the `main` branch!
