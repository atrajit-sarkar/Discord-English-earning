# Discord English Quiz

This repository is now set up as a Vite + React app for a Discord-connected English quiz.

## What you need

- Node.js 18.18 or newer
- A Discord application with OAuth2 enabled
- A Discord webhook URL for the results channel

## Local setup

1. Copy `.env.example` to `.env`
2. Fill in:
   - `VITE_DISCORD_CLIENT_ID`
   - `VITE_DISCORD_WEBHOOK_URL`
3. Install packages:
   - `npm install`
4. Start the app:
   - `npm run dev`

## Discord OAuth setup

Add these redirect URLs in the Discord Developer Portal for your application:

- `http://localhost:5173/`
- `https://<your-github-username>.github.io/<your-repo-name>/`

The app uses the current page URL as the redirect URI, so the value in Discord must match the deployed page exactly.

## GitHub Pages deploy

1. Push this repo to GitHub.
2. Run `npm run deploy`
3. In GitHub repository settings, set Pages to deploy from the `gh-pages` branch if it is not already configured.

The Vite base path is set to `./`, so you do not need to edit `vite.config.js` for a normal GitHub Pages deployment.

## Security note

This is a static site. Your Discord webhook URL is embedded into the built frontend and can be discovered by anyone who inspects the client code. For a community project this may be acceptable, but a server-side relay is safer if abuse becomes a problem.
