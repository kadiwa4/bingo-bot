/// <reference path="../types.d.ts" />

import Command from "../Command.js";
import EntrantTeam from "../EntrantTeam.js";
import { HelpCategory, RaceState } from "../enums.js";
import { clean, noop, WHITESPACE_PLUS } from "../misc.js";

import Discord from "discord.js";

export const id = "race_coop";
export const dependencyIDs = [ "race_control" ];

/** @type {NodeJS.Dict<Command>} */
export const commands = {
	raceTeam: {
		names: [ "team" ],
		description: "Moves the slash-separated entrants into your team",
		usage: "<entrant 1> [/ <entrant 2>…]",
		category: HelpCategory.COOP_RACE,
		raceChannelOnly: true,
		/** @param {Discord.GuildMember} member */
		onUse: async function raceTeam(onError, message, member, args) {
			/** @type {Discord.TextChannel} */
			const { guild, race } = message.channel;

			if (!race.hasEntrant(member) || race.state !== RaceState.JOINING) {
				// user isn't racing here / race state isn't JOINING
				return;
			}

			if (!args) {
				this.showUsage(...arguments);
				return;
			}

			const { team } = member;
			const { maxTeamSize } = race.game.config.race;
			const newTeamMembers = [];
			const teamMembers = new Set(team);

			// split args at slashes
			const splitArgs = args.split("/");

			for (let index = 0; index < splitArgs.length; index += 1) {
				const arg = splitArgs[index].trim();

				const id = guild.getUserID(arg);
				if (!id) {
					message.inlineReply(`User “${clean(arg, message)}” not found.`, { split: true });
					return;
				}

				const mentionedMember = await guild.members.fetch(id).catch(noop);
				if (!mentionedMember) {
					message.inlineReply("Server member not found.");
					return;
				}

				if (!race.hasEntrant(mentionedMember)) {
					message.inlineReply(`${mentionedMember.cleanName} isn't racing here.`);
					return;
				}

				if (mentionedMember === member) {
					message.inlineReply("You can't team with yourself!");
					return;
				}

				/** @type {EntrantTeam} */
				const mentionedTeam = mentionedMember.team;
				if (mentionedTeam === team) {
					message.inlineReply(`${mentionedMember.cleanName} is already in your team.`);
					return;
				}

				if (teamMembers.has(mentionedMember)) {
					message.inlineReply(`You listed ${mentionedMember.cleanName} more than once.`);
					return;
				}

				newTeamMembers.push(mentionedMember);
				teamMembers.add(mentionedMember);

				if (teamMembers.size > maxTeamSize) {
					message.inlineReply(`That would exceed the maximum team size of ${maxTeamSize}. Use \`${guild.commandPrefix}unteam\` first to part with your team.`);
					return;
				}
			}

			// apply changes
			for (let entrant of newTeamMembers) {
				team.affiliateEntrant(entrant);
			}

			race.checkCategoryCoop();

			const members = team.map((member) => `${member.readyEmote} ${member.cleanName}`)
				.join("\n  ");
			message.inlineReply(`${team}'s members were updated to:\n  ${members}${race.checkNotCountingDown()}`, { split: true });
		},
	},
	raceTeamname: {
		names: [ "teamname" ],
		description: "Changes/resets your team's name",
		usage: "[<team name>]",
		category: HelpCategory.COOP_RACE,
		raceChannelOnly: true,
		/** @param {Discord.GuildMember} member */
		onUse: function raceTeamname(onError, message, member, args) {
			/** @type {Discord.TextChannel} */
			const { race } = message.channel;
			const { team } = member;

			if (!race.hasEntrant(member) || race.state !== RaceState.JOINING) {
				// user isn't racing here / race state isn't JOINING
				return;
			}

			if (!team.isCoop) {
				message.inlineReply("You can't choose a team name if you don't have any teammates.");
				return;
			}

			// get rid of multiple consecutive whitespace characters (including line feeds) and clean up
			const teamName = clean(args?.replace(WHITESPACE_PLUS, " ") ?? "", message);
			if (!teamName) {
				team.teamName = null;
				message.acknowledge(member);
				return;
			}

			if (team.teamName === teamName) {
				message.inlineReply(`Your team name is already “**${teamName}**”.`);
				return;
			}

			if (race.teams.some((team2) => teamName === team2.teamName)) {
				message.inlineReply(`The team name “**${teamName}**” is already being used.`);
				return;
			}

			// discord nicknames have the same limitation of 32 characters
			if (teamName.length > 32) {
				message.inlineReply("Must be 32 or fewer in length.");
				return;
			}

			team.teamName = teamName;
			message.acknowledge(member);
		},
	},
	raceUnteam: {
		names: [ "unteam" ],
		aliases: [ "part", "partteam", "leaveteam" ],
		description: "Leaves your current team",
		category: HelpCategory.COOP_RACE,
		raceChannelOnly: true,
		/** @param {Discord.GuildMember} member */
		onUse: function raceUnteam(onError, message, member) {
			/** @type {Discord.TextChannel} */
			const { race } = message.channel;
			const { team } = member;

			if (!race.hasEntrant(member) || race.state !== RaceState.JOINING) {
				// user isn't racing here / race state isn't JOINING
				return;
			}

			if (!team.isCoop) {
				message.inlineReply("You don't have a team to part with.");
				return;
			}

			// create a new team and move the user there
			team.remove(member);
			race.teams.push(new EntrantTeam(race, member));
			race.checkCategoryCoop();
			message.acknowledge(member);
		},
	},
	raceUnteamall: {
		names: [ "unteamall" ],
		aliases: [ "partall", "disbandall" ],
		description: "Disbands all current teams",
		category: HelpCategory.COOP_RACE,
		raceChannelOnly: true,
		/** @param {Discord.GuildMember} member */
		onUse: function raceUnteamall(onError, message, member) {
			/** @type {Discord.TextChannel} */
			const { race } = message.channel;

			if (
				!race.hasEntrant(member)
				|| race.state !== RaceState.JOINING
				|| !race.hasCoopTeam
			) {
				// user isn't racing here / race state isn't JOINING / there are only solo teams in the race
				return;
			}

			race.teams = race.entrants.map((entrant) => new EntrantTeam(race, entrant));
			race.category = race.category.forCoop(false);
			message.acknowledge(member);
		},
	},
	raceRandomteams: {
		names: [ "randomteams" ],
		description: "Randomly assigns entrants to teams of the given size (default is 2)",
		usage: "[<team size>]",
		category: HelpCategory.COOP_RACE,
		raceChannelOnly: true,
		/** @param {Discord.GuildMember} member */
		onUse: function raceRandomteams(onError, message, member, args) {
			/** @type {Discord.TextChannel} */
			const { race } = message.channel;

			if (!race.hasEntrant(member) || race.state !== RaceState.JOINING) {
				// user isn't racing here / race state isn't JOINING
				return;
			}

			let teamSize = 2;
			if (args) {
				teamSize = parseInt(args);
				if (Number.isNaN(teamSize) || teamSize <= 0) {
					this.showUsage(...arguments);
					return;
				}
			}

			const { entrants } = race;
			entrants.shuffle();

			/** @type {EntrantTeam} */
			let currentTeam;
			race.teams = [];
			let index = 0;
			for (let entrant of entrants) {
				// if index is divisible by team size, make new team
				if (index % teamSize === 0) {
					currentTeam = new EntrantTeam(race);
					race.teams.push(currentTeam);
				}

				currentTeam.push(entrant);
				index += 1;
			}

			race.checkCategoryCoop();
			race.showJoiningEntrants(onError, message, `**${race}:**\n`, `**${race.gameCategoryLevel} race (cont):**\n`);
		},
	},
};
