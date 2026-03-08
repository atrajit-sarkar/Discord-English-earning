This project works as a static web app on GitHub Pages by using **Discord OAuth2** for login and a **Cloudflare Worker relay** to post quiz results to Discord without exposing the raw webhook in the browser.

### What You Need to Gather (Your "To-Do" List)

Before you deploy, you will need these pieces of information:

1. **Discord Webhook URL:**
* Go to your Discord Server -> Server Settings -> Integrations -> Webhooks.
* Create a New Webhook, pick the channel you want results sent to, and click **Copy Webhook URL**.
* Put this in the Cloudflare Worker secret store, not in the frontend `.env`.


2. **Discord Client ID:**
* Go to the [Discord Developer Portal](https://discord.com/developers/applications).
* Click "New Application" and give it a name.
* Go to the **OAuth2** tab and copy your **Client ID**.


3. **Your GitHub Pages URL (Redirect URI):**
* Once you know where you will host it (e.g., `https://yourusername.github.io/english-quiz/`), you need to add this exact URL into the **Redirects** section of the OAuth2 tab in the Discord Developer Portal.

4. **Your Cloudflare Worker URL:**
* Deploy the Worker in `cloudflare-worker/`.
* Copy the deployed `https://<name>.<subdomain>.workers.dev` URL into `VITE_DISCORD_RELAY_URL` in the frontend `.env`.

5. **Optional but recommended: Cloudflare Turnstile keys**
* Add the site key to `VITE_TURNSTILE_SITE_KEY` in the frontend `.env`.
* Add the secret key to the Worker as `TURNSTILE_SECRET_KEY`.

### How to use this code for GitHub Pages

Since you want to host this on GitHub Pages, the easiest way to deploy a React app like this is to use **Vite**. Here is the quick step-by-step:

1. **Set up the project locally:**
* Open your terminal and run: `npm create vite@latest english-quiz -- --template react`
* Go into the folder: `cd english-quiz`
* Install dependencies: `npm install`
* Install Lucide icons: `npm install lucide-react`
* Set up Tailwind CSS by following their [Vite guide](https://tailwindcss.com/docs/guides/vite).


2. **Add the code:**
* Use the existing app files in this repo.
* **Crucial Step:** Put `VITE_DISCORD_CLIENT_ID` and `VITE_DISCORD_RELAY_URL` in `.env`.
* Do not put the Discord webhook URL in the frontend code.


3. **Deploy to GitHub pages:**
* Install the `gh-pages` package: `npm install gh-pages --save-dev`
* In your `package.json`, add your homepage URL: `"homepage": "https://<your-github-username>.github.io/<your-repo-name>",`
* Under `"scripts"` in `package.json`, add:
* `"predeploy": "npm run build",`
* `"deploy": "gh-pages -d dist"`


* Update your `vite.config.js` to include the base path: `export default defineConfig({ base: '/<your-repo-name>/', plugins: [react()] })`
* Run `npm run deploy`!



*Security Note: With the Cloudflare Worker relay, the webhook stays server-side. Rotate any old webhook that was previously exposed in the frontend or GitHub history.*
