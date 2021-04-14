/// <reference path="./types.d.ts" />

import Command from "./Command.js";

import Discord from "discord.js";

export default class CommandModule {
    /**
     * Creates a new command module object
     * @param {Discord.Client} client The discord client
     * @param {CommandModule} moduleInput The command module input from src/command_modules
     */
    constructor(client, moduleInput) {
        Object.assign(this, moduleInput);

        if (this.defaultConfig) {
            Object.assign(client.config, this.defaultConfig);
            delete this.defaultConfig;
        }
    }

    /**
     * The (normally alphanumeric) command module ID
     * @type {string}
     */
    id;

    /**
     * Function that initializes the command module for a guild
     * @param {Discord.Guild} guild The guild from where this is called
     * @param {GuildInput} guildInput The object from src/guild_configs
     */
    init(guild, guildInput) {}

    /**
     * Dict with the command module's commands
     * @type {NodeJS.Dict<Command>}
     */
    commands;

    /**
     * Loads all dependency modules this command module has
     * @param {GuildInput} guildInput The guild input from src/guild_configs/
     * @param {Discord.Guild} guild The guild from where this is called
     */
    async loadDependencies(guildInput, guild) {
        if (this.dependencyIDs) {
            for (let moduleID of this.dependencyIDs) {
                await guild.loadModule(guildInput, moduleID);
            }
        }
    }

    /** Returns the command module name */
    toString() {
        return this.id;
    }
};

/**
 * Other command module names of modules which this module requires
 * @type {?string[]}
 */
CommandModule.prototype.dependencyIDs = null;

/**
 * Default config for this command module
 * @type {Config}
 */
CommandModule.prototype.defaultConfig = null;
