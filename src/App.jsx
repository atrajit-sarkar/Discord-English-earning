import { useEffect, useState } from "react";

const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID?.trim() ?? "";
const DISCORD_WEBHOOK_URL =
  import.meta.env.VITE_DISCORD_WEBHOOK_URL?.trim() ?? "";
const REDIRECT_URI = `${window.location.origin}${window.location.pathname}`;
const OAUTH_STORAGE_KEY = "discord-oauth-response";

const questions = [
  {
    question:
      'A friendly cashier says, "Hey! How\'s it going?" What is the most natural, casual response?',
    options: [
      "I am functioning optimally, thank you.",
      "Not much, you?",
      "I do not know.",
      "It goes well.",
    ],
    correct: 1,
  },
  {
    question:
      "Someone is speaking very fast and you completely missed their point. What should you say?",
    options: [
      "I'm not sure I follow you.",
      "What is your meaning?",
      "Speak to me slower.",
      "I am confused by your words.",
    ],
    correct: 0,
  },
  {
    question: "You see a friend you haven't seen in three months. What do you say?",
    options: [
      "How are you existing?",
      "What is up?",
      "How have you been?",
      "Are you fine?",
    ],
    correct: 2,
  },
  {
    question:
      'Which of these is a casual way to say "Hello" when passing a coworker in the hallway?',
    options: [
      "Greetings to you.",
      "What's up?",
      "How do you do?",
      "I acknowledge you.",
    ],
    correct: 1,
  },
  {
    question:
      "You didn't hear what someone just said. What is the most polite, natural response?",
    options: [
      "Repeat it.",
      "What?",
      "Would you mind repeating that?",
      "Say again your words.",
    ],
    correct: 2,
  },
];

function TrophyIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M8 21h8m-7-4h6m-6-2.5V13A5 5 0 0 1 7 9V4h10v5a5 5 0 0 1-2 4v1.5M7 6H4a1 1 0 0 0-1 1 5 5 0 0 0 5 5m9-6h3a1 1 0 0 1 1 1 5 5 0 0 1-5 5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ArrowRightIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="m5 12h14m-5-5 5 5-5 5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function LoginIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SendIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="m22 2-7 20-4-9-9-4 20-7Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="m5 12 4.5 4.5L19 7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ErrorIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M12 8v5m0 3h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SpinnerIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M21 12a9 9 0 1 1-3.04-6.77"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function getResultSummary(score) {
  const percentage = Math.round((score / questions.length) * 100);

  if (percentage >= 80) {
    return {
      percentage,
      level: "Advanced",
      message: "Strong instincts for everyday spoken English.",
      color: 0x1f8b4c,
    };
  }

  if (percentage >= 60) {
    return {
      percentage,
      level: "Intermediate",
      message: "You are picking up natural phrasing well.",
      color: 0xf1c40f,
    };
  }

  return {
    percentage,
    level: "Beginner",
    message: "Keep practicing common conversational patterns.",
    color: 0xe67e22,
  };
}

function isPlaceholder(value) {
  return !value || value.includes("YOUR_");
}

function readStoredOauthResponse() {
  try {
    const storedValue = window.sessionStorage.getItem(OAUTH_STORAGE_KEY);
    return storedValue ? JSON.parse(storedValue) : null;
  } catch {
    return null;
  }
}

