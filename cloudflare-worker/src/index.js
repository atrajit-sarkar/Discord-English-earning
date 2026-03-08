const JSON_HEADERS = {
  "content-type": "application/json; charset=UTF-8",
};

const RESULT_LEVELS = [
  { minPercentage: 80, level: "Advanced", emoji: "\u{1F451}", color: 0x23a559 },
  { minPercentage: 60, level: "Intermediate", emoji: "\u{2B50}", color: 0xf0b232 },
  { minPercentage: 0, level: "Beginner", emoji: "\u{1F4DA}", color: 0xf47b67 },
];

const SHARE_COOLDOWN_MS = 60_000;   // 60 seconds between Discord shares

const REQUIRED_GUILD_ID = "1183341118360928327";
const REQUIRED_CHANNEL_ID = "1478308208689811568";
const ADMIN_CHANNEL_ID = "1394159969103777889";  // Channel for access requests
const ACCESS_ROLE_ID = "1478308535287812118";    // Role to grant on approval
const VIEW_CHANNEL_BIT = 0x400n;
const ADMINISTRATOR_BIT = 0x8n;

/* ── Server-side answer keys are now in Firestore ── */

/* ── Helpers ── */

function getAllowedOrigins(rawOrigins = "") {
  return rawOrigins
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function getCorsHeaders(origin, env) {
  const allowedOrigins = getAllowedOrigins(env.ALLOWED_ORIGINS);
  if (!origin || !allowedOrigins.includes(origin)) {
    return {};
  }

  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function jsonResponse(body, status, origin, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...getCorsHeaders(origin, env),
    },
  });
}

function sanitizeText(value, fallback = "Unknown") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim().replace(/@/g, "@\u200b").slice(0, 120) || fallback;
}

function sanitizeAvatarUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function getResultSummary(score, total) {
  const percentage = Math.round((score / total) * 100);
  const match = RESULT_LEVELS.find((item) => percentage >= item.minPercentage);
  return { percentage, ...match };
}

/* ── Score computation (server-side) ── */

function computeScore(quizData, userAnswers) {
  const key = quizData.answers;
  if (!key) {
    return null;
  }

  if (!Array.isArray(userAnswers) || userAnswers.length !== key.length) {
    return null;
  }

  let score = 0;
  let streak = 0;
  let bestStreak = 0;

  for (let i = 0; i < key.length; i++) {
    if (!Number.isInteger(userAnswers[i])) return null;
    if (userAnswers[i] === Number(key[i].integerValue ?? key[i].doubleValue ?? 0)) {
      score++;
      streak++;
      bestStreak = Math.max(bestStreak, streak);
    } else {
      streak = 0;
    }
  }

  const total = key.length;
  const result = getResultSummary(score, total);

  return { score, total, bestStreak, percentage: result.percentage, level: result.level };
}

/* ── Payload validation ── */

async function validatePayload(body, env, isShare = false) {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid JSON body." };
  }

  const userId = sanitizeText(body.userId, "");
  const username = sanitizeText(body.username);
  const quizId = sanitizeText(body.quizId, "").toLowerCase();
  const quizTitle = sanitizeText(body.quizTitle, "Quiz");
  const avatar = sanitizeAvatarUrl(body.avatar);

  if (!userId || userId.length > 64) {
    return { ok: false, error: "Invalid user id." };
  }

  if (!quizId || quizId.length > 64) {
    return { ok: false, error: "Invalid quiz id." };
  }

  let siteBaseUrl;
  try {
    siteBaseUrl = new URL(body.siteBaseUrl);
  } catch {
    return { ok: false, error: "Invalid site URL." };
  }

  const allowedOrigins = getAllowedOrigins(env.ALLOWED_ORIGINS);
  if (!allowedOrigins.includes(siteBaseUrl.origin)) {
    return { ok: false, error: "Site origin is not allowed." };
  }

  siteBaseUrl.search = "";
  siteBaseUrl.hash = "";
  siteBaseUrl.searchParams.set("quiz", quizId);

  let payload = {
    userId,
    username,
    quizId,
    quizTitle,
    quizLink: siteBaseUrl.toString(),
    avatar,
    userAnswers: body.userAnswers,
    turnstileToken:
      typeof body.turnstileToken === "string" ? body.turnstileToken.trim() : "",
    discordToken:
      typeof body.discordToken === "string" ? body.discordToken.trim() : "",
  };

  if (!isShare) {
    const quizData = await getQuizDataFromFirestore(quizId, env);
    if (!quizData) {
      return { ok: false, error: "Could not fetch quiz data." };
    }

    const computed = computeScore(quizData, body.userAnswers);
    if (!computed) {
      return { ok: false, error: "Invalid quiz answers." };
    }

    payload = {
      ...payload,
      score: computed.score,
      total: computed.total,
      bestStreak: computed.bestStreak,
      percentage: computed.percentage,
      level: computed.level,
      answers: quizData.answers.map(a => Number(a.integerValue ?? a.doubleValue ?? 0)),
      explanations: quizData.explanations.map(e => e.stringValue ?? ""),
    };
  } else {
    // For share action, we do NOT trust the frontend. We will fetch the latest saved result from Firestore in the handler.
    payload = {
      ...payload
    };
  }

  return {
    ok: true,
    payload,
  };
}

