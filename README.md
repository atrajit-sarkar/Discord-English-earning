# Discord English Quiz

This repository is now set up as a Vite + React app for a Discord-connected English quiz.

## What you need

- Node.js 18.18 or newer
- A Discord application with OAuth2 enabled
- A Discord webhook URL for the results channel
- A Cloudflare Worker relay URL
- A Cloudflare Turnstile site key and secret if you want anti-bot protection

## Local setup

1. Copy `.env.example` to `.env`
2. Fill in:
   - `VITE_DISCORD_CLIENT_ID`
   - `VITE_DISCORD_RELAY_URL`
   - `VITE_TURNSTILE_SITE_KEY` if you enable Turnstile
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

## Cloudflare Worker relay

Cloudflare Workers has a free plan, and it is a good fit for hiding the Discord webhook behind a tiny server-side relay while keeping the site itself on GitHub Pages.

1. Create a Worker with the files in [`cloudflare-worker/`](cloudflare-worker/README.md).
2. In Cloudflare, set:
   - `ALLOWED_ORIGINS`
     - Example: `http://localhost:5173,https://<your-github-username>.github.io`
3. Add Worker secrets:
   - `DISCORD_WEBHOOK_URL`
   - `TURNSTILE_SECRET_KEY` if you enable Turnstile
4. Deploy the Worker and copy its public URL.
5. Put that URL into `VITE_DISCORD_RELAY_URL`.

If you want the anti-spam check:

1. Create a Turnstile widget for your site.
2. Put the site key into `VITE_TURNSTILE_SITE_KEY`.
3. Put the secret into the Worker as `TURNSTILE_SECRET_KEY`.

## Security note

Do not keep the Discord webhook in the frontend anymore. Put it only in the Worker secret store, then rotate the old webhook because the previous client-side one should be treated as exposed.
