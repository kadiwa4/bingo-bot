import Command from "../Command.js";
import { HelpCategory } from "../enums.js";
import { getUserID, noop, spacesAroundMentions, WHITESPACE_PLUS } from "../misc.js";

import Discord from "discord.js";

export const id = "meta";

/** @type {NodeJS.Dict<Command>} */
export const commands = {
    metaHelp: {
        names: [ "help" ],
        aliases: [ "commands", "tutorial" ],
        usage: "[<command name>]",
        description: "Shows a list of commands or details on one command",
        onUse: function metaHelp(onError, message, member, args) {
            /** @type {Discord.TextChannel} */
            const { client, guild } = message.channel;

            if (!args) {
                const iterator = guild.helpMessages.values();
                message.inlineReply(iterator.next().value);
                for (let helpMessage of iterator) {
                    message.channel.send(helpMessage);
                }

                return;
            }

            const inputMatch = args.match(RegExp(`^(.?\\W)?[\\s\\uFFEF\\xA0\\W]*(\\w+)$`));
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
        }
    },
    metaAs: {
        names: [ "as" ],
        description: "Calls a command as the specified user",
        usage: "<@member or ID> <command>",
        category: HelpCategory.MOD,
        modOnly: true,
        onUse: async function metaAs(onError, message, member, args) {
            /** @type {Discord.GuildMember} */
            const { client, guild } = member;
            args = spacesAroundMentions(args ?? "");

            const splitArgs = args.split(WHITESPACE_PLUS);
            if (splitArgs.length < 2) {
                this.showUsage(...arguments);
                return;
            }

            const userInput = splitArgs[0]
            const id = getUserID(userInput);
            if (!id) {
                this.showUsage(...arguments);
                return;
            }

            member = await guild.members.fetch(id).catch(noop);
            if (!member) {
                message.inlineReply("Server member not found.");
                return;
            }

            if (!await client.useCommand(message, member, args.slice(userInput.length).trim())) {
                message.inlineReply("Command not found.");
            }
        }
    },
    metaB: {
        aliases: [ "b" ], // TODO remove this
        modOnly: true,
        onUse: function metaB(onError, message, member, args) {
            member.client.commands.as.onUse(onError, message, member, `667788080215883786 ${args}`).catch(onError);
        }
    },
    metaJ: {
        aliases: [ "j" ], // TODO remove this
        modOnly: true,
        onUse: function metaJ(onError, message, member, args) {
            member.client.commands.as.onUse(onError, message, member, `81612266826379264 ${args}`).catch(onError);
        }
    }
};
