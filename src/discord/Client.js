import Command from "../Command.js";
import { addUserNames, log, logError, isMod, spacesAroundMentions, WHITESPACE } from "../misc.js";

import Discord, { Client } from "discord.js";

/**
 * Takes a user-input string and cleans it up so that it can then be used as a key in an object
 * @param {string} input
 */
Client.prototype.cleanUpGuildName = function (input) {
	return input.toLowerCase().replace(/\W/, "").replace(/speedrun(ning)?|server|guild/, "");
};

/**
 * Gets the guild that matches the input the closest or null
 * @param {string} input
 * @returns {?string}
 */
Client.prototype.getGuild = function (input) {
	return this.srGuilds[this.cleanUpGuildName(input)] ?? null;
};

const INPUT_MATCH_REGEXP = RegExp(`^(.?\\W)?[\\s\\uFFEF\\xA0\\W]*(\\w+)${WHITESPACE}*(.*)$`);

/**
 * Uses the command that was given to the function.
 * Returns whether or not the command was found
 * @param {Discord.Message} message
 * @param {Discord.User | Discord.GuildMember} userOrMember
 * @param {string} [input]
 */
Client.prototype.useCommand = async function (message, userOrMember, input) {
	function onError(error) {
		if (message.respondedError) {
			return;
		}

		const { author, channel, client, content, guild } = message;
		logError(`error while executing command '${content}' by ${author.id} (${author.tag}) in channel ${channel.id} (${channel.type === "dm" ? "DMs" : channel.name}):\n${error?.stack ?? error}`, guild);
		try {
			const ownerMessage = `An error occured (see the log for details):\n\`\`\`${error}\`\`\``;
			if (author.id === client.owner.id) {
				message.inlineReply(ownerMessage);
			} else {
				client.owner.dmChannel.send(ownerMessage);
				message.inlineReply(`An error occured (I told the bot owner):\n\`\`\`${error}\`\`\``);
			}

			message.respondedError = true;
		} catch {
			throw new Error("couldn't send error messages on discord; giving up", guild);
		}
	}

	try {
		let { guild } = userOrMember;

		if (!input) {
			input = spacesAroundMentions(message.content).trim();
		}

		const inputMatch = input.match(INPUT_MATCH_REGEXP);
		if (!inputMatch) {
			return false;
		}

		const commandName = inputMatch[2].toLowerCase();

		/** @type {Command} */
		const command = this.commands[commandName];

		if (!command) {
			return false;
		}

		if (command.guildCommandGuild) {
			let member;
			if (command.guildCommandGuild === guild) {
				member = userOrMember;
			} else {
				if (guild) {
					message.inlineReply(`\`${commandName}\` is DM-only.`);
					return true;
				}

				guild = command.guildCommandGuild;
				if (!inputMatch[3]) {
					message.inlineReply(`Usage: \`${commandName} <command>\``);
					return true;
				}

				member = await guild.members.fetch(userOrMember.id);
				if (!member) {
					message.inlineReply(`You're not a server member of ${guild.srName}.`);
					return true;
				}
			}

			if (!await this.useCommand(message, member, inputMatch[3])) {
				message.inlineReply("Command not found.");
			}

			return true;
		}

		if (guild) {
			if (!guild.moduleIDs.has(command.module.id)) {
				return false;
			}

			addUserNames(userOrMember);
		}

		if (command.raceChannelOnly && !message.channel.race) {
			message.inlineReply(`The command ${command.toString(guild)} can only be used in a race channel.`);
			return true;
		}

		if (command.guildDependent) {
			if (!guild) {
				message.inlineReply(`The command ${command} is server-dependent and your message is a DM. Use \`<server abbreviation> <command…>\` to run your command on a server.`);
				return true;
			}

			if (command.modOnly) {
				if (!isMod(message, userOrMember)) {
					message.inlineReply(`The command ${command} is only available to moderators and you're not moderating the server.`);
					return true;
				}

				// log that the command was used
				// "userOrMember" isn't used here so that the person
				// who actually sent the command is always blamed (even with the `as` command)
				log(`${message.author.id} (${message.author.tag}) wrote: '${message.content}'`, guild);
			}
		}

		await command.onUse(onError, message, userOrMember, inputMatch[3] ?? null)?.catch?.(onError);
	} catch (error) {
		onError(error);
	}

	return true;
};
