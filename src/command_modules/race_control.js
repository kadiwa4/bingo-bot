/// <reference path="../types.d.ts" />

import Category from "../Category.js";
import Command from "../Command.js";
import { HelpCategory, RaceState, TeamState } from "../enums.js";
import Game from "../Game.js";
import Race from "../Race.js";
import { clean, formatTime, formatTimeShort, hasProperties, invertObject, MULTI_GAME, newMap, parseTime } from "../misc.js";

import assert from "assert";

import Discord from "discord.js";

export const id = "race_control";
export const dependencyIDs = [ "race_info" ];

/** @type {Config} */
export const defaultConfig = {
	race: {
		countdownLength: 10,
		countdown: [ 3, 2, 1 ],
		maxTeamSize: 1,
		sayWhoChoosesNextIL: true,
		elo: {
			maxEloGain: 32,
			base: 10,
			dividend: 400,
			start: 1500,
			/** Returns the average Elo */
			calculateTeamElo: function defaultCalculateTeamElo(elos) {
				return elos.reduce((elo1, elo2) => elo1 + elo2) / elos.length;
			},
		},
	},
	emotes: {
		// don't use guild emotes as defaults
		acknowledge: "✅",
		elo: "😎",

		notReady: "🔸",
		ready: "✅",

		countdownStart: "",
		countdown: "",
		raceStart: "",

		firstPlace: "🥇",
		secondPlace: "🥈",
		thirdPlace: "🥉",
		done: "🏁",
		racing: "⏱",
		forfeited: "❌",
	},
};

/**
 * @param {Discord.Guild} guild
 * @param {GuildInput} guildInput
 * @see CommandModule.init
 */
