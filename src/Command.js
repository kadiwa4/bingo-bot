import CommandModule from "./CommandModule.js";
import { HelpCategory } from "./enums.js";
import { assert, FROZEN_ARRAY } from "./misc.js";

import Discord from "discord.js";

export default class Command {
    /**
     * Creates a new command object
     * @param {?CommandModule} module The command module the command belongs to
     * @param {string} id The (normally alphanumeric) command ID
     */
    constructor(module, id) {
        if (module) {
            const commandInput = module.commands[id];
            Object.assign(this, commandInput);

            assert((this.names || this.aliases.length > 0)
                && (!this.raceChannelOnly || this.guildDependent)
                && (!this.modOnly || this.guildDependent)
                && this.onUse !== Command.prototype.onUse);
        }

        /** The (normally alphanumeric) command ID */
        this.id = id;

        /** The command module where this command is from */
        this.module = module;
    }

    /**
     * Command names that should be displayed
     * @type {?string[]}
     */
    names = null;

    /**
     * A brief command description
     * @type {?string}
     */
    description = null;

    /**
     * The category where the command is shown in the command list
     * @type {string}
     * @default HelpCategory.OTHER
     */
    category = HelpCategory.OTHER;

    /**
     * Function that gets called when the command is used. Can be async
     * @param {(error) => void} onError Function that gets called to catch an error
     * @param {Discord.Message} message The message that called this function
     * @param {Discord.GuildMember | Discord.User} userOrMember The guild member/user that used the command. Always a guild member if guildDependent is true
     * @param {?string} args The user input without the command name, trimmed
     */
    onUse(onError, message, userOrMember, args) {}

    /**
     * Replies the correct command usage
     * @param {(error => void)} onError
     * @param {Discord.Message} message
     * @param {Discord.GuildMember | Discord.User} userOrMember
     */
    showUsage(onError, message, userOrMember) {
        const { guild } = userOrMember;
        message.inlineReply(`Usage: ${this.getUsage(guild)}${this.getExample(guild) ?? ""}`);
    }

    /**
     * All command names that can be used to call this command
     * @type {string[]}
     * @readonly
     */
    get allNames() {
        if (!this.names) {
            return this.aliases;
        }

        return this.names.concat(this.aliases);
    }

    /**
     * Returns the command names in markdown inline-code blocks
     * (without the outer backticks), separated by slashes
     * @param {Discord.Guild} [guild]
     * @returns {?string}
     */
    getDisplayNames(guild) {
        if (!this.names && this.fakeNames.length === 0) {
            return null;
        }

        /** @type {string} */
        const prefix = guild?.commandPrefix ?? "";
        return `${prefix}${this.names.concat(this.fakeNames).join(`\`/\`${prefix}`)}`;
    }

    /**
     * Returns the full command usage.
     * Params: `<param name>`
     * Optional params: `[<param name>]`
     * @param {Discord.Guild} [guild]
     * @returns {?string}
     */
    getUsage(guild) {
        return this.names ? `\`${this.getDisplayNames(guild)}${this.usage ? ` ${this.usage}` : ""}\`` : null;
    }

    /**
     * Returns an example usage
     * @param {Discord.Guild} [guild]
     * @returns {?string}
     */
    getExample(guild) {
        if ((!this.names && this.fakeNames.length === 0) || (!this.example && (!guild || !this.examples))) {
            return null;
        }

        let example = this.example;
        if (!example) {
            example = this.examples[guild.id];
            if (!example) {
                return null;
            }
        }

        return ` (e.g. \`${guild?.commandPrefix ?? ""}${example}\`)`;
    }

    /**
     * Returns the first alias
     * @param {Discord.Guild} guild
     */
    getFirstAlias(guild) {
        return `\`${guild?.commandPrefix ?? ""}${this.aliases[0]}\``;
    }

    /**
     * Returns the help string
     * @param {Discord.Guild} [guild]
     */
    getHelp(guild) {
        return `${this.getUsage(guild) ?? this.getFirstAlias(guild)}\n${this.description}${this.getExample(guild) ?? ""}`;
    }

    /**
     * Returns the command names in markdown inline-code blocks
     * (including the outer backticks), separated by slashes,
     * or the first alias in inline-code if no name exists
     * @param {Discord.Guild} [guild]
     */
    toString(guild) {
        return this.names ? `\`${this.getDisplayNames(guild)}\`` : this.getFirstAlias(guild);
    }
};

/**
 * Other command names that aren't displayed
 * @type {string[]}
 * @default [] // (frozen)
 */
Command.prototype.aliases = FROZEN_ARRAY;

/**
 * Other command names that are displayed but don't actually work
 * @type {string[]}
 * @default [] // (frozen)
 */
Command.prototype.fakeNames = FROZEN_ARRAY;

/**
 * The command usage without the command names.
 * Params: `<param name>`
 * Optional params: `[<param name>]`
 * @type {?string}
 */
Command.prototype.usage = null;

/**
 * Default example usage of the command including the command name
 * @type {?string}
 */
Command.prototype.example = null;

/**
 * Example usages of the command including the command name, mapped by guild ID
 * @type {?NodeJS.Dict<string>}
 */
Command.prototype.examples = null;

/**
 * If this is a guild command, the guild, otherwise null
 * @type {?Discord.Guild}
 */
Command.prototype.guildCommand = null;

/**
 * Whether or not the command needs to know which guild it is called in.
 * If false, `modOnly` has to be false
 * @type {boolean}
 * @default true
 */
Command.prototype.guildDependent = true;

/**
 * Whether or not the command can only be used in the race channel
 * If true, `guildDependent` has to be true
 * @type {boolean}
 * @default false
 */
Command.prototype.raceChannelOnly = false;

/**
 * Whether or not the command can only be used by members with a moderator role.
 * If true, `guildDependent` has to be true
 * @type {boolean}
 * @default false
 */
Command.prototype.modOnly = false;
