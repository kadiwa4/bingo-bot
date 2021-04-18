/// <reference path="./types.d.ts" />

import fs from "fs";
import path from "path";
import url from "url";

// change current working dir to repo root
process.chdir(path.dirname(path.dirname(url.fileURLToPath(import.meta.url))));

// setup log file and stdout/stderr
fs.mkdirSync("./logs", { recursive: true });
const logFile = fs.createWriteStream(`./logs/${new Date().toISOString().replace(/[:.]/g, "_")}.log`);

const nodeStdoutWrite = process.stdout.write;
process.stdout.write = function stdoutWrite() {
    logFile.write(...arguments);
    nodeStdoutWrite.call(process.stdout, ...arguments);
}

const nodeStderrWrite = process.stderr.write;
process.stderr.write = function stderrWrite() {
    logFile.write(...arguments);
    nodeStderrWrite.call(process.stderr, ...arguments);
}

import "./discord/Client.js";
import "./discord/Guild.js";
import "./discord/GuildMember.js";
import "./discord/Message.js";
import "./discord/User.js";

import { log, logError, newMap, noop } from "./misc.js";
import Race from "./Race.js";

import Discord from "discord.js";

log("started");

const DISCORD_AUTH = "./discord_auth.json";
const TOKEN_HERE = "discord auth token here";

// check Node.js version
if (parseInt(process.versions.modules) < 83) {
    logError("upgrade your node.js https://nodejs.org/en/");
    process.exit(1);
}

// check for discord auth token

/** @returns {never} */
function discordAuthRequired() {
    logError("enter your bot's discord auth token in 'discord_auth.json'");
    process.exit(1);
}

if (!fs.existsSync(DISCORD_AUTH)) {
    fs.writeFileSync(DISCORD_AUTH, `${JSON.stringify({ token: TOKEN_HERE }, null, 2)}\n`);
    discordAuthRequired();
}

/** @type {string} */
const discordAuthToken = JSON.parse(fs.readFileSync(DISCORD_AUTH)).token;
if (discordAuthToken === TOKEN_HERE || discordAuthToken.length === 0) {
    discordAuthRequired();
}

// initialize client
const client = new Discord.Client({
    disableMentions: "everyone",
    messageEditHistoryMaxSize: 0,
    ws: { intents: [ "DIRECT_MESSAGES", "GUILD_MEMBERS", "GUILD_MESSAGES", "GUILDS" ] }
});

client.databases = [];
await client.login(discordAuthToken);
log("connected to discord");

// event handlers

const { Events } = Discord.Constants;

// new incoming Discord message
client.on(Events.MESSAGE_CREATE, function onMessage(message) {
    if (!message.author.bot && (!message.guild || message.content.startsWith(message.guild.commandPrefix))) {
        client.useCommand(message, message.member ?? message.author);
    }
});

// guild member left or was kicked/banned
client.on(Events.GUILD_MEMBER_REMOVE, function onMemberRemove(member) {
    if (member.team) {
        /** @type {{ race: Race; }} */
        const { race } = member.team;
        race.channel.send(race.removeEntrant(member));
    }
});

// unhandled promise rejection
process.on("unhandledRejection", async function onUnhandledRejection(error) {
    logError(`unhandled promise rejection: ${error?.stack ?? error}`);

    await client.user.setStatus("invisible").catch(noop);

    process.exit(1);
});

// process exit
process.on("exit", function onExit() {
    for (let database of client.databases) {
        database.close();
    }

    log("exited");
});

// uncaught JS exception
process.on("uncaughtException", async function onUncaughtException(error) {
    logError(`uncaught error: ${error?.stack ?? error}`);

    await client.user.setStatus("invisible").catch(noop);

    process.exit(1);
});

// keyboard interrupt
process.on("SIGINT", async function onKeyboardInterrupt() {
    log("keyboard interrupt")

    await client.user.setStatus("invisible");

    process.exit(0);
});

client.application = await client.fetchApplication();
client.srGuilds = newMap();
client.modules = newMap();
client.commands = newMap();
client.config = {};

client.owner = client.application.owner;
if (client.owner instanceof Discord.Team) {
    client.owner = client.owner.owner.user;
}

client.owner.createDM();

// load all guild configs in `src/guild_configs`
for (let file of fs.readdirSync("./src/guild_configs")) {
    if (file.toLowerCase().includes("ignore")) {
        continue;
    }

    if (!file.toLowerCase().endsWith(".js")) {
        throw new Error(`'src/guild_configs/${file}' is not a JavaScript file`);
    }

    /** @type {GuildInput} */
    let guildInput = await import(`./guild_configs/${file}`);
    if (Object.keys(guildInput).length === 1 && guildInput.default) {
        guildInput = guildInput.default;
    }

    if (!guildInput.id) {
        throw new Error(`'src/guild_configs/${file}' doesn't have the property 'id'`);
    }

    const guild = await client.guilds.fetch(guildInput.id);

    try {
        await guild.init(guildInput);
    } catch (error) {
        throw new Error(`error while setting up guild ${guildInput.id}:\n${error?.stack ?? error}`);
    }
}

log("ready");