export function init(guild, guildInput) {
	if (guild.config.race.maxTeamSize > 1 && !guild.moduleIDs.has("race_coop")) {
		throw new Error(`maximum team size is ${guild.config.race.maxTeamSize} but module 'race_coop' is not included`);
	}

	const { commonCategories, games, multiGame } = guildInput;

	// set up object with categories common across all games
	guild.commonCategories = newMap();
	for (let categoryName in commonCategories ?? {}) {
		const categoryInput = commonCategories[categoryName];

		invertObject(
			guild.config.cleanUpCategory(categoryName).name,
			categoryInput.aliases,
			guild.commonCategories,
			new Category(categoryName, categoryInput),
		);
	}

	guild.cleanUpGameName = guildInput.cleanUpGameName;

	// set up object with games
	guild.games = newMap();
	for (let gameName in games) {
		const gameInput = games[gameName];
		const game = new Game(guild, gameName, gameInput);
		game.categories = Object.create(guild.commonCategories);

		// set up object with games' categories
		game.setUpCategories(guild, gameInput.categories ?? {}, false);

		// set up object with games' levels
		for (let levelName in gameInput.levels) {
			const levelInput = gameInput.levels[levelName];

			if (levelInput?.default) {
				if (game.defaultLevel) {
					throw new Error(`multiple default levels of game '${gameName}'\n1: '${game.defaultLevel}'\n2: '${levelName}'`);
				}

				game.defaultLevel = levelName;
			}

			invertObject(
				game.config.cleanUpLevelName(levelName),
				levelInput?.aliases,
				game.levels,
				levelName,
			);
		}

		if (hasProperties(game.levels) && !game.defaultLevel) {
			throw new Error(`no default level of game '${gameName}'`);
		}

		invertObject(
			guild.cleanUpGameName(gameName),
			gameInput.aliases,
			guild.games,
			game,
		);
	}

	// set up game "Multiple Games" if configured
	if (multiGame) {
		assert(multiGame.categories && hasProperties(multiGame.categories), "multi-game has no categories");

		const game = new Game(guild, MULTI_GAME, multiGame);
		game.categories = newMap();

		// set up object with games' categories
		game.setUpCategories(guild, multiGame.categories, true);

		guild.games[MULTI_GAME] = game;
	}

	const { database } = guild;

	// set up tables for keeping track of race information
	database.createTable(
		"races",
		`race_id INT PRIMARY KEY,
		game TEXT NOT NULL,
		category TEXT NOT NULL,
		level TEXT`
	);

	// set up tables for keeping track of team members
	database.createTable(
		"team_members",
		`team_id INT NOT NULL,
		user_id TEXT NOT NULL`
	);

	// set up tables for keeping track of race results
	database.createTable(
		"results",
		`race_id INT NOT NULL,
		user_or_team_id TEXT NOT NULL,
		team_name TEXT,
		time INT,
		load_time INT,
		elo_change REAL NOT NULL,
		forfeited INT NOT NULL`,
		"idx_results_race",
		"race_id, user_or_team_id, team_name"
	);

	// set up tables for keeping track of user stats
	database.createTable(
		"user_stats",
		`user_id TEXT NOT NULL,
		game TEXT NOT NULL,
		category TEXT NOT NULL,
		il INT NOT NULL,
		race_count INT NOT NULL,
		first_place_count INT NOT NULL,
		second_place_count INT NOT NULL,
		third_place_count INT NOT NULL,
		forfeit_count INT NOT NULL,
		elo REAL NOT NULL,
		pb INT`,
		"idx_user_stats_id",
		"user_id, game, category"
	);

	Object.assign(guild.sqlite, {
		// set up SQLite queries for setting/retrieving race information
		getRace: database.prepare("SELECT * FROM races WHERE race_id = ?;"),
		getMaxRaceID: database.prepare("SELECT MAX(race_id) FROM races;").pluck(),
		getGames: database.prepare("SELECT DISTINCT game FROM races;").pluck(),
		addRace: database.prepare("INSERT OR REPLACE INTO races (race_id, game, category, level) VALUES (@race_id, @game, @category, @level);"),
		deleteRace: database.prepare("DELETE FROM races WHERE race_id = ?;"),

		// set up SQLite queries for setting/retrieving team members
		getMaxTeamID: database.prepare("SELECT MAX(team_id) FROM team_members;").pluck(),
		getTeamUserIDs: database.prepare("SELECT user_id FROM team_members WHERE team_id = ?;").pluck(),
		getTeamUserIDsAndElo: database.prepare("SELECT user_stats.user_id AS user_id, elo FROM team_members JOIN user_stats ON team_members.user_id = user_stats.user_id WHERE team_id = ? AND game = ? AND category = ?;"),
		addTeamMember: database.prepare("INSERT OR REPLACE INTO team_members (team_id, user_id) VALUES (@team_id, @user_id);"),
		deleteTeam: database.prepare("DELETE FROM team_members WHERE team_id = ?;"),

		// set up SQLite queries for setting/retrieving results
		getResults: database.prepare("SELECT * FROM results WHERE race_id = ? ORDER BY forfeited ASC, time ASC;"),
		getAllResults: database.prepare("SELECT races.race_id AS race_id, game, category, user_or_team_id, team_name, time FROM races JOIN results ON races.race_id = results.race_id ORDER BY races.race_id ASC;"),
		getResultsSinceRace: database.prepare("SELECT races.race_id AS race_id, user_or_team_id, team_name, time, elo_change FROM races JOIN results ON races.race_id = results.race_id WHERE races.race_id >= ? AND game = ? AND category = ? ORDER BY races.race_id ASC, forfeited ASC, time ASC;"),
		getResultTeamIDs: database.prepare("SELECT user_or_team_id FROM results WHERE race_id = ? AND team_name IS NOT NULL;").pluck(),
		getTeamRaceCount: database.prepare("SELECT COUNT(*) FROM results WHERE user_or_team_id = ? AND team_name IS NOT NULL;").pluck(),
		getRaceTeamCount: database.prepare("SELECT COUNT(*) FROM results WHERE race_id = ?;").pluck(),
		getLatestLoadTime: database.prepare("SELECT load_time FROM results WHERE user_or_team_id = ? AND team_name IS NULL ORDER BY race_id DESC;").pluck(),
		addResult: database.prepare("INSERT OR REPLACE INTO results (race_id, user_or_team_id, team_name, time, load_time, elo_change, forfeited) VALUES (@race_id, @user_or_team_id, @team_name, @time, @load_time, @elo_change, @forfeited);"),
		updateSoloEloChange: database.prepare("UPDATE results SET elo_change = ? WHERE race_id = ? AND user_or_team_id = ? AND team_name IS NULL;"),
		updateCoopEloChange: database.prepare("UPDATE results SET elo_change = ? WHERE race_id = ? AND user_or_team_id = ? AND team_name IS NOT NULL;"),
		deleteResults: database.prepare("DELETE FROM results WHERE race_id = ?;"),

		// set up SQLite queries for setting/retrieving user stats
		getUserStatsForGame: database.prepare("SELECT category, il, race_count, first_place_count, second_place_count, third_place_count, forfeit_count, elo, pb FROM user_stats WHERE user_id = ? AND game = ? ORDER BY category ASC;"),
		getUserStat: database.prepare("SELECT * FROM user_stats WHERE user_id = ? AND game = ? AND category = ?;"),
		getUserElo: database.prepare("SELECT elo FROM user_stats WHERE user_id = ? AND game = ? AND category = ?;").pluck(),
		getLeaderboard: database.prepare("SELECT ROW_NUMBER() OVER (ORDER BY elo DESC) place, user_id, elo FROM user_stats WHERE game = ? AND category = ? COLLATE NOCASE;"),
		addUserStat: database.prepare("INSERT OR REPLACE INTO user_stats (user_id, game, category, il, race_count, first_place_count, second_place_count, third_place_count, forfeit_count, elo, pb) VALUES (@user_id, @game, @category, @il, @race_count, @first_place_count, @second_place_count, @third_place_count, @forfeit_count, @elo, @pb);"),
		updateUserElo: database.prepare("UPDATE user_stats SET elo = ? WHERE user_id = ? AND game = ? AND category = ?;"),
		updateAllGameElos: database.prepare("UPDATE user_stats SET elo = @elo WHERE game = @game;"),
		deleteUserStat: database.prepare("DELETE FROM user_stats WHERE user_id = ? AND game = ? AND category = ?;"),
	});

	guild.raceID = guild.sqlite.getMaxRaceID.get() + 1;

	// set up race channels
	guild.raceChannels = [];
	for (let channelID of guildInput.raceChannelIDs) {
		const channel = guild.channels.cache.get(channelID);
		if (!(channel instanceof Discord.TextChannel)) {
			throw new Error(`channel ${channelID} is not a text channel`);
		}

		guild.raceChannels.push(channel);
		channel.race = new Race(channel);
	}

	// timestamp when the command `fixelo` was last used
	guild.fixEloTimestamp = 0;
}

