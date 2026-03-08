const JSON_HEADERS = {
  "content-type": "application/json; charset=UTF-8",
};

const RESULT_LEVELS = [
  { minPercentage: 80, level: "Advanced", emoji: "\u{1F451}", color: 0x23a559 },
  { minPercentage: 60, level: "Intermediate", emoji: "\u{2B50}", color: 0xf0b232 },
  { minPercentage: 0, level: "Beginner", emoji: "\u{1F4DA}", color: 0xf47b67 },
];

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

function parseNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function getResultSummary(score, total) {
  const percentage = Math.round((score / total) * 100);
  const match = RESULT_LEVELS.find((item) => percentage >= item.minPercentage);
  return { percentage, ...match };
}

function validatePayload(body, env) {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid JSON body." };
  }

  const username = sanitizeText(body.username);
  const quizId = sanitizeText(body.quizId, "").toLowerCase();
  const quizTitle = sanitizeText(body.quizTitle, "Quiz");
  const avatar = sanitizeAvatarUrl(body.avatar);
  const score = parseNonNegativeInteger(body.score);
  const total = parseNonNegativeInteger(body.total);
  const bestStreak = parseNonNegativeInteger(body.bestStreak);

  if (!quizId || quizId.length > 64) {
    return { ok: false, error: "Invalid quiz id." };
  }

  if (score === null || total === null || total < 1 || score > total) {
    return { ok: false, error: "Invalid score payload." };
  }

  if (bestStreak === null || bestStreak > total) {
    return { ok: false, error: "Invalid streak payload." };
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
      username,
      quizId,
      quizTitle,
      quizLink: siteBaseUrl.toString(),
      avatar,
      score,
      total,
      bestStreak,
      turnstileToken:
        typeof body.turnstileToken === "string" ? body.turnstileToken.trim() : "",
    },
  };
}

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
