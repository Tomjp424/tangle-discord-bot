import fs from "fs";
import path from "path";
import readlineSync from "readline-sync";
import { google } from "googleapis";
import { htmlToText } from "html-to-text";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

async function loadSavedCredentials() {
    try {
        const content = fs.readFileSync(TOKEN_PATH, "utf8");
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch {
        return null;
    }
}

async function saveCredentials(client) {
    const content = fs.readFileSync(CREDENTIALS_PATH, "utf8");
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });
    fs.writeFileSync(TOKEN_PATH, payload);
}

async function authorize() {
    let client = await loadSavedCredentials();
    if (client) return client;

    const content = fs.readFileSync(CREDENTIALS_PATH, "utf8");
    const keys = JSON.parse(content);
    const { client_secret, client_id, redirect_uris } = keys.installed;
    const OAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    const authURL = OAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize by visiting here:', authURL);
    const code = readlineSync.question('Please enter provided code:');
    const { tokens } = await OAuth2Client.getToken(code);
    OAuth2Client.setCredentials(tokens);
    await saveCredentials(OAuth2Client);
    return OAuth2Client;
}

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

    console.log('___Email Body____\n');
    console.log(cleanText.slice(0, 2000));
}

authorize().then(getLatestEmail).catch(console.error);