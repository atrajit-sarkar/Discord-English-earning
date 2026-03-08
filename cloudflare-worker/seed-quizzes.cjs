const fs = require('fs');
const crypto = require('crypto');

// Copy QUIZZES from App.jsx
const QUIZZES = {
  "everyday-spoken": [
    {
      question: 'A friendly cashier says, "Hey! How\'s it going?" What is the most natural, casual response?',
      options: ["I am functioning optimally, thank you.", "Not much, you?", "I do not know.", "It goes well."],
      correct: 1,
      explanation: '"Not much, you?" mirrors the casual tone perfectly.',
    },
    {
      question: "Someone is speaking very fast and you completely missed their point. What should you say?",
      options: ["I'm not sure I follow you.", "What is your meaning?", "Speak to me slower.", "I am confused by your words."],
      correct: 0,
      explanation: '"I\'m not sure I follow you" is polite and natural in conversation.',
    },
    {
      question: "You see a friend you haven't seen in three months. What do you say?",
      options: ["How are you existing?", "What is up?", "How have you been?", "Are you fine?"],
      correct: 2,
      explanation: '"How have you been?" naturally asks about the time since you last met.',
    },
    {
      question: 'Which of these is a casual way to say "Hello" when passing a coworker in the hallway?',
      options: ["Greetings to you.", "What's up?", "How do you do?", "I acknowledge you."],
      correct: 1,
      explanation: '"What\'s up?" is the go-to casual greeting in everyday English.',
    },
    {
      question: "You didn't hear what someone just said. What is the most polite, natural response?",
      options: ["Repeat it.", "What?", "Would you mind repeating that?", "Say again your words."],
      correct: 2,
      explanation: '"Would you mind repeating that?" is both polite and commonly used.',
    },
  ],
  "advanced-business": [
    {
      question: "In a formal meeting, how would you best express that you agree with a colleague's point?",
      options: ["I concur completely.", "You betcha.", "That is truth.", "I'm with you dog."],
      correct: 0,
      explanation: '"I concur completely" or simply "I agree" is professional and clear.'
    },
    {
      question: "You need to delay a project deadline. What is the most professional way to tell your manager?",
      options: ["I can't do this now.", "We need to push the deadline back.", "This is too much work.", "Give me more time."],
      correct: 1,
      explanation: '"We need to push the deadline back" is professional and direct.'
    },
    {
      question: "How do you politely interrupt someone in a meeting?",
      options: ["Stop talking.", "May I interject for a moment?", "Hold up.", "My turn."],
      correct: 1,
      explanation: '"May I interject for a moment?" is a polite and professional way to interrupt.'
    },
    {
      question: "When explaining a complex issue, how can you check for understanding?",
      options: ["Are you stupid?", "Do you understand me?", "Does that make sense?", "Get it?"],
      correct: 2,
      explanation: '"Does that make sense?" is a non-confrontational way to check understanding.'
    },
    {
      question: "How would you formally decline a meeting invitation?",
      options: ["No thanks.", "I'll pass.", "I am unable to attend due to prior commitments.", "Nah."],
      correct: 2,
      explanation: '"I am unable to attend due to prior commitments." is polite and formal.'
    }
  ],
  "nautical-idioms": [
    {
      question: "If a business owner says, \"Sales are dropping this quarter, so we need to ________ by cutting costs,\" which nautical idiom completes the sentence to mean preparing for a difficult situation?",
      options: ["Batten down the hatches", "Rock the boat", "Jump ship", "Go overboard"],
      correct: 0,
      explanation: '"Batten down the hatches" means to get ready for a difficult situation by preparing in every way possible. It comes from sailors securely closing a ship\'s hatches when a severe storm is approaching.',
    },
    {
      question: "If you want to compliment a manager by saying they control their business or organization very firmly and effectively, which nautical idiom would you use?",
      options: ["Steer the course", "Sail close to the wind", "Run a tight ship", "Anchor the team"],
      correct: 2,
      explanation: 'When someone \"runs a tight ship,\" it means they keep everything highly organized, disciplined, and functioning smoothly. Native speakers often use this in the workplace to describe a strict but highly effective leader.',
    },
    {
      question: "A coworker tells you, \"We have lots of major bookings ________ and are confident of making excellent profits.\" Which nautical phrase completes the sentence to mean that something is \"likely to happen soon\"?",
      options: ["On the horizon", "In the offing", "At the helm", "In the wake"],
      correct: 1,
      explanation: 'The \"offing\" was a nautical term for the part of the sea visible on the distant horizon. In modern English, if something is \"in the offing,\" it means it can be seen on the horizon and is likely to happen soon.',
    },
    {
      question: "What idiom would you use to describe a situation where you have no good choices, and are placed between two equally hazardous alternatives?",
      options: ["Caught in the doldrums", "Between the devil and the deep blue sea", "Lost at sea", "Up the creek without a paddle"],
      correct: 1,
      explanation: 'This proverb describes being trapped between two equally precarious situations. The \"devil\" was actually the outermost seam on the deck of a wooden ship, putting sailors dangerously close to falling into the deep ocean. Today it means being stuck between two bad options.',
    },
    {
      question: "You wake up feeling ill and need to call your boss to ask for a day off. Which nautical cliché would you use to describe feeling unwell?",
      options: ["All at sea", "In deep water", "Under the weather", "Adrift"],
      correct: 2,
      explanation: 'To be \"under the weather\" means to feel unwell. This expression originally referred to seasickness—suffering from nausea on board a ship because of heavy seas and bad weather. Today, it is a very common cliché to simply mean you are sick.',
    }
  ]
};

