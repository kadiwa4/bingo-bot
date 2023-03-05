/// <reference path="./types.d.ts" />

import EntrantTeam from "./EntrantTeam.js";
import { RaceState, TeamState } from "./enums.js";
import Game from "./Game.js";

import Discord from "discord.js";
import { bind, formatTimeShort } from "./misc.js";

/** Keeps track of the current stage of racing in a race channel */
export default class Race {
	/**
	 * Creates a new race object
	 * @param {Discord.TextChannel} channel The channel where the race is taking place
	 * @param {Game} [game] The game which is being raced
	 */
	constructor(channel, game) {
		/** The channel where the race is taking place */
		this.channel = channel;

		/**
		 * The game which is being raced
		 * @type {Game}
		 */
		this.game = game ?? channel.guild.defaultGame;

		/** The category which is being raced */
		this.category = this.game.defaultCategory;

		/**
		 * The name of the level which is being raced or which is selected
		 * once the race switches to an IL race
		 */
		this.level = this.game.defaultLevel;

		/**
		 * The current race state
		 * @default RaceState.NO_RACE
		 */
		this.state = RaceState.NO_RACE;

		/**
		 * Array of all current entrant teams in the race
		 * @type {EntrantTeam[]}
		 */
		this.teams = [];

		/**
		 * Array of IL-race results since the IL series started
		 * @type {ILResult[]}
		 */
		this.ilResults = [];

		/**
		 * Set of entrants that automatically leave when the IL race is done
		 * @type {Set<Discord.GuildMember>}
		 */
		this.leaveWhenDone = new Set();

		/**
		 * Array of timeouts that each send a message belonging to the race countdown
		 * or null if no countdown is happening
		 * @type {?NodeJS.Timeout[]}
		 */
		this.countdownTimeouts = null;

		/**
		 * 1-minute timeout at the end of a full-game race before the results are recorded
		 * or null if the race state isn't `DONE`
		 * @type {?NodeJS.Timeout}
		 */
		this.endTimeout = null;

		/**
		 * The unix time in seconds when the race started
		 * or null if no race is happening
		 * @type {?number}
		 */
		this.startTime = null;

		/**
		 * The entrant that chose the level
		 * or null if the race state isn't `JOINING`/`COUNTDOWN`/no level was chosen
		 * @type {?Discord.GuildMember}
		 */
		this.entrantWhoChoseIL = null;

		/**
		 * The entrant whose turn it is to choose a level
		 * or null if no entrant was selected.
		 * This is based on how many times each entrant has already chosen a level
		 * @type {?Discord.GuildMember}
		 */
		this.entrantWhoChoosesNextLevel = null;
	}

	/**
	 * The guild where the race is taking place
	 * @readonly
	 */
	get guild() {
		return this.channel.guild;
	}

	/**
	 * The race ID
	 * @type {number}
	 */
	get id() {
		return this.channel.guild.raceID;
	}

	set id(value) {
		this.channel.guild.raceID = value;
	}

	/**
	 * Whether or not the race currently has an entrant team with more than one member
	 * @readonly
	 */
	get hasCoopTeam() {
		return this.teams.some((team) => team.isCoop);
	}

	/** Makes sure the category ends with "(Co-op)" if it needs to */
	checkCategoryCoop() {
		this.category = this.category.forCoop(this.hasCoopTeam);
	}

	/**
	 * Whether or not every race entrant is ready
	 * @readonly
	 */
	get isEveryoneReady() {
		return this.teams.every((team) => team.isReady);
	}

