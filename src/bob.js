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
	return nodeStdoutWrite.apply(process.stdout, arguments);
};

const nodeStderrWrite = process.stderr.write;
process.stderr.write = function stderrWrite() {
	logFile.write(...arguments);
	return nodeStderrWrite.apply(process.stderr, arguments);
};

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
	fs.writeFileSync(DISCORD_AUTH, `${JSON.stringify({ token: TOKEN_HERE }, null, "\t")}\n`);
	discordAuthRequired();
}

/** @type {string} */
const discordAuthToken = JSON.parse(fs.readFileSync(DISCORD_AUTH, "utf-8")).token;
if (discordAuthToken === TOKEN_HERE || discordAuthToken.length === 0) {
	discordAuthRequired();
}

// initialize client
const client = new Discord.Client({
	allowedMentions: {
		parse: [ "roles", "users" ],
	},
	intents: [ "DirectMessages", "GuildMembers", "GuildMessages", "Guilds", "MessageContent" ],
});

client.databases = [];
await client.login(discordAuthToken);
log("connected to discord");

// event handlers

// new incoming Discord message
client.on("messageCreate", function onMessage(message) {
	if (!message.author.bot && (
		!message.guild
		|| (message.content.startsWith(message.guild.commandPrefix) && message.guild.srName)
	)) {
		client.useCommand(message, message.member ?? message.author);
	}
});

// guild member left or was kicked/banned
client.on("guildMemberRemove", function onMemberRemove(member) {
	if (member.team) {
		/** @type {{ race: Race; }} */
		const { race } = member.team;
		race.channel.send(race.removeEntrant(member));
	}
});

// unhandled promise rejection
process.on("unhandledRejection", function onUnhandledRejection(error) {
	logError(`unhandled promise rejection: ${error?.stack ?? error}`);

	client.user?.setStatus("invisible");

	process.exit(1);
});

// process exit
process.on("exit", function onExit() {
	if (client.databases) {
		for (let database of client.databases) {
			database.close();
		}
	}

	log("exited");
});

// uncaught JS exception
process.on("uncaughtException", function onUncaughtException(error) {
	logError(`uncaught error: ${error?.stack ?? error}`);

	client.user?.setStatus("invisible");

	process.exit(1);
});

// keyboard interrupt
process.on("SIGINT", function onKeyboardInterrupt() {
	log("keyboard interrupt");

	client.user?.setStatus("invisible");

	process.exit(0);
});

client.commands = newMap();
client.config = {};
client.modules = newMap();
client.srGuilds = newMap();

const { owner } = await client.application.fetch();
if (owner instanceof Discord.User) {
	client.owner = owner;
} else {
	client.owner = owner.owner.user;
}

await client.owner.createDM();

// load all guild configs in `src/guild_configs`
for (let file of fs.readdirSync("./src/guild_configs")) {
	if (file.toLowerCase().includes("ignore")) {
		continue;
	}

	if (!file.toLowerCase().endsWith(".js")) {
		throw new Error(`'src/guild_configs/${file}' is not a JavaScript file`);
	}

	/** @type {GuildInput | { default: GuildInput; }} */
	let guildInputImport = await import(`./guild_configs/${file}`);
	if (Object.keys(guildInputImport).length === 1 && "default" in guildInputImport) {
		guildInputImport = guildInputImport.default;
	}

	/** @type {GuildInput} */
	const guildInput = guildInputImport;

	if (!("id" in guildInput)) {
		throw new Error(`'src/guild_configs/${file}' doesn't have the property 'id'`);
	}

	const guild = await client.guilds.fetch(guildInput.id);

	try {
		await guild.init(guildInput);
	} catch (error) {
		throw new Error(`error while setting up guild ${guildInput.abbreviation}:\n${error?.stack ?? error}`);
	}
}

log("ready");
