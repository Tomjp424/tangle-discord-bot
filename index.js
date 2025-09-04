import fs from "fs";
import path from "path";
import readlineSync from "readline-sync";
import { google } from "googleapis";
import { htmlToText } from "html-to-text";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY})

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

// Load gmail credentials saved on the local machine
function createOAuthClient() {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        "http://localhost",
    )
}
// If saved credentials are not yet authorized, prompt user to authorize
function authorize() {
    const oAuth2Client = createOAuthClient();
    oAuth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    return oAuth2Client;
}

// Extract the body of the email in plain text
function getBody(parts) {
    for (let part of parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
            return Buffer.from(part.body.data, 'base64').toString('utf8');
        }
        if (part.mimeType === 'text/plain' && part.body?.data) {
            return Buffer.from(part.body.data, 'base64').toString('utf8');
        }
        if (part.parts) {
            const nestedParts = getBody(part.parts);
            if (nestedParts) return nestedParts;
        }
    }
    return null;
}

// Summarize the provided newsletter
async function summarizeNewsLetter(text) {
    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            {
                role: 'system',
                content: `You are a bot for summarizing a newsletter. Please summarize the provided content into short, concise paragraphs.
                Disregard everything besides the introduction to the main topic, what the right is saying, what the left is saying,
                and the "My Take" section (Which you will label as "Isaac's Take"). Please provide one paragraph for each.
                Please keep the entire summary under 1000 characters (spaces included).`
            },
            {
                role: 'user',
                content: text,
            },
        ],
    });

    return response.choices[0].message.content;
}

// Get the latest email in the inbox
async function getLatestEmail(auth) {
    const gmail = google.gmail({ version: 'v1', auth });
    const res = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 1,
    });

    const message = res.data.messages[0];
    const fullMessage = await gmail.users.messages.get({
        userId: 'me',
        id: message.id
    });

    const payload = fullMessage.data.payload;
    let body;

    if (payload.body?.data) {
        body = Buffer.from(payload.body.data, 'base64').toString('utf8');
    } else if (payload.parts) {
        body = getBody(payload.parts);
    }

    if (!body) {
        console.log('No message body found');
        return
    }

    const cleanText = htmlToText(body, {
        wordwrap: 130,
        ignoreImage: true,
        preserveNewlines: true,
    });

    // console.log('___Email Body____\n');
    // console.log(cleanText.slice(0, 2000));

    // console.log('Summarized:\n');
    // const summary = await summarizeNewsLetter(cleanText);
    // console.log(summary);

    return cleanText;
}

export default async function fetchAndSummarize() {
    const auth = await authorize();
    const cleanText = await getLatestEmail(auth);
    const summary = await summarizeNewsLetter(cleanText);
    return summary;
}