	/** Starts the race countdown and returns the message to be sent */
	startCountdown() {
		const raceChannel = this.channel;
		const { emotes, race } = this.game.config;

		this.state = RaceState.COUNTDOWN;
		this.countdownTimeouts = [
			setTimeout(() => {
				raceChannel.send(`${emotes.raceStart} **Go!**`);
				this.state = RaceState.ACTIVE;
				this.startTime = Date.now() / 1000 + (this.game.config.race.timerOffset ?? 0);

				if (this.entrantWhoChoseIL) {
					this.entrantWhoChoseIL.ilChoiceCount += 1;
					this.entrantWhoChoseIL = null;
				}
			}, 1000 * race.countdownLength),
		];

		this.countdownTimeouts.push(...race.countdown.map((number) => (
			setTimeout(() => {
				raceChannel.send(`${emotes.countdown} ${number}…`);
			}, 1000 * (race.countdownLength - number))
		)));

		return `\nEveryone is ready, gl;hf! ${emotes.countdownStart} Starting race in 10 seconds…`;
	}

	/** Stops the race countdown */
	stopCountdown() {
		this.state = RaceState.JOINING;
		for (let timeout of this.countdownTimeouts) {
			clearTimeout(timeout);
		}

		this.countdownTimeouts = null;
	}

	/** Makes sure that at least one entrant isn't ready if there is only one entrant team */
	checkNotCountingDown() {
		if (this.teams.length > 1 || !this.teams[0].isReady) {
			return "";
		}

		// if only one team is left, unready the leader
		const unreadiedEntrant = this.teams[0].leader;
		unreadiedEntrant.isReady = false;
		return `\nUnreadied ${unreadiedEntrant}.`;
	}

	/**
	 * Makes sure the race state is up to date while racing
	 * and returns the message to be sent if the race ended
	 */
	checkIfStillGoing() {
		// every entrant team either has to be done or has to have forfeited
		return (
			this.state === RaceState.ACTIVE
			&& this.teams.every((team) => team.state !== TeamState.NOT_DONE)
		) ? this.end() : "";
	}

	/**
	 * Ends the race, creates timeouts for recording results
	 * (for full-game races at least, otherwise records results directly)
	 * and returns the message to be sent
	 */
	end() {
		const { everyoneForfeited } = this;
		// \xA0 is a non-breaking space
		let messageStart = everyoneForfeited ? "\nEveryone forfeited; race not counted. "
			: `\nRace complete (ID\xA0\`${this.id}\`)! `;

		this.state = RaceState.DONE;
		// calculate the forfeited teams' Elos
		for (let team of this.teams) {
			if (team.state === TeamState.FORFEITED) {
				team.calculateEloChange();
			}
		}

		if (!this.category.isIL) {
			this.endTimeout = setTimeout(bind(this, "clean"), 60000, !everyoneForfeited);
			return `${messageStart}${everyoneForfeited ? "C" : "Recording results/c"}learing race in 1 minute.`;
		}

		this.clean(!everyoneForfeited);
		if (this.leaveWhenDone.size > 0) {
			const leavingEntrants = [];
			let lastLeavingEntrant = null;
			for (let entrant of this.leaveWhenDone) {
				entrant.team.remove(entrant);
				this.resetEntrant(entrant);
				if (lastLeavingEntrant) {
					leavingEntrants.push(lastLeavingEntrant);
				}

				lastLeavingEntrant = entrant;
			}

			this.leaveWhenDone = new Set();
			this.checkCategoryCoop();
			messageStart += (leavingEntrants.length > 0)
				? `${leavingEntrants.join(", ")} and ${lastLeavingEntrant} have left the race. `
				: `${lastLeavingEntrant} has left the race. `;
		}

		this.checkWhoChoosesNextLevel();

		/** @type {string} */
		const prefix = this.guild.commandPrefix;
		return `${messageStart}Use \`${prefix}leave\` to leave the lobby or \`${prefix}level\` to choose another level${this.entrantWhoChoosesNextLevel ? ` (it's ${this.entrantWhoChoosesNextLevel}'s turn to choose one)` : ""}.`;
	}

