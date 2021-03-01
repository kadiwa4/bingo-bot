/// <reference path="../types.d.ts" />

import Category from "../Category.js";
import Command from "../Command.js";
import EntrantTeam from "../EntrantTeam.js";
import { HelpCategory, RaceState, TeamState } from "../enums.js";
import Game from "../Game.js";
import Race from "../Race.js";
import { assert, bind, clean, createSQLiteTable, formatTime, getUserID, invertObject, logFormat, MULTI_GAME, noop, spacesAroundMentions, WHITESPACE, WHITESPACE_PLUS } from "../misc.js";

import BetterSqlite3 from "better-sqlite3";
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
            }
        }
    },
    emotes: {
        // don't use guild emotes as defaults
        acknowledge: "✅",
        elo: "😎",

        notReady: "🔸",
        ready: "✅",

        countdownStart: "™️",
        countdown: "",
        raceStart: "",

        firstPlace: "🥇",
        secondPlace: "🥈",
        thirdPlace: "🥉",
        done: "🏁",
        racing: "⏱",
        forfeited: "❌"
    }
};

/**
 * @param {Discord.Guild} guild
 * @param {GuildInput} guildInput
 * @see CommandModule.init
 */
export function init(guild, guildInput) {
    const { commonCategories, games, multiGame } = guildInput;

    guild.cleanUpMultiGameCategory = guildInput.cleanUpMultiGameCategory ?? guild.config.cleanUpCategory;

    // set up object with categories common across all games
    guild.commonCategories = Object.create(null);
    for (let categoryName in commonCategories) {
        const categoryInput = commonCategories[categoryName];

        invertObject(guild.config.cleanUpCategory(categoryName).name, categoryInput.aliases, guild.commonCategories, new Category(categoryName, categoryInput));
    }

    guild.cleanUpGameName = guildInput.cleanUpGameName;

    // set up object with games
    guild.games = Object.create(null);
    for (let gameName in games) {
        const gameInput = games[gameName];
        const game = new Game(guild, gameName, gameInput ?? {});
        game.categories = Object.create(guild.commonCategories);

        // set up object with games' categories
        game.setUpCategories(guild, gameInput.categories ?? {}, false);

        // set up object with games' levels
        for (let levelName in gameInput.levels) {
            const levelInput = gameInput.levels[levelName];

            if (levelInput?.default) {
                assert(!game.defaultLevel, `multiple default levels for game ${gameName} (${game.defaultLevel} and ${levelName})`, guild);
                game.defaultLevel = levelName;
            }

            invertObject(game.config.cleanUpLevelName(levelName), levelInput?.aliases, game.levels, levelName);
        }

        assert(Object.keys(game.levels).length === 0 || game.defaultLevel, `no default level for game ${gameName}`, guild);
        invertObject(guild.cleanUpGameName(gameName), gameInput.aliases, guild.games, game);
    }

    if (multiGame) {
        assert(multiGame.categories && Object.keys(multiGame.categories).length > 0, "property 'multiGame' was specified but has no categories", guild);
        const game = new Game(guild, MULTI_GAME, multiGame);
        game.categories = Object.create(null);

        // set up object with games' categories
        game.setUpCategories(guild, multiGame.categories, true);

        guild.games[MULTI_GAME] = game;
    }

    /** @type {{ database: BetterSqlite3.Database; }} */
    const { database } = guild;

    // set up tables for keeping track of race information
    createSQLiteTable(database, "races",
        `race_id INT PRIMARY KEY,
        game TEXT NOT NULL,
        category TEXT NOT NULL,
        level TEXT`);

    // set up tables for keeping track of team members
    createSQLiteTable(database, "team_members",
        `team_id INT NOT NULL,
        user_id TEXT NOT NULL`);

    // set up tables for keeping track of race results
    createSQLiteTable(database, "results",
        `race_id INT NOT NULL,
        user_or_team_id TEXT NOT NULL,
        team_name TEXT,
        time INT,
        forfeited INT NOT NULL`,
        "idx_results_race", "race_id, user_or_team_id, team_name");

    // set up tables for keeping track of user stats
    createSQLiteTable(database, "user_stats",
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
        "idx_user_stats_id", "user_id, game, category");

    Object.assign(guild.sqlite, {
        // setup SQL queries for setting/retrieving race information
        getRace: database.prepare("SELECT * FROM races WHERE race_id = ?;"),
        getMaxRaceID: database.prepare("SELECT MAX(race_id) FROM races;").pluck(),
        getGames: database.prepare("SELECT DISTINCT game FROM races;").pluck(),
        addRace: database.prepare("INSERT OR REPLACE INTO races (race_id, game, category, level) VALUES (@race_id, @game, @category, @level);"),

        // setup SQL queries for setting/retrieving team members
        getMaxTeamID: database.prepare("SELECT MAX(team_id) FROM team_members;").pluck(),
        getTeamUserIDs: database.prepare("SELECT user_id FROM team_members WHERE team_id = ?;").pluck(),
        getTeamUserIDsAndElo: database.prepare("SELECT user_stats.user_id AS user_id, elo FROM team_members JOIN user_stats ON team_members.user_id = user_stats.user_id WHERE team_id = ? AND game = ? AND category = ?;"),
        addTeamMember: database.prepare("INSERT OR REPLACE INTO team_members (team_id, user_id) VALUES (@team_id, @user_id);"),

        // setup SQL queries for setting/retrieving results
        getResults: database.prepare("SELECT * FROM results WHERE race_id = ? ORDER BY forfeited ASC, time ASC;"),
        getAllResults: database.prepare("SELECT races.race_id AS race_id, user_or_team_id, team_name, game, category, time, forfeited FROM races JOIN results ON races.race_id = results.race_id ORDER BY races.race_id ASC;"),
        addResult: database.prepare("INSERT OR REPLACE INTO results (race_id, user_or_team_id, team_name, time, forfeited) VALUES (@race_id, @user_or_team_id, @team_name, @time, @forfeited);"),

        // setup SQL queries for setting/retrieving user stats
        getUserStatsForGame: database.prepare("SELECT category, il, race_count, first_place_count, second_place_count, third_place_count, forfeit_count, elo, pb FROM user_stats WHERE user_id = ? AND game = ? ORDER BY category ASC;"),
        getUserStatForCategory: database.prepare("SELECT * FROM user_stats WHERE user_id = ? AND game = ? AND category = ?;"),
        getUserEloForCategory: database.prepare("SELECT elo FROM user_stats WHERE user_id = ? AND game = ? AND category = ?;").pluck(),
        getLeaderboard: database.prepare("SELECT ROW_NUMBER() OVER (ORDER BY elo DESC) place, user_id, elo FROM user_stats WHERE game = ? AND category = ?;"),
        addUserStat: database.prepare("INSERT OR REPLACE INTO user_stats (user_id, game, category, il, race_count, first_place_count, second_place_count, third_place_count, forfeit_count, elo, pb) "
            + "VALUES (@user_id, @game, @category, @il, @race_count, @first_place_count, @second_place_count, @third_place_count, @forfeit_count, @elo, @pb);"),
        updateElo: database.prepare("UPDATE user_stats SET elo = @elo WHERE user_id = @user_id AND game = @game AND category = @category;"),
        updateAllGameElos: database.prepare("UPDATE user_stats SET elo = @elo WHERE game = @game;")
    });

    guild.raceID = guild.sqlite.getMaxRaceID.get() + 1;

    guild.raceChannels = [];
    for (let channelID of guildInput.raceChannelIDs) {
        const channel = guild.channels.cache.get(channelID);

        guild.raceChannels.push(channel);
        channel.race = new Race(channel);
    }

    guild.fixEloTimestamp = 0;
}