/* ── Turnstile verification ── */

async function verifyTurnstile(token, ipAddress, env) {
  if (!env.TURNSTILE_SECRET_KEY) {
    console.warn("TURNSTILE_SECRET_KEY not set — skipping anti-spam verification.");
    return { success: true };
  }

  const formData = new FormData();
  formData.set("secret", env.TURNSTILE_SECRET_KEY);
  formData.set("response", token);
  if (ipAddress) {
    formData.set("remoteip", ipAddress);
  }

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: formData,
    }
  );

  if (!response.ok) {
    return { success: false };
  }

  const data = await response.json();
  return { success: Boolean(data.success) };
}

/* ── Discord token verification ── */

async function verifyDiscordUser(token, expectedUserId) {
  if (!token) return false;

  try {
    const response = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.id === expectedUserId;
  } catch {
    return false;
  }
}

/* ── Firebase service-account auth ── */

function base64url(source) {
  let str;
  if (typeof source === "string") {
    str = btoa(source);
  } else {
    str = btoa(String.fromCharCode(...new Uint8Array(source)));
  }
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getFirebaseAccessToken(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("FIREBASE_SERVICE_ACCOUNT secret is not set.");
    return null;
  }

  let sa;
  try {
    sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  } catch (e) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:", e.message);
    return null;
  }

  if (!sa.private_key || !sa.client_email) {
    console.error("Service account JSON missing private_key or client_email. Keys found:", Object.keys(sa).join(", "));
    return null;
  }
  const now = Math.floor(Date.now() / 1000);

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      sub: sa.client_email,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
      scope: "https://www.googleapis.com/auth/datastore",
    })
  );

  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");

  let binaryDer;
  try {
    binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  } catch (e) {
    console.error("Failed to decode private key base64:", e.message, "pemBody length:", pemBody.length);
    return null;
  }

  let cryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      binaryDer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );
  } catch (e) {
    console.error("Failed to import private key:", e.message);
    return null;
  }

  const unsigned = `${header}.${claim}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsigned)
  );

  const jwt = `${unsigned}.${base64url(signature)}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("Google token exchange failed:", tokenRes.status, errText.slice(0, 500));
    return null;
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token ?? null;
}

/* ── Firestore admin write ── */