	/**
	 * Adds the race results to the SQLite database if specified.
	 * Then clears the race for full-game races or starts a new IL race
	 * @param {boolean} [recordResults] Whether or not to add the results to the database
	 */
	clean(recordResults = true) {
		const { isIL } = this.category;

		if (!recordResults) {
			if (isIL) {
				this.newIL();
			} else {
				this.channel.race = new Race(this.channel, this.game);
				this.resetEntrants();
			}

			return;
		}

		const { sqlite } = this.guild;
		const gameName = this.game.name;
		const categoryName = this.category.name;
		const levelName = isIL ? this.level : null;

		// add race ID and game / category / level to table races
		sqlite.addRace.run({
			race_id: this.id,
			game: this.game.name,
			category: this.category.name,
			level: levelName,
		});

		for (let team of this.teams) {
			let newTeamID;
			if (team.isCoop && !team.previousTeamID) {
				// the team has either changed or not raced yet.
				// get next available team ID
				newTeamID = sqlite.getMaxTeamID.get() + 1;
				team.previousTeamID = newTeamID;
			}

			const userOrTeamID = (team.isCoop ? team.previousTeamID.toString() : team.leader.id);
			// add result information to table results
			sqlite.addResult.run({
				race_id: this.id,
				user_or_team_id: userOrTeamID,
				team_name: team.isCoop ? team.name : null,
				time: team.doneTime,
				load_time: team.loadTime,
				elo_change: team.eloChange,
				forfeited: +(team.state === TeamState.FORFEITED),
			});

			for (let teamMember of team) {
				if (newTeamID) {
					// a new team was added to the teams table.
					// add team ID and user ID to table team_members
					sqlite.addTeamMember.run({ team_id: newTeamID, user_id: teamMember.id });
				}

				// gather already existing member stats
				const userStats = sqlite.getUserStat.get(teamMember.id, gameName, categoryName);
				let pb = null;
				if (!isIL) {
					if (!userStats?.pb || (team.doneTime ?? Number.MAX_VALUE) < userStats.pb) {
						// PB was beaten
						pb = team.doneTime;
					} else {
						pb = userStats.pb;
					}
				}

				// add member stats to table member_stats
				sqlite.addUserStat.run({
					user_id: teamMember.id,
					game: gameName,
					category: categoryName,
					il: +isIL,
					race_count: (userStats?.race_count ?? 0) + 1,
					first_place_count: (userStats?.first_place_count ?? 0) + (team.place === 1),
					second_place_count: (userStats?.second_place_count ?? 0) + (team.place === 2),
					third_place_count: (userStats?.third_place_count ?? 0) + (team.place === 3),
					forfeit_count: (userStats?.forfeit_count ?? 0) + (team.state === TeamState.FORFEITED),
					elo: (userStats?.elo ?? this.game.config.race.elo.start) + team.eloChange,
					pb,
				});
			}
		}

		this.guild.emit("raceRecorded", this);
		this.id += 1;
		if (isIL) {
			let winnerTeam;
			for (let team of this.teams) {
				if (team.state === TeamState.FORFEITED) {
					// teams that forfeited don't get any points
					continue;
				}

				if (team.place === 1) {
					winnerTeam = team;
				}

				const pointGain = this.teams.length - team.place + 1;
				for (let member of team) {
					member.ilScore += pointGain;
				}
			}

			this.ilResults.push({
				id: this.id - 1,
				game: this.game,
				level: this.level,
				winnerTeamName: winnerTeam.boldName,
			});

			this.newIL();
		} else {
			this.channel.race = new Race(this.channel, this.game);
			this.resetEntrants();
		}
	}

	/**
	 * Checks if the potentially already `DONE` full-game race should be resumed
	 * and the recording of results cancelled
	 */
	checkResume() {
		if (this.state !== RaceState.DONE) {
			return;
		}

		this.state = RaceState.ACTIVE;
		// delete the forfeited teams' Elos, we don't know if the entrants
		// that are still going will finish or forfeit as well
		for (let team of this.teams) {
			if (team.state === TeamState.FORFEITED) {
				team.eloChange = null;
			}
		}

		clearTimeout(this.endTimeout);
		this.endTimeout = null;
	}

