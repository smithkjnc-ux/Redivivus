# Redivivus Authentication & Installation Flow

*This document outlines the exact flow of user authentication, download, installation, and IDE token handoff based on the current implementation in `redivivus-web` and `redivivus-backend`.*

## 1. Landing & Login (`redivivus-web/src/app/login/page.tsx`)
Users start at the `/login` route, which uses `@supabase/supabase-js` to handle authentication. There are two paths:
- **GitHub OAuth**: Executes `signInWithOAuth({ provider: 'github' })` and redirects to `/auth/callback`.
- **Email OTP / Magic Link**: Executes `signInWithOtp()`. The user receives an email with a 6-digit code. They can either:
  1. Enter the code manually on the site (which tries `email`, `magiclink`, and `signup` verification sequentially).
  2. Click the Magic Link in the email, routing them to `/auth/callback` with a `token_hash`.

## 2. Callback & Waitlist (`redivivus-web/src/app/auth/callback/route.ts`)
Once the token or code is verified, the callback evaluates the user's status:
- Checks if the user is new via `ensurePendingWaitlist()`. If new, a POST request is fired to `/api/notify-signup`.
- Checks `isUserAllowed(user)`:
  - **Approved**: Redirects to `/download`.
  - **Unapproved**: Redirects to `/pending` (the waitlist holding screen).

## 3. Download Gate (`redivivus-web/src/app/download/page.tsx`)
The page first performs a server-side check:
- If `!user`, redirects to login.
- If `!isUserAllowed(user)`, shows a "You're not approved yet" UI.
- If approved, presents the installation commands:
  - **Mac/Linux**: `curl -fsSL https://redivivus.dev/install-redivivus.sh | bash`
  - **Windows**: `irm https://redivivus.dev/install-redivivus.ps1 | iex`

## 4. Install Scripts (`redivivus-web/public/install-redivivus.*`)
- **VSCodium Base**: The script downloads the latest VSCodium release (`.tar.gz` for Linux, `.zip` for macOS, and the `.exe` installer for Windows).
- **Extension Injection**: Queries the GitHub API for the latest `.vsix` release of Redivivus and installs it headlessly using `codium --install-extension /tmp/redivivus.vsix`.
- **Branding State**: 
  - *Linux*: Uses a Python script to rewrite `product.json` (changing names to "Redivivus") and downloads a `.png` icon, placing it in `resources/app/resources/linux/code.png`. It also sets up a `.desktop` file.
  - *macOS*: Copies `VSCodium.app` directly to `/Applications/` with no branding changes.
  - *Windows*: Uses silent install `VSCodiumSetup-x64.exe` with no branding changes.

## 5. IDE Token Handoff (`redivivus-backend/src/app/auth/ide/page.tsx`)
When the installed IDE launches, it requires an auth token.
1. The IDE opens the user's browser to `redivivus.dev/auth/ide?port=<local-port>`.
2. The page attempts to extract the active Supabase token from `localStorage` (looking for keys matching `sb-*-auth-token`).
3. If no token is found, it redirects to `/login` with a return path.
4. Once the token is acquired, it redirects the browser to `http://127.0.0.1:<local-port>?token=<token>`, sending the active Supabase session back to the IDE instance.
