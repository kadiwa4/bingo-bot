/// <reference path="../types.d.ts" />

import { HelpCategory } from "../enums.js";
import Command from "../Command.js";
import CommandModule from "../CommandModule.js";
import Game from "../Game.js";
import { assert, bind, invertObject, log, noop } from "../misc.js";

import EventEmitter from "events";
import fs from "fs";

import BetterSqlite3 from "better-sqlite3";
import Discord, { Guild } from "discord.js";

Object.assign(Guild.prototype, EventEmitter.prototype);

/**
 * Initializes the guild
 * @param {GuildInput} guildInput
 */
Guild.prototype.init = async function(guildInput) {
    const { client } = this;

    assert(/^(.?\W)?$/.test(guildInput.commandPrefix), `invalid command prefix '${guildInput.commandPrefix}'`, this);

    EventEmitter.call(this);

    this.roles.fetch();
    const roleCache = this.roles.cache;

    Object.assign(this, {
        srName: guildInput.name,
        abbreviation: guildInput.abbreviation,
        commandPrefix: guildInput.commandPrefix,
        moduleIDs: new Set(),
        dataFolder: `./data/${guildInput.abbreviation}`,

        helpStrings: Object.create(null),
        helpMessages: [],
        modRoles: guildInput.modRoleIDs.map(bind(roleCache, "get")),

        sqlite: {}
    });

    // load command modules
    const moduleIDs = [ "meta" ];
    moduleIDs.push(...guildInput.moduleIDs);
    for (let moduleID of moduleIDs) {
        // wait so that loadedModules gets updated in time
        await this.loadModule(guildInput, moduleID);
    }

    // create/set up guild config
    this.config = guildInput.config.withPrototypeRecursive(client.config);

    fs.mkdirSync(this.dataFolder, { recursive: true });

    this.database = new BetterSqlite3(`${this.dataFolder}/race.sqlite`);
    client.databases.push(this.database);

    // init command modules
    for (let moduleID of this.moduleIDs) {
        client.modules[moduleID].init(this, guildInput);
    }

    let message = "";
    const add = function(toAdd) {
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
    log(`initialized guild`, this);

    invertObject(client.cleanUpGuildName(this.srName), guildInput.aliases, client.srGuilds, this);
};

/**
 * Gets the game that matches the input the closest
 * @param {string} input
 * @returns {?Game}
 */
Guild.prototype.getGame = function(input) {
    return this.games[this.cleanUpGameName(input)] ?? null;
}

/**
 * Gets the name of a user, even if they aren't a member anymore
 * @param {string} id
 * @returns {Promise<string>}
 */
Guild.prototype.getUserName = async function(id) {
    const member = await this.members.fetch(id).catch(noop);
    if (member) {
        return member.cleanName;
    }

    const user = await this.client.users.fetch(id).catch(noop);
    return Discord.Util.escapeMarkdown(user.username);
};

/**
 * Loads a module and all of its dependencies recursively
 * @param {GuildInput} guildInput The guild input from src/guild_configs/
 * @param {string} moduleID The ID of the module to load
 */
Guild.prototype.loadModule = async function(guildInput, moduleID) {
    if (this.moduleIDs.has(moduleID)) {
        return;
    }

    /** @type {NodeJS.Dict<CommandModule>} */
    const clientModules = this.client.modules;

    /** @type {CommandModule} */
    let module;
    if (clientModules[moduleID]) {
        module = clientModules[moduleInput.id];
    } else {
        /** @type {CommandModule} */
        let moduleInput = await import(`../command_modules/${moduleID}.js`);
        if (Object.keys(moduleInput).length === 1 && moduleInput.default) {
            moduleInput = moduleInput.default;
        }

        assert(moduleInput.id, `couldn't load module ${moduleID} or it doesn't have the property 'id'`, this);
        module = clientModules[moduleInput.id] = new CommandModule(this.client, moduleInput);
    }

    this.moduleIDs.add(module.id);
    await module.loadDependencies(guildInput, this);
    for (let commandID in module.commands) {
        const command = new Command(module, commandID);
        const example = guildInput.commandExamples[commandID];
        if (example) {
            if (!command.examples) {
                command.examples = Object.create(null);
            }

            command.examples[this.id] = example;
        }

        for (let name of command.allNames) {
            this.client.commands[name] = command;
        }

        if (command.names) {
            if (!this.helpStrings[command.category]) {
                this.helpStrings[command.category] = [];
            }

            this.helpStrings[command.category].push(`${command.getUsage(this)} – ${command.description}${command.getExample(this) ?? ""}.\n`);
        }
    }
};