	/** Prepares the next IL race */
	newIL() {
		this.state = RaceState.JOINING;

		for (let team of this.teams) {
			team.state = TeamState.NOT_DONE;
			team.doneTime = null;
			team.place = null;
			team.eloChange = null;
			team.endMessage = null;
			team.splitDoneMessageContent = null;
			for (let teamMember of team) {
				teamMember.isReady = false;
			}
		}
	}

	/**
	 * Returns a generator that yields each race entrant
	 * @returns {Generator<Discord.GuildMember, void, undefined>}
	 */
	* entrantIterator() {
		for (let team of this.teams) {
			yield* team;
		}
	}

	/**
	 * Whether or not all entrant teams forfeited
	 * @readonly
	 * @type {boolean}
	 */
	get everyoneForfeited() {
		return this.teams.every((team) => team.state === TeamState.FORFEITED);
	}

	/**
	 * Determines whether or not the member is currently in the race
	 * @param {Discord.GuildMember} member The guild member in question
	 */
	hasEntrant(member) {
		return member.team && member.team.race === this;
	}

	/**
	 * Adds an entrant as a new team. Returns true if successful
	 * or false if the entrant has already joined a race
	 * @param {Discord.GuildMember} member The guild member to be added
	 * @returns {boolean}
	 */
	addEntrant(member) {
		if (member.user.isEntrant) {
			return false;
		}

		this.teams.push(new EntrantTeam(this, member));
		member.isReady = false;
		member.ilScore = 0;
		member.ilChoiceCount = this.averageLevelChoiceCount;
		member.user.isEntrant = true;
		return true;
	}

	/**
	 * Removes a race entrant and returns the message to be sent
	 * @param {Discord.GuildMember} entrant The race entrant to be removed
	 * @returns {string}
	 */
	removeEntrant(entrant) {
		entrant.team.remove(entrant);
		this.resetEntrant(entrant);
		this.checkCategoryCoop();

		let note = "";
		if (this.teams.length > 0) {
			note = this.checkNotCountingDown();
			const entrantWasUnreadied = !!note;

			if (entrantWasUnreadied && this.state === RaceState.COUNTDOWN) {
				this.stopCountdown();
				note += " Stopping countdown.";
			} else if (!entrantWasUnreadied && this.state === RaceState.JOINING) {
				if (this.isEveryoneReady) {
					// if now only ready people are left, start the countdown
					note = this.startCountdown();
				} else if (this.category.isIL && entrant === this.entrantWhoChoosesNextLevel) {
					this.checkWhoChoosesNextLevel();
					note = this.entrantWhoChoosesNextLevel ? ` It's ${this.entrantWhoChoosesNextLevel}'s turn to choose a level then.` : "";
				}
			}
		} else {
			// close down race if this is the last person leaving
			this.channel.race = new Race(this.channel, this.game);
			note = " Closing race.";
		}

		return `${entrant.cleanName} left the race.${note}`;
	}

	/**
	 * Resets all race entrants
	 */
	resetEntrants() {
		for (let entrant of this.entrantIterator()) {
			this.resetEntrant(entrant);
		}
	}

	/**
	 * Resets a race entrant when they leave the race
	 * @param {Discord.GuildMember} entrant The race entrant to be reset
	 */
	resetEntrant(entrant) {
		entrant.ilChoiceCount = 0;
		entrant.ilScore = 0;
		entrant.isReady = false;
		entrant.leaveWhenDoneMessage = null;
		entrant.team = null;
		entrant.user.isEntrant = false;
	}

	/**
	 * Array of all entrants.
	 * To loop through all entrants, use `entrantIterator` instead
	 * @readonly
	 */
	get entrants() {
		/** @type {Discord.GuildMember[]} */
		const entrants = [];
		for (let team of this.teams) {
			entrants.push(...team);
		}

		return entrants;
	}

	/**
	 * The average number of times a current entrant has chosen a level
	 * @readonly
	 */
	get averageLevelChoiceCount() {
		return Math.floor(
			this.entrants.map((entrant) => entrant.ilChoiceCount ?? 0).reduce((x, y) => x + y, 0)
		);
	}