function writeStoredOauthResponse(payload) {
  try {
    window.sessionStorage.setItem(OAUTH_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures and fall back to the current in-memory flow.
  }
}

function clearStoredOauthResponse() {
  try {
    window.sessionStorage.removeItem(OAUTH_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState("");
  const [quizState, setQuizState] = useState("welcome");
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [webhookStatus, setWebhookStatus] = useState("idle");

  const discordConfigured = !isPlaceholder(DISCORD_CLIENT_ID);
  const webhookConfigured = !isPlaceholder(DISCORD_WEBHOOK_URL);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const hashPayload = {
      accessToken: fragment.get("access_token"),
      tokenType: fragment.get("token_type"),
      oauthError: fragment.get("error"),
      oauthErrorDescription: fragment.get("error_description"),
    };
    const hasHashPayload = Object.values(hashPayload).some(Boolean);

    if (hasHashPayload) {
      writeStoredOauthResponse(hashPayload);
    }

    if (window.location.hash) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }

    const oauthPayload = readStoredOauthResponse();
    const accessToken = oauthPayload?.accessToken ?? "";
    const tokenType = oauthPayload?.tokenType ?? "";
    const oauthError = oauthPayload?.oauthError ?? "";
    const oauthErrorDescription = oauthPayload?.oauthErrorDescription ?? "";

    if (oauthError) {
      setAuthError(
        oauthErrorDescription?.replace(/\+/g, " ") ||
          "Discord login was cancelled or denied.",
      );
      clearStoredOauthResponse();
      setLoadingAuth(false);
      return;
    }

    if (!accessToken || !tokenType) {
      clearStoredOauthResponse();
      setLoadingAuth(false);
      return;
    }

    let ignore = false;

    fetch("https://discord.com/api/users/@me", {
      headers: {
        authorization: `${tokenType} ${accessToken}`,
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch Discord profile.");
        }

        return response.json();
      })
      .then((profile) => {
        if (ignore) {
          return;
        }

        setUser({
          id: profile.id,
          username: profile.username,
          avatar: profile.avatar
            ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
            : "https://cdn.discordapp.com/embed/avatars/0.png",
        });
        setAuthError("");
      })
      .catch(() => {
        if (ignore) {
          return;
        }

        setAuthError("Could not load your Discord profile.");
      })
      .finally(() => {
        clearStoredOauthResponse();
        if (!ignore) {
          setLoadingAuth(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  function handleDiscordLogin() {
    if (!discordConfigured) {
      setAuthError("Add VITE_DISCORD_CLIENT_ID to .env before using Discord login.");
      return;
    }

    const oauthUrl =
      "https://discord.com/api/oauth2/authorize" +
      `?client_id=${DISCORD_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      "&response_type=token&scope=identify";

    window.location.href = oauthUrl;
  }

  function handleAnswerClick(index) {
    if (index === questions[currentQuestion].correct) {
      setScore((previousScore) => previousScore + 1);
    }

    if (currentQuestion + 1 < questions.length) {
      setCurrentQuestion((previousQuestion) => previousQuestion + 1);
      return;
    }

    setQuizState("results");
  }

  async function sendResultsToDiscord() {
    if (!user || !webhookConfigured) {
      setWebhookStatus("error");
      return;
    }

    setWebhookStatus("sending");

    const result = getResultSummary(score);

    const payload = {
      username: "English Quiz Bot",
      embeds: [
        {
          title: `Quiz Results: ${user.username}`,
          description: `${user.username} completed the Modern Spoken English Quiz.`,
          color: result.color,
          thumbnail: {
            url: user.avatar,
          },
          fields: [
            {
              name: "Score",
              value: `${score} / ${questions.length} (${result.percentage}%)`,
              inline: true,
            },
            {
              name: "Level",
              value: result.level,
              inline: true,
            },
          ],
          footer: {
            text: "Invite the community to take the quiz.",
          },
          timestamp: new Date().toISOString(),
        },
      ],
    };

    try {
      const response = await fetch(DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      setWebhookStatus(response.ok ? "success" : "error");
    } catch (error) {
      console.error(error);
      setWebhookStatus("error");
    }
  }

  function resetQuiz() {
    setCurrentQuestion(0);
    setScore(0);
    setQuizState("welcome");
    setWebhookStatus("idle");
  }

  if (loadingAuth) {
    return (
      <main className="page-shell">
        <section className="card card--compact status-card">
          <SpinnerIcon className="icon icon--spin icon--large" />
          <p>Checking Discord login state...</p>
        </section>
      </main>
    );
  }

  if (quizState === "quiz") {
    const question = questions[currentQuestion];
    const progress = (currentQuestion / questions.length) * 100;

    return (
      <main className="page-shell">
        <section className="card quiz-card">
          <div className="quiz-progress">
            <div className="quiz-progress__bar" style={{ width: `${progress}%` }} />
          </div>

          <p className="eyebrow">
            Question {currentQuestion + 1} of {questions.length}
          </p>
          <h1 className="quiz-title">{question.question}</h1>

          <div className="quiz-options">
            {question.options.map((option, index) => (
              <button
                key={option}
                type="button"
                className="quiz-option"
                onClick={() => handleAnswerClick(index)}
              >
                {option}
              </button>
            ))}
          </div>
        </section>
      </main>
    );
  }

  if (quizState === "results") {
    const result = getResultSummary(score);

    return (
      <main className="page-shell">
        <section className="card card--compact results-card">
          <p className="eyebrow">Quiz complete</p>
          <h1 className="hero-title">Your score</h1>

          <div className="score-badge">
            <strong>
              {score} / {questions.length}
            </strong>
            <span>{result.percentage}%</span>
          </div>

          <p className="support-copy">{result.message}</p>

          {!webhookConfigured && (
            <div className="notice notice--warning">
              <ErrorIcon className="icon" />
              <span>Add `VITE_DISCORD_WEBHOOK_URL` in `.env` to enable Discord sharing.</span>
            </div>
          )}

          <div className="actions">
            <button
              type="button"
              className="button button--discord"
              onClick={sendResultsToDiscord}
              disabled={webhookStatus === "sending" || !webhookConfigured}
            >
              {webhookStatus === "sending" ? (
                <>
                  <SpinnerIcon className="icon icon--spin" />
                  Sending...
                </>
              ) : (
                <>
                  <SendIcon className="icon" />
                  Share score to Discord
                </>
              )}
            </button>

            <button type="button" className="button button--ghost" onClick={resetQuiz}>
              Play again
            </button>
          </div>

          {webhookStatus === "success" && (
            <div className="notice notice--success">
              <CheckIcon className="icon" />
              <span>Results sent to your Discord channel.</span>
            </div>
          )}

          {webhookStatus === "error" && (
            <div className="notice notice--error">
              <ErrorIcon className="icon" />
              <span>Could not send the result. Check the webhook URL.</span>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="card hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Discord community activity</p>
          <h1 className="hero-title">Modern Spoken English Quiz</h1>
          <p className="support-copy">
            Let members log in with Discord, answer a short English quiz, and
            optionally post their score back to your channel.
          </p>

          {authError && (
            <div className="notice notice--error">
              <ErrorIcon className="icon" />
              <span>{authError}</span>
            </div>
          )}

          {!user ? (
            <button
              type="button"
              className="button button--discord"
              onClick={handleDiscordLogin}
            >
              <LoginIcon className="icon" />
              Connect Discord to play
            </button>
          ) : (
            <div className="user-panel">
              <div className="user-chip">
                <img src={user.avatar} alt="" className="avatar" />
                <span>{user.username}</span>
              </div>

              <button
                type="button"
                className="button button--primary"
                onClick={() => setQuizState("quiz")}
              >
                Start quiz
                <ArrowRightIcon className="icon" />
              </button>
            </div>
          )}
        </div>

        <aside className="setup-panel" aria-label="Setup checklist">
          <div className="setup-panel__header">
            <TrophyIcon className="icon icon--accent icon--large" />
            <div>
              <h2>Setup checklist</h2>
              <p>Fill these values before deploying.</p>
            </div>
          </div>

          <ul className="setup-list">
            <li className={discordConfigured ? "is-ready" : "is-missing"}>
              <span className="setup-list__status" />
              Discord client ID
            </li>
            <li className={webhookConfigured ? "is-ready" : "is-missing"}>
              <span className="setup-list__status" />
              Discord webhook URL
            </li>
            <li className="is-ready">
              <span className="setup-list__status" />
              Redirect URI is generated from the current page URL
            </li>
          </ul>

          <div className="setup-note">
            <strong>Redirect URIs to add in Discord:</strong>
            <code>http://localhost:5173/</code>
            <code>{REDIRECT_URI}</code>
          </div>
        </aside>
      </section>
    </main>
  );
}