function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number" && Number.isInteger(val)) return { integerValue: String(val) };
  if (typeof val === "number") return { doubleValue: val };
  if (typeof val === "string") return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === "object") {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

async function getQuizDataFromFirestore(quizId, env) {
  const accessToken = await getFirebaseAccessToken(env);
  if (!accessToken) {
    return null;
  }

  const projectId = env.FIREBASE_PROJECT_ID;
  const docUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/QuizzesData/${encodeURIComponent(quizId)}`;

  try {
    const getRes = await fetch(docUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (getRes.ok) {
      const doc = await getRes.json();
      if (doc.fields && doc.fields.answers && doc.fields.explanations) {
        return {
          answers: doc.fields.answers.arrayValue?.values || [],
          explanations: doc.fields.explanations.arrayValue?.values || [],
        };
      }
    }
  } catch (err) {
    console.error("getQuizDataFromFirestore error:", err);
  }
  return null;
}

async function getUserDocumentFromFirestore(userId, env) {
  const accessToken = await getFirebaseAccessToken(env);
  if (!accessToken) {
    return null;
  }

  const projectId = env.FIREBASE_PROJECT_ID;
  const docUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/English/${encodeURIComponent(userId)}`;

  try {
    const getRes = await fetch(docUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (getRes.ok) {
      const doc = await getRes.json();
      if (doc.fields) {
        return { existing: doc.fields, accessToken, docUrl };
      }
    }
  } catch (err) {
    // Document might not exist
  }
  return { existing: {}, accessToken, docUrl };
}

async function saveResultToFirestore(payload, env, prefetchedDoc) {
  const { existing, accessToken, docUrl } = prefetchedDoc ?? await getUserDocumentFromFirestore(payload.userId, env);

  if (!accessToken) {
    return { saved: false, reason: "Service account not configured." };
  }

  const prevTotalAttempts = Number(existing.totalAttempts?.integerValue ?? 0);
  const prevBestScore = Number(existing.bestScore?.integerValue ?? 0);
  const prevBestStreak = Number(existing.bestStreak?.integerValue ?? 0);
  const prevHistory = existing.quizHistory?.arrayValue?.values ?? [];
  const prevSeen = existing.seenQuizzes?.arrayValue?.values ?? [];

  const attempt = {
    quizId: payload.quizId,
    score: payload.score,
    total: payload.total,
    percentage: payload.percentage,
    level: payload.level,
    bestStreak: payload.bestStreak,
    userAnswers: payload.userAnswers,
    completedAt: new Date().toISOString(),
  };

  const seenSet = new Set(prevSeen.map((v) => v.stringValue));
  seenSet.add(payload.quizId);

  const updatedFields = {
    discordId: toFirestoreValue(payload.userId),
    username: toFirestoreValue(payload.username),
    avatar: toFirestoreValue(payload.avatar),
    totalAttempts: toFirestoreValue(prevTotalAttempts + 1),
    bestScore: toFirestoreValue(Math.max(prevBestScore, payload.score)),
    bestStreak: toFirestoreValue(Math.max(prevBestStreak, payload.bestStreak)),
    lastPlayed: { timestampValue: new Date().toISOString() },
    quizHistory: {
      arrayValue: {
        values: [...prevHistory, toFirestoreValue(attempt)],
      },
    },
    seenQuizzes: {
      arrayValue: {
        values: [...seenSet].map((v) => ({ stringValue: v })),
      },
    },
  };

  // Preserve createdAt if it exists, otherwise set it
  if (existing.createdAt) {
    updatedFields.createdAt = existing.createdAt;
  } else {
    updatedFields.createdAt = { timestampValue: new Date().toISOString() };
  }

  // Preserve lastLogin if it exists
  if (existing.lastLogin) {
    updatedFields.lastLogin = existing.lastLogin;
  }

  // Preserve sharedQuizzes if it exists
  if (existing.sharedQuizzes) {
    updatedFields.sharedQuizzes = existing.sharedQuizzes;
  }

  try {
    const patchRes = await fetch(`${docUrl}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: updatedFields }),
    });

    if (!patchRes.ok) {
      const errText = await patchRes.text();
      console.error("Firestore PATCH failed:", patchRes.status, errText.slice(0, 500));
      return { saved: false, reason: "Failed to save to database." };
    }
  } catch {
    return { saved: false, reason: "Database write error." };
  }

  return { saved: true };
}

/* ── Discord embed ── */

function buildDiscordPayload(payload) {
  const result = getResultSummary(payload.score, payload.total);
  const embed = {
    title: `${result.emoji} Quiz Results: ${payload.username}`,
    description: `${payload.username} completed the **[${payload.quizTitle}](${payload.quizLink})** quiz.`,
    color: result.color,
    fields: [
      {
        name: "\u{1F3AF} Score",
        value: `**${payload.score} / ${payload.total}** (${result.percentage}%)`,
        inline: true,
      },
      {
        name: "\u{1F4CA} Level",
        value: `**${result.level}**`,
        inline: true,
      },
      {
        name: "\u{1F525} Best Streak",
        value: `**${payload.bestStreak}** in a row`,
        inline: true,
      },
      {
        name: "\u{1F4DD} Quiz",
        value: `**[${payload.quizTitle}](${payload.quizLink})**`,
        inline: false,
      },
    ],
    footer: {
      text: "Your english Mam",
    },
    timestamp: new Date().toISOString(),
  };

  if (payload.avatar) {
    embed.thumbnail = { url: payload.avatar };
  }

  return {
    username: "Marley",
    allowed_mentions: { parse: [] },
    embeds: [embed],
  };
}

/* ── Worker entry point ── */

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") ?? "";

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(origin, env),
      });
    }

    try {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405, origin, env);
      }

      if (!env.DISCORD_WEBHOOK_URL) {
        return jsonResponse(
          { error: "Missing DISCORD_WEBHOOK_URL secret." },
          500,
          origin,
          env
        );
      }

      const corsHeaders = getCorsHeaders(origin, env);
      if (!corsHeaders["access-control-allow-origin"]) {
        return jsonResponse({ error: "Origin not allowed." }, 403, origin, env);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "Request body must be JSON." }, 400, origin, env);
      }

      const action = body.action || "submit";

      /* ── verify-access: check guild membership + channel access ── */
      if (action === "verify-access") {
        if (!env.DISCORD_BOT_TOKEN) {
          return jsonResponse({ error: "Bot token not configured." }, 500, origin, env);
        }

        const discordToken = typeof body.discordToken === "string" ? body.discordToken.trim() : "";
        const requestedChannelId = typeof body.channelId === "string" ? body.channelId.trim() : "";
        const channelId = requestedChannelId || REQUIRED_CHANNEL_ID;
        if (!discordToken) {
          return jsonResponse({ error: "Missing Discord token." }, 401, origin, env);
        }
        if (!/^\d+$/.test(channelId)) {
          return jsonResponse({ error: "Invalid channel ID." }, 400, origin, env);
        }

        // Verify user identity via their OAuth token
        let discordUserId;
        try {
          const meRes = await fetch("https://discord.com/api/users/@me", {
            headers: { Authorization: `Bearer ${discordToken}` },
          });
          if (!meRes.ok) {
            return jsonResponse({ error: "Discord token invalid." }, 401, origin, env);
          }
          const me = await meRes.json();
          discordUserId = me.id;
        } catch {
          return jsonResponse({ error: "Failed to verify Discord identity." }, 401, origin, env);
        }

        // Check guild membership using bot token
        let memberRoles;
        try {
          const memberRes = await fetch(
            `https://discord.com/api/guilds/${REQUIRED_GUILD_ID}/members/${encodeURIComponent(discordUserId)}`,
            { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } }
          );
          if (memberRes.status === 404) {
            return jsonResponse({ ok: true, member: false, channelAccess: false }, 200, origin, env);
          }
          if (!memberRes.ok) {
            const errorText = await memberRes.text();
            console.error(`[verify-access] Discord API error (status ${memberRes.status}):`, errorText);
            return jsonResponse({ 
              error: `Failed to check guild membership. Discord API returned ${memberRes.status}`,
              details: errorText.slice(0, 200)
            }, 502, origin, env);
          }
          const memberData = await memberRes.json();
          memberRoles = memberData.roles || [];
        } catch (err) {
          console.error("[verify-access] Exception checking guild membership:", err);
          return jsonResponse({ error: "Failed to check guild membership." }, 502, origin, env);
        }

        // Get guild roles to compute base permissions
        let guildRolesMap;
        try {
          const rolesRes = await fetch(
            `https://discord.com/api/guilds/${REQUIRED_GUILD_ID}/roles`,
            { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } }
          );
          if (!rolesRes.ok) {
            return jsonResponse({ error: "Failed to fetch guild roles." }, 502, origin, env);
          }
          const roles = await rolesRes.json();
          guildRolesMap = new Map(roles.map(r => [r.id, r]));
        } catch {
          return jsonResponse({ error: "Failed to fetch guild roles." }, 502, origin, env);
        }

        // Compute base permissions from @everyone + member roles
        const everyoneRole = guildRolesMap.get(REQUIRED_GUILD_ID);
        let permissions = BigInt(everyoneRole?.permissions ?? "0");
        for (const roleId of memberRoles) {
          const role = guildRolesMap.get(roleId);
          if (role) {
            permissions |= BigInt(role.permissions);
          }
        }

        // Administrator bypasses all channel checks
        if (permissions & ADMINISTRATOR_BIT) {
          return jsonResponse({ ok: true, member: true, channelAccess: true }, 200, origin, env);
        }

        // Get channel permission overwrites
        try {
          const chanRes = await fetch(
            `https://discord.com/api/channels/${channelId}`,
            { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } }
          );
          if (!chanRes.ok) {
            return jsonResponse({ error: "Failed to fetch channel info." }, 502, origin, env);
          }
          const channel = await chanRes.json();
          if (channel.guild_id !== REQUIRED_GUILD_ID) {
            return jsonResponse({ error: "Channel is not in the configured guild." }, 400, origin, env);
          }
          const overwrites = channel.permission_overwrites || [];

          // Apply @everyone overwrite
          const evOverwrite = overwrites.find(o => o.id === REQUIRED_GUILD_ID);
          if (evOverwrite) {
            permissions &= ~BigInt(evOverwrite.deny);
            permissions |= BigInt(evOverwrite.allow);
          }

          // Apply role overwrites
          let roleAllow = 0n;
          let roleDeny = 0n;
          for (const roleId of memberRoles) {
            const ow = overwrites.find(o => o.id === roleId && o.type === 0);
            if (ow) {
              roleAllow |= BigInt(ow.allow);
              roleDeny |= BigInt(ow.deny);
            }
          }
          permissions &= ~roleDeny;
          permissions |= roleAllow;

          // Apply member-specific overwrite
          const memberOverwrite = overwrites.find(o => o.id === discordUserId && o.type === 1);
          if (memberOverwrite) {
            permissions &= ~BigInt(memberOverwrite.deny);
            permissions |= BigInt(memberOverwrite.allow);
          }
        } catch {
          return jsonResponse({ error: "Failed to check channel permissions." }, 502, origin, env);
        }

        const hasChannelAccess = Boolean(permissions & VIEW_CHANNEL_BIT);
        return jsonResponse({ ok: true, member: true, channelAccess: hasChannelAccess }, 200, origin, env);
      }

      /* ── request-access: submit access request form ── */
      if (action === "request-access") {
        if (!env.DISCORD_BOT_TOKEN) {
          return jsonResponse({ error: "Bot token not configured." }, 500, origin, env);
        }

        const discordToken = typeof body.discordToken === "string" ? body.discordToken.trim() : "";
        const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
        const userId = typeof body.userId === "string" ? body.userId.trim() : "";
        const username = typeof body.username === "string" ? body.username.trim().slice(0, 32) : "";
        const avatar = typeof body.avatar === "string" ? body.avatar.trim() : "";

        if (!discordToken) {
          return jsonResponse({ error: "Missing Discord token." }, 401, origin, env);
        }
        if (!reason) {
          return jsonResponse({ error: "Please provide a reason for your request." }, 400, origin, env);
        }
        if (!userId) {
          return jsonResponse({ error: "Missing user ID." }, 400, origin, env);
        }

        // Verify user identity
        let discordUserId;
        try {
          const meRes = await fetch("https://discord.com/api/users/@me", {
            headers: { Authorization: `Bearer ${discordToken}` },
          });
          if (!meRes.ok) {
            return jsonResponse({ error: "Discord token invalid." }, 401, origin, env);
          }
          const me = await meRes.json();
          discordUserId = me.id;
          if (discordUserId !== userId) {
            return jsonResponse({ error: "User ID mismatch." }, 403, origin, env);
          }
        } catch {
          return jsonResponse({ error: "Failed to verify Discord identity." }, 401, origin, env);
        }

        // Generate unique request ID
        const requestId = crypto.randomUUID();
        const timestamp = new Date().toISOString();

        // Store the request in Firestore
        const accessToken = await getFirebaseAccessToken(env);
        if (!accessToken) {
          return jsonResponse({ error: "Database not configured." }, 500, origin, env);
        }

        const projectId = env.FIREBASE_PROJECT_ID;
        const docUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/AccessRequests/${encodeURIComponent(requestId)}`;

        const requestData = {
          fields: {
            requestId: { stringValue: requestId },
            discordUserId: { stringValue: discordUserId },
            username: { stringValue: username },
            avatar: { stringValue: avatar },
            reason: { stringValue: reason },
            status: { stringValue: "pending" },
            createdAt: { timestampValue: timestamp },
          },
        };

        try {
          const createRes = await fetch(docUrl, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestData),
          });

          if (!createRes.ok) {
            console.error("Failed to store access request:", await createRes.text());
            return jsonResponse({ error: "Failed to save request." }, 500, origin, env);
          }
        } catch (err) {
          console.error("Error storing access request:", err);
          return jsonResponse({ error: "Failed to save request." }, 500, origin, env);
        }

        // Build the review link URL
        const allowedOrigins = getAllowedOrigins(env.ALLOWED_ORIGINS);
        const siteOrigin = allowedOrigins.find(o => o.includes("github.io")) || allowedOrigins[0] || "";
        const basePath = env.SITE_BASE_PATH || "";
        const reviewLink = siteOrigin ? `${siteOrigin}${basePath}/access-request.html?id=${requestId}` : `Review Request ID: ${requestId}`;

        // Send notification to admin channel
        const embed = {
          title: "\u{1F4E8} New Access Request",
          description: `**${username}** has requested access to the English Quiz channel.`,
          color: 0x5865f2,
          fields: [
            {
              name: "\u{1F464} User",
              value: `<@${discordUserId}>\n(${username})`,
              inline: true,
            },
            {
              name: "\u{1F4DD} Reason",
              value: reason.slice(0, 1024),
              inline: false,
            },
            {
              name: "\u{1F517} Review",
              value: `[Click here to review](${reviewLink})`,
              inline: false,
            },
          ],
          thumbnail: avatar ? { url: avatar } : undefined,
          footer: { text: `Request ID: ${requestId}` },
          timestamp: timestamp,
        };

        try {
          const msgRes = await fetch(
            `https://discord.com/api/channels/${ADMIN_CHANNEL_ID}/messages`,
            {
              method: "POST",
              headers: {
                Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                embeds: [embed],
              }),
            }
          );

          if (!msgRes.ok) {
            console.error("Failed to send admin notification:", await msgRes.text());
            // Don't fail the request, the data is saved
          }
        } catch (err) {
          console.error("Error sending admin notification:", err);
        }

        return jsonResponse({ ok: true, requestId }, 200, origin, env);
      }

      /* ── get-request: fetch access request details ── */
      if (action === "get-request") {
        const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
        if (!requestId) {
          return jsonResponse({ error: "Missing request ID." }, 400, origin, env);
        }

        const accessToken = await getFirebaseAccessToken(env);
        if (!accessToken) {
          return jsonResponse({ error: "Database not configured." }, 500, origin, env);
        }

        const projectId = env.FIREBASE_PROJECT_ID;
        const docUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/AccessRequests/${encodeURIComponent(requestId)}`;

        try {
          const getRes = await fetch(docUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (getRes.status === 404) {
            return jsonResponse({ error: "Request not found." }, 404, origin, env);
          }
          if (!getRes.ok) {
            return jsonResponse({ error: "Failed to fetch request." }, 500, origin, env);
          }

          const doc = await getRes.json();
          const fields = doc.fields || {};

          return jsonResponse({
            ok: true,
            request: {
              requestId: fields.requestId?.stringValue || "",
              discordUserId: fields.discordUserId?.stringValue || "",
              username: fields.username?.stringValue || "",
              avatar: fields.avatar?.stringValue || "",
              reason: fields.reason?.stringValue || "",
              status: fields.status?.stringValue || "pending",
              createdAt: fields.createdAt?.timestampValue || "",
            },
          }, 200, origin, env);
        } catch (err) {
          console.error("Error fetching access request:", err);
          return jsonResponse({ error: "Failed to fetch request." }, 500, origin, env);
        }
      }

      /* ── approve-request: grant role to user ── */
      if (action === "approve-request") {
        if (!env.DISCORD_BOT_TOKEN) {
          return jsonResponse({ error: "Bot token not configured." }, 500, origin, env);
        }

        const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
        if (!requestId) {
          return jsonResponse({ error: "Missing request ID." }, 400, origin, env);
        }

        const accessToken = await getFirebaseAccessToken(env);
        if (!accessToken) {
          return jsonResponse({ error: "Database not configured." }, 500, origin, env);
        }

        const projectId = env.FIREBASE_PROJECT_ID;
        const docUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/AccessRequests/${encodeURIComponent(requestId)}`;

        // Fetch the request
        let requestData;
        try {
          const getRes = await fetch(docUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (getRes.status === 404) {
            return jsonResponse({ error: "Request not found." }, 404, origin, env);
          }
          if (!getRes.ok) {
            return jsonResponse({ error: "Failed to fetch request." }, 500, origin, env);
          }
          const doc = await getRes.json();
          requestData = doc.fields || {};
        } catch {
          return jsonResponse({ error: "Failed to fetch request." }, 500, origin, env);
        }

        const discordUserId = requestData.discordUserId?.stringValue;
        const username = requestData.username?.stringValue || "User";
        const currentStatus = requestData.status?.stringValue;

        if (!discordUserId) {
          return jsonResponse({ error: "Invalid request data." }, 400, origin, env);
        }

        if (currentStatus !== "pending") {
          return jsonResponse({ error: `Request already ${currentStatus}.` }, 400, origin, env);
        }

        // Add role to user
        try {
          const roleRes = await fetch(
            `https://discord.com/api/guilds/${REQUIRED_GUILD_ID}/members/${discordUserId}/roles/${ACCESS_ROLE_ID}`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
              },
            }
          );

          if (!roleRes.ok && roleRes.status !== 204) {
            const errText = await roleRes.text();
            console.error("Failed to add role:", roleRes.status, errText);
            return jsonResponse({ error: "Failed to grant role." }, 502, origin, env);
          }
        } catch (err) {
          console.error("Error adding role:", err);
          return jsonResponse({ error: "Failed to grant role." }, 502, origin, env);
        }

        // Update request status
        try {
          await fetch(`${docUrl}?updateMask.fieldPaths=status&updateMask.fieldPaths=reviewedAt`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              fields: {
                status: { stringValue: "approved" },
                reviewedAt: { timestampValue: new Date().toISOString() },
              },
            }),
          });
        } catch {
          // Non-critical
        }

        // Send DM to user
        try {
          // First create a DM channel
          const dmChannelRes = await fetch("https://discord.com/api/users/@me/channels", {
            method: "POST",
            headers: {
              Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ recipient_id: discordUserId }),
          });

          if (dmChannelRes.ok) {
            const dmChannel = await dmChannelRes.json();
            await fetch(`https://discord.com/api/channels/${dmChannel.id}/messages`, {
              method: "POST",
              headers: {
                Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                embeds: [{
                  title: "\u2705 Access Request Approved!",
                  description: "Your request to access the English Quiz channel has been **approved**! You can now take quizzes and track your progress.",
                  color: 0x23a559,
                  footer: { text: "Welcome to the English Quiz community!" },
                }],
              }),
            });
          }
        } catch (err) {
          console.error("Error sending approval DM:", err);
          // Non-critical
        }

        return jsonResponse({ ok: true, message: `Approved access for ${username}` }, 200, origin, env);
      }

      /* ── deny-request: reject and notify user ── */
      if (action === "deny-request") {
        if (!env.DISCORD_BOT_TOKEN) {
          return jsonResponse({ error: "Bot token not configured." }, 500, origin, env);
        }

        const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
        if (!requestId) {
          return jsonResponse({ error: "Missing request ID." }, 400, origin, env);
        }

        const accessToken = await getFirebaseAccessToken(env);
        if (!accessToken) {
          return jsonResponse({ error: "Database not configured." }, 500, origin, env);
        }

        const projectId = env.FIREBASE_PROJECT_ID;
        const docUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/AccessRequests/${encodeURIComponent(requestId)}`;

        // Fetch the request
        let requestData;
        try {
          const getRes = await fetch(docUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (getRes.status === 404) {
            return jsonResponse({ error: "Request not found." }, 404, origin, env);
          }
          if (!getRes.ok) {
            return jsonResponse({ error: "Failed to fetch request." }, 500, origin, env);
          }
          const doc = await getRes.json();
          requestData = doc.fields || {};
        } catch {
          return jsonResponse({ error: "Failed to fetch request." }, 500, origin, env);
        }

        const discordUserId = requestData.discordUserId?.stringValue;
        const username = requestData.username?.stringValue || "User";
        const currentStatus = requestData.status?.stringValue;

        if (!discordUserId) {
          return jsonResponse({ error: "Invalid request data." }, 400, origin, env);
        }

        if (currentStatus !== "pending") {
          return jsonResponse({ error: `Request already ${currentStatus}.` }, 400, origin, env);
        }

        // Update request status
        try {
          await fetch(`${docUrl}?updateMask.fieldPaths=status&updateMask.fieldPaths=reviewedAt`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              fields: {
                status: { stringValue: "denied" },
                reviewedAt: { timestampValue: new Date().toISOString() },
              },
            }),
          });
        } catch {
          // Non-critical
        }

        // Send DM to user
        try {
          // First create a DM channel
          const dmChannelRes = await fetch("https://discord.com/api/users/@me/channels", {
            method: "POST",
            headers: {
              Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ recipient_id: discordUserId }),
          });

          if (dmChannelRes.ok) {
            const dmChannel = await dmChannelRes.json();
            await fetch(`https://discord.com/api/channels/${dmChannel.id}/messages`, {
              method: "POST",
              headers: {
                Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                embeds: [{
                  title: "\u274C Access Request Denied",
                  description: "Your request to access the English Quiz channel has been **denied**. If you believe this was a mistake, you can submit another request with more details about your interest.",
                  color: 0xed4245,
                  footer: { text: "You can appeal by submitting a new request." },
                }],
              }),
            });
          }
        } catch (err) {
          console.error("Error sending denial DM:", err);
          // Non-critical
        }

        return jsonResponse({ ok: true, message: `Denied access for ${username}` }, 200, origin, env);
      }

      const validation = await validatePayload(body, env, action === "share");
      if (!validation.ok) {
        return jsonResponse({ error: validation.error }, 400, origin, env);
      }

      // Require Turnstile token globally to prevent backend spam and spoofing
      if (env.TURNSTILE_SECRET_KEY && !validation.payload.turnstileToken) {
        return jsonResponse(
          { error: "Missing anti-spam token. Please complete the captcha." },
          400,
          origin,
          env
        );
      }

      // Verify Turnstile token if one was provided
      if (validation.payload.turnstileToken) {
        const turnstileResult = await verifyTurnstile(
          validation.payload.turnstileToken,
          request.headers.get("CF-Connecting-IP") ?? "",
          env
        );

        if (!turnstileResult.success) {
          return jsonResponse(
            { error: "Anti-spam verification failed." },
            403,
            origin,
            env
          );
        }
      }

      // Verify Discord OAuth Token matches the expected userId
      if (!validation.payload.discordToken) {
        return jsonResponse(
          { error: "Missing Discord token." },
          401,
          origin,
          env
        );
      }

      const isValidDiscordUser = await verifyDiscordUser(
        validation.payload.discordToken,
        validation.payload.userId
      );

      if (!isValidDiscordUser) {
        return jsonResponse(
          { error: "Unauthorized. Discord token validation failed." },
          401,
          origin,
          env
        );
      }

      if (action === "submit") {
        const userDoc = await getUserDocumentFromFirestore(validation.payload.userId, env);

        // One-time submit: reject if the user already submitted this quiz
        const prevHistory = userDoc?.existing?.quizHistory?.arrayValue?.values ?? [];
        const alreadySubmitted = prevHistory.some(
          (entry) => entry?.mapValue?.fields?.quizId?.stringValue === validation.payload.quizId
        );
        if (alreadySubmitted) {
          return jsonResponse(
            { error: "You have already submitted this quiz." },
            409,
            origin,
            env
          );
        }

        // Save verified result to Firestore using admin credentials
        const saveResult = await saveResultToFirestore(validation.payload, env, userDoc);
        if (!saveResult.saved) {
          return jsonResponse(
            { error: saveResult.reason },
            500,
            origin,
            env
          );
        }

        // Build per-question results (don't expose raw answer key array)
        const correctAnswers = validation.payload.answers;
        const explanations = validation.payload.explanations;
        const submittedAnswers = validation.payload.userAnswers;
        const results = correctAnswers.map((correctIdx, i) => ({
          correct: submittedAnswers[i] === correctIdx,
          correctIndex: correctIdx,
          explanation: explanations[i] ?? "",
        }));

        return jsonResponse({
          ok: true,
          score: validation.payload.score,
          total: validation.payload.total,
          bestStreak: validation.payload.bestStreak,
          percentage: validation.payload.percentage,
          level: validation.payload.level,
          results,
        }, 200, origin, env);
      }

      if (action === "share") {

        // Secure the share payload by fetching it directly from their Firestore document.
        // Do not trust the client's score to prevent forged webhook spam.
        const userDoc = await getUserDocumentFromFirestore(validation.payload.userId, env);
        if (!userDoc || !userDoc.existing || !userDoc.existing.quizHistory) {
          return jsonResponse({ error: "No quiz history found to share." }, 404, origin, env);
        }

        const prevShared = userDoc.existing.sharedQuizzes?.arrayValue?.values || [];
        const alreadyShared = prevShared.some(
          (value) => value?.stringValue === validation.payload.quizId
        );
        if (alreadyShared) {
          return jsonResponse(
            { error: "This quiz has already been shared." },
            409,
            origin,
            env
          );
        }

        // Check share cooldown to prevent webhook spam
        const lastShareTime = new Date(
          userDoc.existing.lastShareTimestamp?.timestampValue || 0
        ).getTime();
        if (lastShareTime && Date.now() - lastShareTime < SHARE_COOLDOWN_MS) {
          return jsonResponse(
            { error: "Please wait before sharing again." },
            429,
            origin,
            env
          );
        }

        const history = userDoc.existing.quizHistory.arrayValue?.values || [];
        // Grab the most recent attempt for this specific quizId
        const recentAttempts = history
          .map(h => h.mapValue?.fields)
          .filter(f => f?.quizId?.stringValue === validation.payload.quizId)
          .sort((a, b) => {
            const dateA = new Date(a.completedAt?.stringValue || 0);
            const dateB = new Date(b.completedAt?.stringValue || 0);
            return dateB - dateA; // descending
          });

        if (recentAttempts.length === 0) {
          return jsonResponse({ error: "No completed score found for this quiz to share." }, 403, origin, env);
        }

        const verifiedAttempt = recentAttempts[0];
        const verifiedPayload = {
          ...validation.payload,
          score: Number(verifiedAttempt.score?.integerValue ?? verifiedAttempt.score?.doubleValue ?? 0),
          total: Number(verifiedAttempt.total?.integerValue ?? verifiedAttempt.total?.doubleValue ?? 0),
          bestStreak: Number(verifiedAttempt.bestStreak?.integerValue ?? verifiedAttempt.bestStreak?.doubleValue ?? 0),
        };

        const discordResponse = await fetch(env.DISCORD_WEBHOOK_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(buildDiscordPayload(verifiedPayload)),
        });

        if (!discordResponse.ok) {
          const errorText = await discordResponse.text();
          return jsonResponse(
            {
              error: "Discord webhook request failed.",
              details: errorText.slice(0, 300),
            },
            502,
            origin,
            env
          );
        }

        // Record share timestamp and add to sharedQuizzes
        const sharedSet = new Set(prevShared.map((v) => v.stringValue));
        sharedSet.add(validation.payload.quizId);

        try {
          await fetch(
            `${userDoc.docUrl}?updateMask.fieldPaths=lastShareTimestamp&updateMask.fieldPaths=sharedQuizzes`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${userDoc.accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                fields: {
                  lastShareTimestamp: {
                    timestampValue: new Date().toISOString(),
                  },
                  sharedQuizzes: {
                    arrayValue: {
                      values: [...sharedSet].map((v) => ({ stringValue: v })),
                    },
                  },
                },
              }),
            }
          );
        } catch {
          // Non-critical: share succeeded, cooldown tracking failed
        }

        return jsonResponse({ ok: true }, 200, origin, env);
      }

      return jsonResponse({ error: "Invalid action." }, 400, origin, env);

    } catch (err) {
      console.error("Unhandled worker error:", err);
      return jsonResponse(
        { error: "Internal server error." },
        500,
        origin,
        env
      );
    }
  },
};