/** @type {NodeJS.Dict<Command>} */
export const commands = {
	race: {
		names: [ "race" ],
		aliases: [ "join" ],
		description: "Starts a new race, or joins the currently open race",
		category: HelpCategory.PRE_RACE,
		raceChannelOnly: true,
		/** @param {Discord.GuildMember} member */
		onUse: async function race(onError, message, member) {
			/** @type {Discord.TextChannel} */
			let { guild, race } = message.channel;

			if (race.category.isIL && race.leaveWhenDone.has(member)) {
				// entrant wanted to leave after IL but changed their mind now
				race.leaveWhenDone.delete(member);

				message.acknowledge(member);
				(await member.leaveWhenDoneMessage.catch(onError))?.crossOut?.();
				return;
			}

			if (member.user.isEntrant && member.team.race !== race) {
				// user is already racing somewhere else
				race = member.team.race;
				message.inlineReply(`You are already racing in ${(race.guild === guild) ? race.channel : race.guild.srName}.`);
				return;
			}

			switch (race.state) {
				case RaceState.DONE:
					// record race results now if results are pending
					clearTimeout(race.endTimeout);
					race.clean(!race.everyoneForfeited);
					race = message.channel.race;
					// fall through so that a new race gets started

				case RaceState.NO_RACE: {
					// start race
					/** @type {string} */
					const prefix = guild.commandPrefix;

					race.addEntrant(member);
					message.inlineReply(`You started a new race! Use \`${prefix}race\` to join or \`${prefix}category\` / \`${prefix}level\` to setup the race further (currently ${race.gameCategoryLevel}).`);
					race.state = RaceState.JOINING;
					return;
				}

				case RaceState.COUNTDOWN:
					// interrupt countdown
					if (member.team) {
						// user is already racing here
						return;
					}

					race.stopCountdown();
					// fall through so that user joins

				case RaceState.JOINING:
					// join existing race
					if (race.addEntrant(member)) {
						if (race.teams[0].loadTime === null) {
							if (race.state === RaceState.COUNTDOWN) {
								message.inlineReply(`${member.cleanName} joined; stopping countdown.`);
							} else {
								message.acknowledge(member);
							}
						} else {
							member.team.setDefaultLoadTime();
							const stoppingCountdown = race.state === RaceState.COUNTDOWN ? "; stopping countdown" : "";
							message.inlineReply(`${member.cleanName} joined (loading time: ${formatTimeShort(member.team.loadTime)})${stoppingCountdown}.`);
						}
					}

					return;

				case RaceState.ACTIVE:
					// can't join race that already started
					if (!member.team) {
						message.inlineReply("You can't join, there's a race already in progress!");
					}
			}
		},
	},
	raceQuit: {
		names: [ "quit" ],
		aliases: [ "leave", "exit", "unrace" ],
		description: "Leaves the race",
		category: HelpCategory.PRE_RACE,
		raceChannelOnly: true,
		/** @param {Discord.GuildMember} member */
		onUse: function raceQuit(onError, message, member) {
			/** @type {Discord.TextChannel} */
			const { guild, race } = message.channel;

			if (!race.hasEntrant(member)) {
				// user isn't racing here
				return;
			}

			if (
				race.state === RaceState.ACTIVE
				&& member.team.state !== TeamState.NOT_DONE
				&& race.category.isIL
				&& !race.leaveWhenDone.has(member)
			) {
				// if this person has already finished the IL, mark them to leave once the race is over
				race.leaveWhenDone.add(member);
				member.leaveWhenDoneMessage = message.inlineReply(`You'll leave the race automatically once the current IL is done (use \`${guild.commandPrefix}race\` to rejoin if this was an accident).`);
				return;
			}

			if (race.state === RaceState.JOINING || race.state === RaceState.COUNTDOWN) {
				// leave the race completely if it hasn't started yet
				message.inlineReply(race.removeEntrant(member));
			}
		},
	},
	raceGame: {
		aliases: [ "game" ],
		description: "Tells you to use `category` instead",
		raceChannelOnly: true,
		/** @param {Discord.GuildMember} member */
		onUse: function raceGame(onError, message, member) {
			/** @type {Discord.TextChannel} */
			const { guild, race } = message.channel;
			if (race.hasEntrant(member) && race.state === RaceState.JOINING) {
				message.inlineReply(`${this.toString(guild)} was removed, use \`${guild.commandPrefix}category <game name> / <category name>\` instead.`);
			}
		},
	},
	raceCategory: {
		names: [ "category" ],
		description: "Sets the (game and) category",
		usage: "[<game name> /] <category name>",
		category: HelpCategory.PRE_RACE,
		raceChannelOnly: true,
		/** @param {Discord.GuildMember} member */
		onUse: function raceCategory(onError, message, member, args) {
			/** @type {Discord.TextChannel} */
			const { guild, race } = message.channel;

			if (!race.hasEntrant(member) || race.state !== RaceState.JOINING) {
				// user isn't racing here / race state isn't JOINING
				return;
			}

			if (!args) {
				// show current game and category
				message.inlineReply(`${race.categoryMessagesStart} is currently set to ${race.gameCategoryLevel}. Set the category using: \`${guild.commandPrefix}category [<game name> /] <category name>\``);
				return;
			}

			const splitArgs = args.split("/");
			if (splitArgs.length > 2) {
				this.showUsage(...arguments);
				return;
			}

			const categoryInput = splitArgs.pop().trim();
			/** @type {?Game} */
			let game = null;
			if (splitArgs.length > 0) {
				// game and category were both specified
				game = guild.getGame(splitArgs[0]);
				if (!game) {
					message.inlineReply("Game not found.");
					return;
				}
			}

			const wasIL = race.category.isIL;
			let note = "";

			const category = (game ?? race.game).getCategory(categoryInput)
				?.forCoop?.(race.hasCoopTeam);
			if (category) {
				if ((!game || game === race.game) && race.category === category) {
					// game and category didn't change
					message.inlineReply(`${race.categoryMessagesStart} was already set to ${race.gameCategoryLevel}.`);
					return;
				}

				race.category = category;
				if (category.multiGame) {
					// switch to game "Multiple Games" in case that wasn't the game
					game = guild.games[MULTI_GAME];
				}

				if (race.teams[0].loadTime !== null && category.isIL) {
					for (let team of race.teams) {
						team.loadTime = null;
					}
				}
			} else {
				// use unofficial category
				note = `\n**Note:** That's not an official category in ${game ?? race.game} though; did you mean something else?`;
				race.category = new Category(clean(categoryInput, message))
					.forCoop(race.hasCoopTeam);
			}

			if (game && game !== race.game) {
				// the game changed
				race.entrantWhoChoseIL = null;
				race.level = game.defaultLevel;
				race.game = game;
			}

			if (wasIL !== race.category.isIL) {
				// switched race type
				if (!wasIL && !race.game.ilsConfigured) {
					// no official IL support for game
					/** @type {string} */
					const prefix = guild.commandPrefix;
					note = `\n**Note:** IL races are not configured for ${race.game}. Use \`${prefix}level\` to pick an unofficial level if this was not a mistake.`;
				}

				message.inlineReply(`Switched to ${wasIL ? "full-game" : "IL"} race: ${race.gameCategoryLevel}${note}`);
				return;
			}

			message.inlineReply(`${race.categoryMessagesStart} updated to ${race.gameCategoryLevel}.${note}`);
		},
	},
	raceLevel: {
		names: [ "level" ],
		description: "Sets the level",
		usage: "<level name>",
		category: HelpCategory.IL_RACE,
		raceChannelOnly: true,
		/** @param {Discord.GuildMember} member */
		onUse: async function raceLevel(onError, message, member, args) {
			/** @type {Discord.TextChannel} */
			const { client, guild, race } = message.channel;
			const { communityLevels } = race.game.config.race;

			if (!race.hasEntrant(member) || race.state !== RaceState.JOINING) {
				// user isn't racing here / race state isn't JOINING
				return;
			}

			if (!race.category.isIL) {
				// not currently IL-racing
				message.inlineReply(`Game / category is currently set to ${race.gameCategoryLevel}. Choose an IL category using: ${client.commands.category.getUsage(guild)}`);
				return;
			}

			if (!args) {
				// show current level
				message.inlineReply(`${race.categoryMessagesStart} is currently set to ${race.gameCategoryLevel}. Set the level using: ${this.usage}`);
				return;
			}

			const cleanArgs = clean(args, message);
			let note = "";
			// choose community level if configured
			const communityLevel = await communityLevels?.(onError, message, member, args, cleanArgs).catch(onError);
			if (communityLevel === undefined) {
				return;
			}
			if (communityLevel) {
				race.level = communityLevel.level;
				note = communityLevel.note ?? "";
			} else {
				const level = race.game.getLevel(args);
				if (!level) {
					// use unofficial level
					note = `\n**Note:** That's not an official level in ${race.game} though; did you mean something else?`;
					race.level = cleanArgs;
				} else {
					race.level = level;
				}
			}

			race.entrantWhoChoseIL = member;
			message.inlineReply(`Level updated to ${race.level}.${note}`);
		},
	},
	raceReady: {
		names: [ "ready", "r" ],
		description: "Indicates that you're ready to start",
		category: HelpCategory.PRE_RACE,
		raceChannelOnly: true,
		/** @param {Discord.GuildMember} member */
		onUse: function raceReady(onError, message, member) {
			/** @type {Discord.TextChannel} */
			const { race } = message.channel;

			if (!race.hasEntrant(member) || member.isReady || race.state !== RaceState.JOINING) {
				// user isn't racing here / user is already ready / race state isn't JOINING
				return;
			}

			if (race.teams.length < 2) {
				// don't allow readying up if only one team exists
				message.inlineReply(`Need more than one ${race.teams[0].isCoop ? "team" : "entrant"} before starting!`);
				return;
			}

			member.isReady = true;
			message.acknowledge(member);
			if (race.isEveryoneReady) {
				// start countdown if everyone is ready
				race.channel.send(race.startCountdown());
			}
		},
	},
	raceUnready: {
		names: [ "unready", "ur" ],
		description: "Indicates that you're not actually ready",
		category: HelpCategory.PRE_RACE,
		raceChannelOnly: true,
		/** @param {Discord.GuildMember} member */
		onUse: function raceUnready(onError, message, member) {
			/** @type {Discord.TextChannel} */
			const { race } = message.channel;

			if (
				!race.hasEntrant(member)
				|| !member.isReady
				|| (race.state !== RaceState.JOINING && race.state !== RaceState.COUNTDOWN)
			) {
				// user isn't racing here / user isn't ready / race state isn't JOINING or COUNTDOWN
				return;
			}

			member.isReady = false;
			message.acknowledge(member);
			if (race.state === RaceState.COUNTDOWN) {
				// if someone unreadied during countdown
				race.stopCountdown();
				message.inlineReply(`${member.cleanName} isn't ready; stopping countdown.`);
			}
		},
	},
	raceDone: {
		names: [ "done", "d" ],
		aliases: [ "finish" ],
		description: "Indicates that you/your team finished",
		category: HelpCategory.MID_RACE,
		raceChannelOnly: true,
		/** @param {Discord.GuildMember} member */
		onUse: function raceDone(onError, message, member) {
			/** @type {Discord.TextChannel} */
			const { guild, race } = message.channel;
			const { team } = member;

			if (
				!race.hasEntrant(member)
				|| race.state !== RaceState.ACTIVE
				|| team.state !== TeamState.NOT_DONE
			) {
				// user isn't in the race / it isn't active / the team isn't going anymore
				return;
			}

			if (message.createdTimestamp / 1000 < race.startTime) {
				message.inlineReply("You can't be done, the timer isn't even at 00:00.00 yet!");
				return;
			}

			const realTime = message.createdTimestamp / 1000 - race.startTime;
			if (team.loadTime && realTime <= team.loadTime) {
				message.inlineReply(`You can't be done, your loading time of ${formatTimeShort(team.loadTime)}) hasn't even elapsed! (Current time: ${formatTime(realTime)})`);
				return;
			}

			team.state = TeamState.DONE;
			team.doneTime = realTime - (team.loadTime ?? 0);
			team.calculateEloChange();
			team.place = 1;
			// loop through all other teams
			for (let team2 of race.teams) {
				if (team === team2 || team2.state !== TeamState.DONE) {
					continue;
				}

				if (team2.doneTime < team.doneTime) {
					// team2 finished before team
					team.place += 1;
				} else if (team.doneTime < team2.doneTime) {
					// team2 is slower but already finished, e.g. because it has shorter loading times
					team2.correctDoneMessage(1);
				}
				// else the team is tied and the place isn't increased
			}

			const splitContent = [
				`${team} has finished in `,
				team.place.toOrdinal(),
				" place (",
				team.eloChangeString,
				") with a time of " + formatTime(team.doneTime) + (team.loadTime === null ? "" : ` (loading time: ${formatTimeShort(team.loadTime)})`),
			];

			// update race state
			const raceEndMessage = race.checkIfStillGoing();

			// don't suggest command `undone` if it can't be used
			splitContent[4] += `${`${(raceEndMessage && race.category.isIL) ? "" : ` (use \`${guild.commandPrefix}undone\` if this was a mistake)`}!`}${raceEndMessage}`;

			team.splitDoneMessageContent = splitContent;
			team.endMessage = message.inlineReply(splitContent.join(""));
		},
	},
	raceUndone: {
		names: [ "undone", "ud" ],
		description: "Indicates that you didn't actually finish",
		category: HelpCategory.MID_RACE,
		raceChannelOnly: true,
		/** @param {Discord.GuildMember} member */
		onUse: async function raceUndone(onError, message, member) {
			/** @type {Discord.TextChannel} */
			const { race } = message.channel;
			const { team } = member;

			if (!race.hasEntrant(member) || team.state !== TeamState.DONE) {
				// user isn't in the race / the team isn't done
				return;
			}

			team.state = TeamState.NOT_DONE;
			for (let team2 of race.teams) {
				if (team.doneTime < team2.doneTime) {
					// team is slower but (unlike this team) actually finished
					team2.correctDoneMessage(-1);
				}
				// else the team is this team / didn't finish yet / is slower or tied, so the place isn't decreased
			}

			team.doneTime = null;
			team.place = null;
			team.eloChange = null;
			team.splitDoneMessageContent = null;

			race.checkResume();
			message.acknowledge(member);
			(await team.endMessage.catch(onError))?.crossOut?.();
			team.endMessage = null;
		},
	},
	raceForfeit: {
		names: [ "forfeit", "f" ],
		aliases: [ "ff", "fuck", "yeet" ],
		description: "Drops you/your team out of the race",
		category: HelpCategory.MID_RACE,
		raceChannelOnly: true,
		/** @param {Discord.GuildMember} member */
		onUse: function raceForfeit(onError, message, member) {
			/** @type {Discord.TextChannel} */
			const { guild, race } = message.channel;
			const { team } = member;

			if (
				!race.hasEntrant(member)
				|| race.state !== RaceState.ACTIVE
				|| team.state !== TeamState.NOT_DONE
			) {
				// user isn't in the race / it isn't active / the team isn't going anymore
				return;
			}

			team.state = TeamState.FORFEITED;
			team.endMessage = message.inlineReply(`${team} forfeited (use \`${guild.commandPrefix}unforfeit\` to rejoin if this was an accident).${race.checkIfStillGoing()}`);
		},
	},
	raceUnforfeit: {
		names: [ "unforfeit", "uf" ],
		description: "Rejoins the race after you forfeited",
		category: HelpCategory.MID_RACE,
		raceChannelOnly: true,
		/** @param {Discord.GuildMember} member */
		onUse: async function raceUnforfeit(onError, message, member) {
			/** @type {Discord.TextChannel} */
			const { race } = message.channel;
			const { team } = member;

			if (!race.hasEntrant(member) || team.state !== TeamState.FORFEITED) {
				// user isn't in the race / the team didn't forfeit
				return;
			}

			team.state = TeamState.NOT_DONE;
			race.checkResume();
			message.acknowledge(member);
			(await team.endMessage.catch(onError))?.crossOut?.();
			team.endMessage = null;
		},
	},
	raceClear: {
		names: [ "clearrace" ],
		description: "Ends the race immediately",
		category: HelpCategory.MOD,
		modOnly: true,
		raceChannelOnly: true,
		/** @param {Discord.GuildMember} member */
		onUse: function raceClear(onError, message, member) {
			/** @type {Discord.TextChannel} */
			const { race } = message.channel;

			switch (race.state) {
				case RaceState.NO_RACE:
					return;

				case RaceState.COUNTDOWN:
					race.stopCountdown();
					// don't break so that race gets reset

				case RaceState.JOINING:
				case RaceState.ACTIVE:
					race.channel.race = new Race(race.channel, race.game);
					race.resetEntrants();
					break;

				case RaceState.DONE:
					clearTimeout(race.endTimeout);
					race.clean(!race.everyoneForfeited);
			}

			message.acknowledge(member);
		},
	},
	raceLoads: {
		names: [ "loads" ],
		aliases: [ "load", "loadtime", "loadingtime" ],
		description: "Sets your (team's) loading time for the upcoming race",
		usage: "[<timespan>]",
		example: "loads 3:44.67",
		category: HelpCategory.PRE_RACE,
		raceChannelOnly: true,
		/** @param {Discord.GuildMember} member */
		onUse: function raceLoads(onError, message, member, arg) {
			/** @type {Discord.TextChannel} */
			const { guild, race } = message.channel;
			const { team } = member;

			if (!race.hasEntrant(member) || race.state !== RaceState.JOINING) {
				// user isn't racing here / race state isn't JOINING
				return;
			}

			let loadTime = null;
			if (arg) {
				loadTime = parseTime(arg);
				if (!loadTime) {
					this.showUsage(...arguments);
					return;
				}

				if (team.loadTime !== null) {
					team.loadTime = loadTime;
					message.acknowledge(member);
				}
			} else if (team.loadTime !== null) {
				message.inlineReply(`Your loading time is currently set to ${formatTimeShort(team.loadTime)}. Change it using: ${this.usage}`);
				return;
			}

			if (race.category.isIL) {
				message.inlineReply("Can't use load-removed time for IL races!");
				return;
			}

			team.loadTime = loadTime;
			for (let team2 of race.teams) {
				if (team2 !== team) {
					team2.setDefaultLoadTime();
				}
			}

			race.showJoiningEntrants(
				onError,
				message,
				`Loading time set (use \`${guild.commandPrefix}clearloads\` to undo).\n**Updated ${race}:**\n`,
				`**${race.gameCategoryLevel} race (cont):**\n`
			);
		},
	},
	raceRemoveLoads: {
		names: [ "clearloads" ],
		aliases: [ "removeloads", "resetloads", "clearloadtimes", "removeloadtimes", "resetloadtimes", "clearloadingtimes", "removeloadingtimes", "resetloadingtimes", "realtime" ],
		description: "Resets everyone's loading times",
		category: HelpCategory.PRE_RACE,
		raceChannelOnly: true,
		/** @param {Discord.GuildMember} member */
		onUse: function raceLoads(onError, message, member) {
			/** @type {Discord.TextChannel} */
			const { race } = message.channel;

			if (!race.hasEntrant(member) || race.state !== RaceState.JOINING) {
				// user isn't racing here / race state isn't JOINING
				return;
			}

			if (race.teams[0].loadTime === null) {
				message.inlineReply("Already using real-time mode.");
				return;
			}

			for (let team of race.teams) {
				team.loadTime = null;
			}

			message.acknowledge(member);
		},
	}
};
