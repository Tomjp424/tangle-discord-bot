import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";

import fetchAndSummarize from "./index.js";

dotenv.config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.content === '!news') {
        const summary = await fetchAndSummarize();
        const channel = client.channels.cache.get('1412266955469226135')
        channel.send(summary);
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);