	/**
	 * Determines who should choose the level for the next IL race.
	 * This is based on how many times each entrant has already chosen a level
	 */
	checkWhoChoosesNextLevel() {
		if (!this.game.config.race.sayWhoChoosesNextIL || this.teams.length < 2) {
			this.entrantWhoChoosesNextLevel = null;
			return;
		}

		// set this to any entrant
		let currentEntrant = this.teams[0].leader;

		for (let entrant of this.entrantIterator()) {
			if (entrant.ilChoiceCount < currentEntrant.ilChoiceCount) {
				// this entrant has chosen less levels
				currentEntrant = entrant;
			}
		}

		this.entrantWhoChoosesNextLevel = currentEntrant;
	}

	/**
	 * For !status and !randomteams
	 * @param {ErrorFunction} onError
	 * @param {Discord.Message} message
	 * @param {string} firstHeading
	 * @param {string} otherHeading
	 */
	showJoiningEntrants(onError, message, firstHeading, otherHeading) {
		// \xA0 is a non-breaking space

		if (this.category.isIL) {
			const ilScoreWidth = Math.max(
				...this.entrants.map((entrant) => entrant.ilScore.toString().length)
			);

			// show IL race status
			/** @param {Discord.GuildMember} entrant */
			const entrantString = function (entrant, fiveSpaces) {
				return `  \`${entrant.ilScore.toString().padStart(ilScoreWidth)}\` – ${fiveSpaces === false ? "" : "\t"}${entrant.readyEmote} ${entrant.cleanName}\n`;
			};

			message.multiReply(onError, firstHeading, otherHeading, function* () {
				// copy the list of teams and sort it, then loop through it
				for (let team of this.teams.slice()
					.sort((team1, team2) => team2.ilScoreAverage - team1.ilScoreAverage)) {
					yield team.isCoop
						// sort team entrants and loop through them
						? `  ${team} – avg\xA0${team.ilScoreAverage.toFixed(2)}\n${team.slice().sort((entrant1, entrant2) => entrant2.ilScore - entrant1.ilScore).map(entrantString).join("")}`
						: entrantString(team.leader, false);
				}
			}.bind(this));
		} else {
			// show full game race status
			/** @param {Discord.GuildMember} entrant */
			const entrantString = function (entrant) {
				return `  ${entrant.readyEmote} ${entrant.cleanName}`;
			};

			const soloEntrants = [];

			message.multiReply(onError, firstHeading, otherHeading, function* () {
				for (let team of this.teams) {
					if (team.isCoop) {
						yield `  ${team}${team.loadTime === null ? "" : ` (${formatTimeShort(team.loadTime)}\xA0loads)`}\n\t${team.map(entrantString).join("\n\t")}\n`;
					} else {
						soloEntrants.push(team.leader);
					}
				}

				for (let entrant of soloEntrants) {
					yield entrantString(entrant) + team.loadTime === null ? "\n" : ` (${formatTimeShort(team.loadTime)}\xA0loads)\n`;
				}
			}.bind(this));
		}
	}

	/**
	 * Message start for game / category / level-related commands
	 * @readonly
	 */
	get categoryMessagesStart() {
		return `Game / category${this.category.isIL ? " / level" : ""}`;
	}

	/**
	 * The current race game / category (/ level)
	 * @readonly
	 */
	get gameCategoryLevel() {
		return `${this.game} / ${this.category}${this.category.isIL ? ` / ${this.level}` : ""}`;
	}

	/**
	 * The race game / category (/ level) and ID (using markdown)
	 * @readonly
	 */
	get info() {
		// \xA0 is a non-breaking space
		return `${this.gameCategoryLevel} race (ID\xA0\`${this.id}\`)`;
	}

	/** Returns the race game / category (/ level) and ID (using markdown) */
	toString() {
		return this.info;
	}
}
