import fs from 'fs';
import crypto from 'crypto';

const sa = JSON.parse(fs.readFileSync('./discord-en-jp-practice-firebase-adminsdk-fbsvc-d44c320f06.json', 'utf8'));

function base64url(source) {
    let str;
    if (typeof source === "string") {
        str = Buffer.from(source).toString('base64');
    } else {
        str = Buffer.from(source).toString('base64');
    }
    return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getFirebaseAccessToken() {
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

    const pemBody = sa.private_key;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${header}.${claim}`);
    const signature = signer.sign(pemBody, 'base64').replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const jwt = `${header}.${claim}.${signature}`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });

    const tokenData = await tokenRes.json();
    return tokenData.access_token ?? null;
}

async function run() {
    const token = await getFirebaseAccessToken();
    const projectId = sa.project_id;
    const quizId = "gen-z-slang";
    const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/QuizzesData/${quizId}`;

    const body = {
        fields: {
            answers: {
                arrayValue: {
                    values: [
                        { integerValue: "0" },
                        { integerValue: "1" },
                        { integerValue: "2" },
                        { integerValue: "3" },
                        { integerValue: "1" }
                    ]
                }
            },
            explanations: {
                arrayValue: {
                    values: [
                        { stringValue: "In modern slang, \"cap\" means a lie or something that is not true. Saying \"no cap\" is a way to emphasize that you are being completely honest, authentic, and not lying." },
                        { stringValue: "\"Rizz\" is short for \"charisma\". It refers to a person's ability to charm, seduce, or flirt with a potential love interest effortlessly." },
                        { stringValue: "To \"ghost\" someone means to suddenly cut off all communication and ignore them completely. It is most often used to describe ending a romantic relationship abruptly by just disappearing from the person's digital and real world." },
                        { stringValue: "\"Bussin'\" is a popular slang term used to describe something that is extremely good or amazing. While it can be applied to various things, native speakers use it most frequently to describe food that tastes spectacular." },
                        { stringValue: "\"Touch grass\" is a phrase used to tell someone who has been online for too long that they are losing touch with reality. It serves as a reminder to go outside, get some fresh air, and interact with the real world." }
                    ]
                }
            }
        }
    };

    const res = await fetch(docUrl, {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    console.log(res.status, await res.text());
}

run();
