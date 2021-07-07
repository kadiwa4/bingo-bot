import Command from "../Command.js";
import { HelpCategory } from "../enums.js";
import { getUserID, noop, WHITESPACE_PLUS } from "../misc.js";

import Discord from "discord.js";

export const id = "meta";

/** @type {NodeJS.Dict<Command>} */
export const commands = {
	metaHelp: {
		names: [ "help" ],
		aliases: [ "commands", "tutorial" ],
		usage: "[<command name>]",
		description: "Shows a list of commands or details on one command",
		/** @param {Discord.GuildMember} member */
		onUse: function metaHelp(onError, message, member, args) {
			const { client, guild } = member;

			if (!args) {
				const iterator = guild.helpMessages.values();
				message.inlineReply(iterator.next().value);
				for (let helpMessage of iterator) {
					message.channel.send(helpMessage);
				}

				return;
			}

			const inputMatch = args.match(/^(.?\W)?[\s\uFFEF\xA0\W]*(\w+)$/);
			if (!inputMatch) {
				this.showUsage(...arguments);
				return;
			}

			/** @type {Command} */
			const command = client.commands[inputMatch[2].toLowerCase()];
			if (!command || (guild && !guild.moduleIDs.has(command.module.id))) {
				message.inlineReply("Command not found.");
				return;
			}

			message.inlineReply(command.getHelp(guild));
		},
	},
	metaAs: {
		names: [ "as" ],
		description: "Calls a command as the specified user",
		usage: "<@user or ID> <command>",
		category: HelpCategory.MOD,
		modOnly: true,
		/** @param {Discord.GuildMember} member */
		onUse: async function metaAs(onError, message, member, args) {
			const { client, guild } = member;

			const splitArgs = args?.split?.(WHITESPACE_PLUS) ?? "";
			if (splitArgs.length < 2) {
				this.showUsage(...arguments);
				return;
			}

			const userInput = splitArgs[0];
			const id = getUserID(userInput);
			if (!id) {
				this.showUsage(...arguments);
				return;
			}

			const mentionedMember = await guild.members.fetch(id).catch(noop);
			if (!mentionedMember) {
				message.inlineReply("Server member not found.");
				return;
			}

			const commandInput = args.slice(userInput.length).trim()
			if (!await client.useCommand(message, mentionedMember, commandInput)) {
				message.inlineReply("Command not found.");
			}
		},
	},
};
