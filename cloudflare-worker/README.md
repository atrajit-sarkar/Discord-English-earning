# Cloudflare Worker Relay

This Worker keeps the Discord webhook out of the browser and forwards quiz results from your GitHub Pages frontend.

## Files

- `src/index.js`: the relay code
- `wrangler.toml`: Worker config
- `.dev.vars.example`: example secrets for local development

## Configure

1. Set `ALLOWED_ORIGINS` in `wrangler.toml`.
2. Add the Discord webhook as a secret:
   - `npx wrangler secret put DISCORD_WEBHOOK_URL`
3. Optional but recommended: add Turnstile:
   - `npx wrangler secret put TURNSTILE_SECRET_KEY`

## Deploy

1. Install Wrangler if you do not already have it:
   - `npm install -D wrangler`
2. From this folder, deploy:
   - `npx wrangler deploy`
3. Copy the deployed Worker URL into `VITE_DISCORD_RELAY_URL` in the frontend `.env`.

## Frontend env

Add these in the main project `.env`:

- `VITE_DISCORD_RELAY_URL=https://<your-worker-subdomain>.workers.dev`
- `VITE_TURNSTILE_SITE_KEY=<your-site-key>` if Turnstile is enabled

## Permission check API

The Worker `verify-access` action accepts:

- `discordToken`: the user's Discord OAuth access token
- `channelId` (optional): a specific Discord channel ID to check

If `channelId` is omitted, the Worker falls back to the configured `REQUIRED_CHANNEL_ID`.
