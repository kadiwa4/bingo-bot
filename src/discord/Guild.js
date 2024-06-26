/// <reference path="../types.d.ts" />

import { HelpCategory } from "../enums.js";
import Command from "../Command.js";
import CommandModule from "../CommandModule.js";
import { addUserNames, bind, getUserID, invertObject, log, newMap, noop } from "../misc.js";

import EventEmitter from "node:events";
import fs from "node:fs";

import BetterSqlite3 from "better-sqlite3";
import Discord, { Guild } from "discord.js";

// make EventEmitter functions available on guild objects
Object.assign(Guild.prototype, EventEmitter.prototype);

/** Initializes the guild */
Guild.prototype.init = async function (guildInput) {
	const { client } = this;

	if (!/^(.?\W)?$/.test(guildInput.commandPrefix)) {
		throw new Error(`bad command prefix '${guildInput.commandPrefix}'`);
	}

	EventEmitter.call(this);

	await this.roles.fetch();
	const roleCache = this.roles.cache;

	this.srName = guildInput.name;
	this.abbreviation = guildInput.abbreviation;
	this.commandPrefix = guildInput.commandPrefix;
	this.moduleIDs = new Set();
	this.dataFolder = `./data/${guildInput.abbreviation}`;

	this.helpStrings = newMap();
	this.helpMessages = [];
	this.modRoles = guildInput.modRoleIDs.map(bind(roleCache, "get"));

	// guild command
	const guildCommandName = guildInput.guildCommand;
	const guildCommand = new Command(null, guildCommandName);
	guildCommand.guildCommandGuild = this;
	const conflictingCommand = client.commands[guildCommandName];
	if (conflictingCommand) {
		throw new Error(`multiple commands named '${guildCommandName}':\n1: ${conflictingCommand.id} from module ${module.id}\n2: guild command of ${this.abbreviation}`);
	}

	client.commands[guildCommandName] = guildCommand;

	// load command modules
	const moduleIDs = [ "meta" ];
	moduleIDs.push(...guildInput.moduleIDs);

	for (let moduleID of moduleIDs) {
		// wait so that this.moduleIDs gets updated in time
		await this.loadModule(guildInput, moduleID);
	}

	// create/set up guild config
	this.config = guildInput.config.withPrototypeRecursive(client.config);

	fs.mkdirSync(this.dataFolder, { recursive: true });

	const database = this.database = new BetterSqlite3(`${this.dataFolder}/db.sqlite`);
	client.databases.push(database);

	// name holds the username, nickname holds the nickname or global name
	database.createTable(
		"user_names",
		`user_id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		nickname TEXT`
	);

	this.sqlite = {
		getUserNames: database.prepare("SELECT name, nickname FROM user_names WHERE user_id = ?;"),
		getUserIDFromName: database.prepare("SELECT user_id FROM user_names WHERE name = ? COLLATE NOCASE;").pluck(),
		addUserNames: database.prepare("INSERT OR REPLACE INTO user_names (user_id, name, nickname) VALUES (@user_id, @name, @nickname);"),
	};

	// init command modules
	for (let moduleID of this.moduleIDs) {
		client.modules[moduleID].init(this, guildInput);
	}

	let message = `In DMs, start your message with \`${guildCommandName}\` to use this server's commands.\n`;
	const add = function add(toAdd) {
		if (message.length + toAdd.length > 2000) {
			this.helpMessages.push(message);
			message = "";
		}

		message += toAdd;
	}.bind(this);

	for (let categoryKey in HelpCategory) {
		const category = HelpCategory[categoryKey];
		const commandStrings = this.helpStrings[category];
		if (!commandStrings) {
			continue;
		}

		add(`\n**${category}**\n${commandStrings.shift()}`);
		for (let commandString of commandStrings) {
			add(commandString);
		}
	}

	this.helpMessages.push(message);
	delete this.helpStrings;
	log("initialized guild", this);

	invertObject(
		client.cleanUpGuildName(this.srName),
		guildInput.aliases,
		client.srGuilds,
		this,
	);
};

/** Gets the game that matches the input the closest */
Guild.prototype.getGame = function (input) {
	return this.games[this.cleanUpGameName(input.trim())] ?? null;
};

/** Gets the guild member that matches the input the closest */
Guild.prototype.getUserID = function (input) {
	const { sqlite } = this;
	input = input.trim();

	return getUserID(input) ?? sqlite.getUserIDFromName.get(input) ?? null;
};

/** Gets the name of a user, even if they aren't a member anymore */
Guild.prototype.getUserName = async function (id) {
	let member = this.members.cache.get(id);
	if (member) {
		return member.cleanName;
	}

	const cache = this.sqlite.getUserNames.get(id);
	if (cache) {
		return cache.nickname ?? cache.name;
	}

	member = await this.members.fetch(id).catch(noop);
	if (member) {
		addUserNames(member);
		return member.cleanName;
	}

	const user = await this.client.users.fetch(id).catch(noop);
	return user ? Discord.escapeMarkdown(user.username) : null;
};

/**
 * Loads a module and all of its dependencies recursively
 * @param {GuildInput} guildInput The guild input from src/guild_configs/
 * @param {string} moduleID The ID of the module to load
 */
Guild.prototype.loadModule = async function (guildInput, moduleID) {
	if (this.moduleIDs.has(moduleID)) {
		return;
	}

	const { client } = this;

	/** @type {CommandModule} */
	let module;
	const constructModule = !client.modules[moduleID];
	if (constructModule) {
		/** @type {CommandModule | { default: CommandModule; }} */
		let moduleInputImport = await import(`../command_modules/${moduleID}.js`);
		if (Object.keys(moduleInputImport).length === 1 && "default" in moduleInputImport) {
			moduleInputImport = moduleInputImport.default;
		}

		/** @type {CommandModule} */
		const moduleInput = moduleInputImport;

		if (!moduleInput.id) {
			throw new Error(`couldn't load module ${moduleID} or it doesn't have the property 'id'`);
		}

		module = client.modules[moduleInput.id] = new CommandModule(client, moduleInput);
	} else {
		module = client.modules[moduleID];
	}

	this.moduleIDs.add(module.id);
	for (let commandID in module.commands) {
		/** @type {Command} */
		let command;

		if (constructModule) {
			command = module.commands[commandID] = new Command(module, commandID);
			invertObject(null, command.allNames, client.commands, command);
		} else {
			command = module.commands[commandID];
		}

		const example = guildInput.commandExamples?.[commandID];
		if (example) {
			if (!command.examples) {
				command.examples = newMap();
			}

			command.examples[this.id] = example;
		}

		if (command.names) {
			if (!(command.category in this.helpStrings)) {
				this.helpStrings[command.category] = [];
			}

			this.helpStrings[command.category].push(`${command.getUsage(this)} – ${command.description}${command.getExample(this) ?? ""}.\n`);
		}
	}

	await module.loadDependencies(guildInput, this);
};
