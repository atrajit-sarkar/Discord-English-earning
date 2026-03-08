# Testing the verify-access Endpoint

## ✅ Configuration Status

The bot is **properly configured** to check if a server member has access to a specific channel:

- ✓ `DISCORD_BOT_TOKEN` secret is set
- ✓ `verify-access` endpoint is implemented
- ✓ Permission calculation includes:
  - Guild membership check
  - Base role permissions
  - Channel permission overwrites  
  - Member-specific overwrites
  - Administrator bypass

## 📍 Finding Your Worker URL

Your worker is deployed as `discord-english-quiz-relay`. To find the full URL:

1. Run: `npx wrangler whoami` to see your account subdomain
2. Your URL will be: `https://discord-english-quiz-relay.<subdomain>.workers.dev`
3. Or check your deployed GitHub Pages at: `https://atrajit-sarkar.github.io`
   - Open browser dev tools (F12) → Network tab
   - Try to login → Look for POST requests to see the actual worker URL

## 🧪 Testing Methods

### Method 1: From Your Frontend (Recommended)

The frontend already integrates this at lines 758-800 in `src/App.jsx`:

```javascript
const verifyRes = await fetch(DISCORD_RELAY_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    action: "verify-access",
    discordToken: <user's OAuth token>,
    channelId: "1478308208689811568" // optional
  })
});
```

**To test:**
1. Run your app: `npm run dev`
2. Login with Discord  
3. Check browser console for the verification results

### Method 2: Using PowerShell/Curl

Once you have the worker URL:

```powershell
# Test 1: Missing token (should return 401)
$body = @{
    action = "verify-access"
    channelId = "1478308208689811568"
} | ConvertTo-Json

curl.exe -X POST "https://your-worker-url.workers.dev" `
    -H "Content-Type: application/json" `
    -H "Origin: http://localhost:5173" `
    -d $body

# Test 2: With valid Discord OAuth token
$body = @{
    action = "verify-access"
    discordToken = "YOUR_OAUTH_TOKEN_HERE"
    channelId = "1478308208689811568"
} | ConvertTo-Json

curl.exe -X POST "https://your-worker-url.workers.dev" `
    -H "Content-Type: application/json" `
    -H "Origin: http://localhost:5173" `
    -d $body
```

### Method 3: Monitor Live Requests

```powershell
npx wrangler tail --format pretty
```

Then make requests from your frontend and see them in real-time.

## 📊 Expected Responses

### Success - Member has access:
```json
{
  "ok": true,
  "member": true,
  "channelAccess": true
}
```

### Success - Member but no channel access:
```json
{
  "ok": true,
  "member": true,
  "channelAccess": false
}
```

### Not a member:
```json
{
  "ok": true,
  "member": false,
  "channelAccess": false
}
```

### Error responses:
```json
{ "error": "Missing Discord token." }           // 401
{ "error": "Discord token invalid." }           // 401
{ "error": "Invalid channel ID." }              // 400
{ "error": "Failed to check guild membership." } // 502
```

## 🔍 How It Works

The endpoint performs these checks in order:

1. **User Identity Verification**
   - Uses the Discord OAuth token to get user ID via `/users/@me`
   
2. **Guild Membership Check**
   - Bot fetches member info from `/guilds/{guild}/members/{user}`
   - Returns `member: false` if user not in server
   
3. **Permission Calculation**
   - Gets @everyone role permissions
   - Adds member's role permissions
   - Checks for Administrator permission (bypasses all channel checks)
   
4. **Channel Permissions**
   - Fetches channel permission overwrites
   - Applies in order: @everyone → role overwrites → member overwrites
   - Checks for `VIEW_CHANNEL` permission (bit 0x400)

## 🔐 Security Notes

- The bot token is never exposed to the frontend
- User tokens are validated server-side
- Only members of the configured guild can be verified
- Implements proper permission precedence (member > role > @everyone)

## 📝 Configuration

Currently checking access for:
- **Guild ID**: `1183341118360928327`
- **Default Channel ID**: `1478308208689811568`
- **Required Permission**: `VIEW_CHANNEL` (0x400)

These are defined at the top of `src/index.js`:
```javascript
const REQUIRED_GUILD_ID = "1183341118360928327";
const REQUIRED_CHANNEL_ID = "1478308208689811568";
const VIEW_CHANNEL_BIT = 0x400n;
const ADMINISTRATOR_BIT = 0x8n;
```

## 🚀 Quick Verification

Run this to verify the setup:

```powershell
cd cloudflare-worker
npx wrangler secret list  # Should show DISCORD_BOT_TOKEN
```

Then visit your deployed app and login - the channel access check happens automatically!
