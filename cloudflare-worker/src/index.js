const JSON_HEADERS = {
  "content-type": "application/json; charset=UTF-8",
};

const RESULT_LEVELS = [
  { minPercentage: 80, level: "Advanced", emoji: "\u{1F451}", color: 0x23a559 },
  { minPercentage: 60, level: "Intermediate", emoji: "\u{2B50}", color: 0xf0b232 },
  { minPercentage: 0, level: "Beginner", emoji: "\u{1F4DA}", color: 0xf47b67 },
];

/* ── Server-side answer keys (source of truth) ── */
const QUIZ_ANSWER_KEYS = {
  "everyday-spoken":    [1, 0, 2, 1, 2],
  "advanced-business":  [0, 1, 1, 2, 2],
  "nautical-idioms":    [0, 2, 1, 1, 2],
};

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

function computeScore(quizId, userAnswers) {
  const key = QUIZ_ANSWER_KEYS[quizId];
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
    if (userAnswers[i] === key[i]) {
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

function validatePayload(body, env) {
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

  const computed = computeScore(quizId, body.userAnswers);
  if (!computed) {
    return { ok: false, error: "Invalid quiz answers." };
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

  return {
    ok: true,
    payload: {
      userId,
      username,
      quizId,
      quizTitle,
      quizLink: siteBaseUrl.toString(),
      avatar,
      score: computed.score,
      total: computed.total,
      bestStreak: computed.bestStreak,
      percentage: computed.percentage,
      level: computed.level,
      userAnswers: body.userAnswers,
      turnstileToken:
        typeof body.turnstileToken === "string" ? body.turnstileToken.trim() : "",
    },
  };
}

/* ── Turnstile verification ── */

async function verifyTurnstile(token, ipAddress, env) {
  if (!env.TURNSTILE_SECRET_KEY) {
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
    return null;
  }

  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
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
  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

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

async function saveResultToFirestore(payload, env) {
  const accessToken = await getFirebaseAccessToken(env);
  if (!accessToken) {
    return { saved: false, reason: "Service account not configured." };
  }

  const projectId = env.FIREBASE_PROJECT_ID;
  const docUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/English/${encodeURIComponent(payload.userId)}`;

  // Read existing document
  let existing = {};
  try {
    const getRes = await fetch(docUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (getRes.ok) {
      const doc = await getRes.json();
      if (doc.fields) {
        existing = doc.fields;
      }
    }
  } catch {
    // document may not exist yet
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

    const validation = validatePayload(body, env);
    if (!validation.ok) {
      return jsonResponse({ error: validation.error }, 400, origin, env);
    }

    if (env.TURNSTILE_SECRET_KEY && !validation.payload.turnstileToken) {
      return jsonResponse(
        { error: "Missing anti-spam token." },
        400,
        origin,
        env
      );
    }

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

    // Save verified result to Firestore using admin credentials
    const saveResult = await saveResultToFirestore(validation.payload, env);
    if (!saveResult.saved) {
      return jsonResponse(
        { error: saveResult.reason },
        500,
        origin,
        env
      );
    }

    const discordResponse = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(buildDiscordPayload(validation.payload)),
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

    return jsonResponse({ ok: true }, 200, origin, env);
  },
};