async function main() {
  const envRaw = fs.readFileSync('.dev.vars', 'utf8');
  const env = {};
  envRaw.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const idx = line.indexOf('=');
      if (idx > 0) {
        let key = line.slice(0, idx).trim();
        let val = line.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
          // if it ends with another quote because of unescaping, handle it roughly, this is just for seed script
        }
        // Very basic parsing for development env vars
        // We know for sure it's JSON because it is FIREBASE_SERVICE_ACCOUNT
        try {
            if (val.includes('\\"')) {
                // If it looks like escaped JSON inside an env var string
                if (key === 'FIREBASE_SERVICE_ACCOUNT') {
                    // It's likely raw JSON in single line if it's from wrangler file, or complex. Let's just try parse
                    env[key] = JSON.parse(val.replace(/\\"/g, '"').replace(/\\\\n/g, '\\n'));
                }
            } else if (val.startsWith('{')) {
                env[key] = val; // leave raw
            } else {
                env[key] = val;
            }
        } catch(e) {
             env[key] = val;
        }
      }
    }
  });

  const saRaw = env.FIREBASE_SERVICE_ACCOUNT;
  if (!saRaw) {
    console.error("FIREBASE_SERVICE_ACCOUNT not found in .dev.vars");
    process.exit(1);
  }
  
  let sa;
  try {
     sa = typeof saRaw === 'string' ? JSON.parse(saRaw) : saRaw;
  } catch(e) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT", e);
      process.exit(1);
  }

  // --- Implement simple JWT signing for service account in Node ---
  function base64url(source) {
      if (typeof source === 'string') {
        return Buffer.from(source).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      }
      return Buffer.from(source).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
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

  const unsigned = `${header}.${claim}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = base64url(signer.sign(sa.private_key));

  const jwt = `${unsigned}.${signature}`;

  console.log("Fetching access token...");
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
     const err = await tokenRes.text();
     console.error("Failed to get token", err);
     process.exit(1);
  }
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  console.log("Access token retrieved.");

  const projectId = sa.project_id;
  
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

  for (const [quizId, questions] of Object.entries(QUIZZES)) {
      const answers = questions.map(q => q.correct);
      const explanations = questions.map(q => q.explanation);

      const docUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/QuizzesData/${encodeURIComponent(quizId)}`;
      
      const fields = {
          answers: toFirestoreValue(answers),
          explanations: toFirestoreValue(explanations)
      };

      console.log(`Writing quiz ${quizId}...`);
      const patchRes = await fetch(`${docUrl}`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ fields }),
      });

      if (!patchRes.ok) {
          console.error(`Failed to write quiz ${quizId}`, await patchRes.text());
      } else {
          console.log(`Successfully wrote quiz ${quizId}.`);
      }
  }

}

main().catch(console.error);