/** @type {NodeJS.Dict<Command>} */
export const commands = {
    race: {
        names: [ "race" ],
        aliases: [ "join", "unleave", "unexit" ],
        fakeNames: [ "r" ],
        description: "Starts a new race, or joins the currently open race",
        category: HelpCategory.PRE_RACE,
        raceChannelOnly: true,
        onUse: async function race(onError, message, member) {
            /** @type {Discord.TextChannel & { race: Race; }} */
            let { guild, race } = message.channel;

            if (race.category.isIL && race.leaveWhenDone.has(member)) {
                // entrant wanted to leave after IL but changed their mind now
                race.leaveWhenDone.delete(member);

                message.acknowledge();
                (await member.leaveWhenDoneMessage.catch(onError))?.crossOut?.();
                return;
            }

            if (member.user.isEntrant && member.team.race !== race) {
                race = member.team.race;
                message.inlineReply(`You are already racing in ${race.guild === member.guild
                    ? race.channel : race.guild.srName}.`);
                return;
            }

            switch (race.state) {
                case RaceState.DONE:
                    // record race results now if results are pending
                    clearTimeout(race.endTimeout);
                    race.clean(!race.everyoneForfeited);
                    race = message.channel.race;
                    // don't return so that a new race gets started

                case RaceState.NO_RACE:
                    // start race
                    /** @type {string} */
                    const prefix = guild.commandPrefix;

                    race.addEntrant(member);
                    message.inlineReply(`You started a new race! Use \`${prefix}race\` to join or \`${prefix}category\` / \`${prefix}level\` to setup the race further (currently ${race.gameCategoryLevel}).`);
                    race.state = RaceState.JOINING;
                    return;

                case RaceState.COUNTDOWN:
                    // interrupt countdown
                    if (member.team) {
                        return;
                    }

                    race.stopCountdown();
                    // don't return so that user joins

                case RaceState.JOINING:
                    // join existing race
                    if (race.addEntrant(member)) {
                        message.acknowledge();
                        if (race.state === RaceState.COUNTDOWN) {
                            message.inlineReply(`${member.cleanName} joined; stopping countdown.`);
                        }
                    }

                    return;

                case RaceState.ACTIVE:
                    // can't join race that already started
                    if (!member.team) {
                        message.inlineReply("Can't join, there's a race already in progress!");
                    }
            }
        }
    },
    raceQuit: {
        names: [ "quit", "q" ],
        aliases: [ "leave", "exit", "unrace" ],
        description: "Leaves the race",
        category: HelpCategory.PRE_RACE,
        raceChannelOnly: true,
        onUse: function raceQuit(onError, message, member) {
            /** @type {Discord.TextChannel & { race: Race; }} */
            const { guild, race } = message.channel;

            if (!race.hasEntrant(member)) {
                return;
            }

            if (race.state === RaceState.ACTIVE && member.team.state !== TeamState.NOT_DONE
                && race.category.isIL && !race.leaveWhenDone.has(member)) {
                // if this person has already finished the IL, mark them to leave once the race is over
                race.leaveWhenDone.add(member);
                member.leaveWhenDoneMessage = message.inlineReply(`You'll leave the race automatically once the current IL is done (use \`${guild.commandPrefix}race\` to rejoin if this was an accident).`);
                return;
            }

            if (race.state === RaceState.JOINING || race.state === RaceState.COUNTDOWN) {
                // leave race completely if the race hasn't started yet
                message.inlineReply(race.removeEntrant(member));
            }
        }
    },
    raceGame: {
        aliases: [ "game" ],
        description: "Tells you to use `category` instead",
        raceChannelOnly: true,
        onUse: function raceGame(onError, message, member) {
            /** @type {Discord.TextChannel & { race: Race; }} */
            const { guild, race } = message.channel;
            if (race.hasEntrant(member) && race.state === RaceState.JOINING) {
                message.inlineReply(`${this.toString(guild)} was removed, use \`${guild.commandPrefix}category <game name> / <category name>\` instead.`);
            }
        }
    },
    raceCategory: {
        names: [ "category" ],
        description: "Sets the (game and) category",
        usage: "[<game name> /] <category name>",
        category: HelpCategory.PRE_RACE,
        raceChannelOnly: true,
        onUse: function raceCategory(onError, message, member, args) {
            /** @type {Discord.TextChannel & { race: Race; }} */
            const { guild, race } = message.channel;

            if (!race.hasEntrant(member) || race.state !== RaceState.JOINING) {
                return;
            }

            if (!args) {
                // show current category
                message.inlineReply(`${race.categoryMessagesStart} is currently set to ${race.gameCategoryLevel}. Set the category using: \`${guild.commandPrefix}category [<game name> /] <category name>\``);
                return;
            }

            const splitArgs = args.split(RegExp(`${WHITESPACE}*/${WHITESPACE}*`));

            if (splitArgs.length > 2) {
                this.showUsage(...arguments);
                return;
            }

            const categoryInput = splitArgs.pop();
            /** @type {?Game} */
            let game = null;
            if (splitArgs.length > 0) {
                game = guild.getGame(splitArgs[0]);
                if (!game) {
                    message.inlineReply("Game not found.");
                    return;
                }
            }

            const wasIL = race.category.isIL;
            let note = "";

            const category = (game ?? race.game).getCategory(categoryInput)?.forCoop?.(race.hasCoopTeam);
            if (category) {
                if ((!game || game === race.game) && race.category === category) {
                    message.inlineReply(`${race.categoryMessagesStart} was already set to ${race.gameCategoryLevel}.`);
                    return;
                }

                race.category = category;
                if (category.multiGame) {
                    race.game = guild.games[MULTI_GAME];
                }
            } else {
                // use unofficial category
                note = `\n**Note:** That's not an official category in ${game ?? race.game} though; did you mean something else?`;
                race.category = new Category(clean(categoryInput, message)).forCoop(race.hasCoopTeam);
            }

            if (game && game !== race.game) {
                race.entrantWhoChoseIL = null;
                race.level = game.defaultLevel;

                // if the user chose a multi-game category, the game is already up to date
                if (!race.category.multiGame) {
                    race.game = game;
                }
            }

            if (wasIL !== race.category.isIL) {
                // switched race type
                if (!wasIL && !race.game.ilsConfigured) {
                    // no official IL support for game
                    /** @type {string} */
                    const prefix = this.guild.commandPrefix;
                    note = `\n**Note:** IL races are not configured for ${race.game}. Use \`${prefix}level\` to pick an unofficial level if this was not a mistake.`;
                }

                message.inlineReply(`Switched to ${wasIL ? "full-game" : "IL"} race: ${race.gameCategoryLevel}${note}`);
                return;
            }

            message.inlineReply(`${race.categoryMessagesStart} updated to ${race.gameCategoryLevel}.${note}`);
        }
    },
    raceLevel: {
        names: [ "level" ],
        description: "Sets the level",
        usage: "<level name>",
        category: HelpCategory.IL_RACE,
        raceChannelOnly: true,
        onUse: function raceLevel(onError, message, member, args) {
            /** @type {Discord.TextChannel & { race: Race; }} */
            const { client, guild, race } = message.channel;
            const { communityLevels } = race.game.config.race;

            if (!race.hasEntrant(member) || race.state !== RaceState.JOINING) {
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
            // choose community level if configured
            if (communityLevels?.(message, member, args, cleanArgs)) {
                return;
            }

            let note = "";
            const level = race.game.getLevel(args);
            if (!level) {
                // use unofficial level
                note = `\n**Note:** That's not an official level in ${race.game} though; did you mean something else?`;
                race.level = cleanArgs;
            } else {
                race.level = level;
            }

            race.entrantWhoChoseIL = member;
            message.inlineReply(`Level updated to ${race.level}.${note}`);
        }
    },
    raceReady: {
        names: [ "ready" ],
        fakeNames: [ "r" ],
        description: "Indicates that you're ready to start",
        category: HelpCategory.PRE_RACE,
        raceChannelOnly: true,
        onUse: function raceReady(onError, message, member) {
            /** @type {{ race: Race; }} */
            const { race } = message.channel;

            if (!race.hasEntrant(member) || member.isReady || race.state !== RaceState.JOINING) {
                return;
            }

            if (race.teams.length < 2) {
                // don't allow readying up if only one team exists
                message.inlineReply(`Need more than one ${race.teams[0].isCoop ? "team" : "entrant"} before starting!`);
                return;
            }

            // mark as ready
            member.isReady = true;
            message.acknowledge();

            if (race.isEveryoneReady) {
                // start countdown if everyone is ready
                race.channel.send(race.startCountdown(message));
            }
        }
    },
    raceUnready: {
        names: [ "unready", "ur" ],
        description: "Indicates that you're not actually ready",
        category: HelpCategory.PRE_RACE,
        raceChannelOnly: true,
        onUse: function raceUnready(onError, message, member) {
            /** @type {{ race: Race; }} */
            const { race } = message.channel;

            if (!race.hasEntrant(member) || !member.isReady || (race.state !== RaceState.JOINING && race.state !== RaceState.COUNTDOWN)) {
                return;
            }

            member.isReady = false;

            if (race.state === RaceState.COUNTDOWN) {
                // if someone unreadied during countdown
                race.stopCountdown();
                message.inlineReply(`${member.cleanName} isn't ready; stopping countdown.`);
            } else {
                message.acknowledge();
            }
        }
    },
    raceR: {
        aliases: [ "r" ],
        description: "Starts a new race, joins the currently open race or indicates that you're ready to start",
        raceChannelOnly: true,
        onUse: function raceR(onError, message, member, args) {
            /** @type {Discord.TextChannel & { race: Race; }} */
            const { client, race } = message.channel;

            return client.commands[(race.hasEntrant(member) && race.state === RaceState.JOINING) ? "ready" : "race"].onUse(...arguments);
        }
    },
    raceDone: {
        names: [ "done", "d" ],
        description: "Indicates that you/your team finished",
        category: HelpCategory.MID_RACE,
        raceChannelOnly: true,
        onUse: function raceDone(onError, message, member) {
            /** @type {Discord.TextChannel & { race: Race }} */
            const { guild, race } = message.channel;
            /** @type {{ team: EntrantTeam; }} */
            const { team } = member;

            if (!race.hasEntrant(member) || race.state !== RaceState.ACTIVE || team.state !== TeamState.NOT_DONE) {
                // can't finish if you're not in the race/it isn't active/the team isn't going
                return;
            }

            team.state = TeamState.DONE;
            team.doneTime = message.createdTimestamp / 1000 - race.startTime;
            team.calculateEloDifference();
            team.place = 1;
            for (let team2 of race.teams) {
                if (team === team2 || team2.state !== TeamState.DONE) {
                    continue;
                }

                if (team2.doneTime < team.doneTime) {
                    // if that team finished before
                    team.place++;
                } else if (team.doneTime < team2.doneTime) {
                    // team is slower but already finished
                    // this happens due to some discord messages arriving slower than others
                    team2.correctDoneMessage(1);
                }
                // else the team is tied and the place isn't increased
            }

            const splitContent = [
                `${team} has finished in `,
                team.place.toOrdinal(),
                " place (",
                team.eloDifferenceString,
                `) with a time of ${formatTime(team.doneTime)}`
            ];

            const raceEndMessage = race.checkIfStillGoing(); // update race.state

            splitContent[4] += `${(raceEndMessage && race.category.isIL) ? "" : ` (use \`${guild.commandPrefix}undone\` if this was a mistake)`}!`;

            team.splitDoneMessageContent = splitContent;
            team.endMessage = message.inlineReply(`${splitContent.join("")}${raceEndMessage}`);
        }
    },
    raceUndone: {
        names: [ "undone", "ud" ],
        description: "Indicates that you didn't actually finish",
        category: HelpCategory.MID_RACE,
        raceChannelOnly: true,
        onUse: async function raceUndone(onError, message, member) {
            /** @type {{ race: Race; }} */
            const { race } = message.channel;
            /** @type {{ team: EntrantTeam; }} */
            const { team } = member;

            if (!race.hasEntrant(member) || team.state !== TeamState.DONE) {
                return;
            }

            team.state = TeamState.NOT_DONE;
            for (let team2 of race.teams) {
                if (team.doneTime < team2.doneTime) {
                    // team is slower but (unlike this team) actually finished
                    team2.correctDoneMessage(-1);
                }
                // else the team is this team/didn't finish yet/is slower/tied and the place isn't decreased
            }

            Object.assign(team, {
                doneTime: null,
                place: null,
                eloDifference: null,
                splitDoneMessageContent: null
            });

            race.checkResume();
            message.acknowledge();
            (await team.endMessage.catch(onError))?.crossOut?.();
            team.endMessage = null;
        }
    },
    raceForfeit: {
        names: [ "forfeit", "f" ],
        aliases: [ "ff", "fuck", "yeet" ],
        description: "Drops you/your team out of the race",
        category: HelpCategory.MID_RACE,
        raceChannelOnly: true,
        onUse: function raceForfeit(onError, message, member) {
            /** @type {Discord.TextChannel & { race: Race; }} */
            const { guild, race } = message.channel;
            /** @type {{ team: EntrantTeam; }} */
            const { team } = member;

            if (!race.hasEntrant(member) || race.state !== RaceState.ACTIVE || team.state !== TeamState.NOT_DONE) {
                // can't forfeit if you're not in the race/it isn't active/the team isn't going
                return;
            }

            team.state = TeamState.FORFEITED;
            team.endMessage = message.inlineReply(`${team} forfeited (use \`${guild.commandPrefix}unforfeit\` to rejoin if this was an accident).${race.checkIfStillGoing()}`);
        }
    },
    raceUnforfeit: {
        names: [ "unforfeit", "uf" ],
        description: "Rejoins the race after you forfeited",
        category: HelpCategory.MID_RACE,
        raceChannelOnly: true,
        onUse: async function raceUnforfeit(onError, message, member) {
            /** @type {{ race: Race; }} */
            const { race } = message.channel;
            /** @type {{ team: EntrantTeam; }} */
            const { team } = member;

            if (!race.hasEntrant(member) || team.state !== TeamState.FORFEITED) {
                // can't unforfeit if you're not in the race/you didn't forfeit
                return;
            }

            team.state = TeamState.NOT_DONE;
            race.checkResume();
            message.acknowledge();
            (await team.endMessage.catch(onError))?.crossOut?.();
            team.endMessage = null;
        }
    },
    raceTeam: {
        names: [ "team" ],
        description: "Moves entrants/other teams into your team",
        usage: "[teamof] <@entrant or user ID 1> […]",
        category: HelpCategory.COOP_RACE,
        raceChannelOnly: true,
        onUse: async function raceTeam(onError, message, member, args) {
            /** @type {Discord.TextChannel & { race: Race; }} */
            const { guild, race } = message.channel;

            // can only run command if you've joined the race and it hasn't started
            if (!race.hasEntrant(member) || race.state !== RaceState.JOINING) {
                return;
            }

            if (!args) {
                this.showUsage(...arguments);
                return;
            }

            /** @type {{ team: EntrantTeam; }} */
            const { team } = member;
            const { maxTeamSize } = race.game.config.race;

            const teamChanges = [];

            const teamMembers = new Set(team);

            args = spacesAroundMentions(args);

            // split args at whitespace characters/commas
            const splitArgs = args.split(RegExp(`(${WHITESPACE}*,)?${WHITESPACE}+(and${WHITESPACE}+)?`));

            let nextIsTeam = false;
            for (let index = 0; index < splitArgs.length; index++) {
                let arg = splitArgs[index];

                if (arg.toLowerCase() === "teamof") {
                    if (nextIsTeam || index + 1 === splitArgs.length) {
                        this.showUsage(...arguments);
                        return;
                    }

                    nextIsTeam = true;
                    continue;
                }

                const id = getUserID(arg);
                if (!id) {
                    this.showUsage(...arguments);
                    return;
                }

                const mentionedMember = await guild.members.fetch(id).catch(noop);
                if (!mentionedMember || !race.hasEntrant(mentionedMember)) {
                    message.inlineReply(`${await guild.getUserName(id)} isn't racing here.`);
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

                if (nextIsTeam ? mentionedTeam.some(bind(teamMembers, "has")) : teamMembers.has(mentionedMember)) {
                    message.inlineReply(`You mentioned ${mentionedMember.cleanName} more than once.`);
                }

                if (nextIsTeam) {
                    nextIsTeam = false;
                    teamChanges.push(bind(team, "joinTeam", mentionedTeam));
                    for (let teamMember in mentionedTeam) {
                        teamMembers.add(teamMember);
                    }
                } else {
                    teamChanges.push(bind(team, "affiliateEntrant", mentionedMember));
                    teamMembers.add(mentionedMember);
                }

                if (teamMembers.size > maxTeamSize) {
                    message.inlineReply(`That would exceed the maximum team size of ${maxTeamSize}. Use \`${guild.commandPrefix}unteam\` first to part with your team.`);
                    return;
                }
            }

            for (let teamChange of teamChanges) {
                teamChange();
            }

            race.checkCategoryCoop();

            const members = team.map((member) => `${member.readyEmote} ${member.cleanName}`).join("\n  ");
            message.inlineReply(`${team}'s members were updated to:\n  ${members}${race.checkNotCountingDown()}`, { split: true });
        }
    },
    raceTeamname: {
        names: [ "teamname" ],
        description: "Changes/resets your team's name",
        usage: "[<team name>]",
        category: HelpCategory.COOP_RACE,
        raceChannelOnly: true,
        onUse: function raceTeamname(onError, message, member, args) {
            /** @type {{ race: Race; }} */
            const { race } = message.channel;
            /** @type {{ team: EntrantTeam; }} */
            const { team } = member;

            if (!race.hasEntrant(member) || race.state !== RaceState.JOINING) {
                // can only run command if you've joined the race and it hasn't started
                return;
            }

            if (!team.isCoop) {
                message.inlineReply("You can't choose a team name if you don't have any teammates.");
                return;
            }

            // get rid of multiple consecutive whitespace characters (including e.g. line feeds) and clean up
            const teamName = clean(args?.replace(WHITESPACE_PLUS, " ") ?? "", message);
            if (teamName.length === 0) {
                team.teamName = null;
                message.acknowledge();
                console.log(args);
                return;
            }

            if (race.teams.some((team2) => teamName === team2.teamName)) {
                message.inlineReply(`The team name "**${teamName}**" is already being used.`);
                return;
            }

            // discord nicknames have the same limitation of 32 characters
            if (teamName.length > 32) {
                message.inlineReply("Must be 32 or fewer in length.");
                return;
            }

            team.teamName = teamName;
            message.acknowledge();
        }
    },
    raceUnteam: {
        names: [ "unteam" ],
        aliases: [ "part" ],
        description:"Leaves your current team",
        category: HelpCategory.COOP_RACE,
        raceChannelOnly: true,
        onUse: function raceUnteam(onError, message, member) {
            /** @type {{ race: Race; }} */
            const { race } = message.channel;
            /** @type {{ team: EntrantTeam; }} */
            const { team } = member;

            // can only run command if you've joined the race and it hasn't started
            if (!race.hasEntrant(member) || race.state !== RaceState.JOINING) {
                return;
            }

            if (!team.isCoop) {
                message.inlineReply("You don't have a team to part with.");
                return;
            }

            team.remove(member);
            race.teams.push(new EntrantTeam(race, member));
            race.checkCategoryCoop();
            message.acknowledge();
        }
    },
    raceUnteamall: {
        names: [ "unteamall" ],
        aliases: [ "partall", "disbandall" ],
        description: "Disbands all current teams",
        category: HelpCategory.COOP_RACE,
        raceChannelOnly: true,
        onUse: function raceUnteamall(onError, message, member) {
            /** @type {{ race: Race; }} */
            const { race } = message.channel;

            // can only run command if you've joined the race and it hasn't started
            if (!race.hasEntrant(member) || race.state !== RaceState.JOINING || !race.hasCoopTeam) {
                return;
            }

            race.teams = race.entrants.map((entrant) => new EntrantTeam(race, entrant));
            race.category = race.category.forCoop(false);
            message.acknowledge();
        }
    },
    raceRandomteams: {
        names: [ "randomteams" ],
        description: "Randomly assigns entrants to teams of the given size (default is 2)",
        usage: "[<team size>]",
        category: HelpCategory.COOP_RACE,
        raceChannelOnly: true,
        onUse: function raceRandomteams(onError, message, member, args) {
            /** @type {{ race: Race; }} */
            const { race } = message.channel;

            // can only run command if you've joined the race and it hasn't started
            if (!race.hasEntrant(member) || race.state !== RaceState.JOINING) {
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

            const entrants = race.entrants;
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
                index++;
            }

            race.checkCategoryCoop();
            race.showJoiningEntrants(onError, message, `**${race}:**\n`, `**${race.gameCategoryLevel} race (cont):**\n`);
        }
    },
    raceClear: {
        names: [ "clearrace" ],
        description: "Ends the race without recording any results",
        category: HelpCategory.MOD,
        modOnly: true,
        raceChannelOnly: true,
        onUse: function raceClear(onError, message, member) {
            /** @type {{ race: Race; }} */
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

            message.acknowledge();
        }
    }
};
