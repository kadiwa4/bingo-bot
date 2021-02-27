import Command from "../Command.js";
import EntrantTeam from "../EntrantTeam.js";
import { HelpCategory, RaceState, TeamState } from "../enums.js";
import Game from "../Game.js";
import Race from "../Race.js";
import { assert, calculateEloMatchup, clean, formatTime, FROZEN_ARRAY, getUserID, log, MULTI_GAME, toTable, WHITESPACE, WHITESPACE_PLUS } from "../misc.js";

import Discord from "discord.js";

export const id = "race_info";
export const dependencyIDs = [ "race_control" ];

/** @type {NodeJS.Dict<Command>} */
export const commands = {
    raceStatus: {
        names: [ "status", "s" ],
        description: "Shows the current race status",
        category: HelpCategory.STATS,
        raceChannelOnly: true,
        onUse: function raceStatus(onError, message) {
            /** @type {Discord.TextChannel & { race: Race; }} */
            const { guild, race } = message.channel;
            const { emotes } = race.game.config;

            switch (race.state) {
                case RaceState.NO_RACE:
                    message.inlineReply("No race currently happening here.");
                    return;

                case RaceState.JOINING:
                case RaceState.COUNTDOWN:
                    const entrantCount = race.entrants.length;

                    race.showJoiningEntrants(onError, message, `**${race} is currently open with ${entrantCount
                        } entrant${entrantCount === 1 ? "" : "s"}. Use \`${guild.commandPrefix}race\` to join!**\n`,
                        `**${race.gameCategoryLevel} race (cont):**\n`);

                    return;

                case RaceState.ACTIVE:
                case RaceState.DONE:
                    /** @param {EntrantTeam} team */
                    function teamMembers(team) {
                        return team.isCoop ? `\n\t${team.names.join("\n\t")}` : "";
                    }

                    /** @type {EntrantTeam[]} */
                    const doneTeams = [];
                    /** @type {EntrantTeam[]} */
                    const racingTeams = [];
                    /** @type {EntrantTeam[]} */
                    const forfeitedTeams = [];
                    for (let team of race.teams) {
                        ({
                            [TeamState.DONE]: doneTeams,
                            [TeamState.NOT_DONE]: racingTeams,
                            [TeamState.FORFEITED]: forfeitedTeams
                        })[team.state].push(team);
                    }

                    // say race is done if it is, otherwise say it's in progress and show the time
                    message.multiReply(onError, `**${race} is ${race.state === RaceState.ACTIVE
                            ? `in progress. Current time: ${formatTime(Date.now() / 1000 - race.startTime)}`
                            : `done!${race.everyoneForfeited ? "" : " Results will be recorded soon."}`}**\n`,
                            `**${race.gameCategoryLevel} race (cont):**\n`, function*() {
                        // list done entrants
                        yield* doneTeams.sort((team1, team2) => team1.doneTime - team2.doneTime)
                            .map((team) => `  \`${formatTime(team.doneTime, false)}\` – ${race.game.placeEmote(team.place)
                            } ${team} (${team.eloDifferenceString})${teamMembers(team)}\n`);

                        // list racers still going
                        yield* racingTeams.map((team) => `  ${emotes.racing} ${team}${teamMembers(team)}\n`);

                        // list forfeited entrants
                        yield* forfeitedTeams.map((team) => (race.state === RaceState.DONE)
                            ? `  ${emotes.forfeited} ${team} (${team.eloDifferenceString})${teamMembers(team)}\n`
                            : `  ${emotes.forfeited} ${team}${teamMembers(team)}\n`);
                    });
            }
        }
    },
    raceResult: {
        names: [ "result" ],
        aliases: [ "results" ],
        description: "Shows the results of the specified race ID or the last race",
        usage: "[<race ID>]",
        category: HelpCategory.STATS,
        guildDependent: true,
        onUse: async function raceResult(onError, message, member, args) {
            /** @type {Discord.GuildMember} */
            const { guild } = member;

            const { sqlite } = guild;
            let raceID = guild.raceID - 1;

            if (args) {
                raceID = parseInt(args);
                if (Number.isNaN(raceID) || raceID <= 0) {
                    this.showUsage(...arguments);
                    return;
                }
            }

            /** @type {object[]} */
            const race = sqlite.getRace.get(raceID);
            if (!race) {
                message.inlineReply(`Result for race ID \`${raceID}\` not found.`);
                return;
            }

            /** @type {Game} */
            const game = guild.getGame(race.game);

            const messageStart = `**Result for ${game} / ${race.category}${race.level ? ` / ${race.level}` : ""} race (`;

            /** @returns {Promise<string>} */
            async function userOrTeamName(result) {
                return result.team
                    ? `**${result.team_name}**`
                    : await guild.getUserName(result.user_or_team_id);
            }

            async function teamMembers(result) {
                return result.team
                    ? `\t${(await Promise.all(sqlite.getTeamUserIDs.all(parseInt(result.user_or_team_id))
                        .map((userID) => guild.getUserName(userID))))
                        .join("\n\t")}\n`
                    : "";
            }

            let place = 1;
            let tie = 1;
            let previousTime;
            message.multiReply(onError, `${messageStart}ID\xA0\`${raceID}\`):**\n`,
                `${messageStart}cont):**\n`, async function*() {
                for (let result of sqlite.getResults.all(raceID)) {
                    const name = await userOrTeamName(result).catch(onError);
                    const members = await teamMembers(result).catch(onError);
                    assert(name && members !== undefined);

                    yield `  ${result.forfeited ? game.config.emotes.forfeited : game.placeEmote(place)
                        } \`${formatTime(result.time, false)}\` – ${name}\n${members}`;

                    if (result.forfeited) {
                        continue;
                    }

                    if (previousTime === result.time) {
                        tie++;
                    } else {
                        previousTime = result.time;
                        place += tie;
                        tie = 1;
                    }
                }
            });
        }
    },
    raceIlresults: {
        names: [ "ilresults" ],
        aliases: [ "ilresult" ],
        description: "Shows the ILs that have been raced so far in this series",
        category: HelpCategory.IL_RACE,
        raceChannelOnly: true,
        onUse: function raceIlresults(onError, message) {
            /** @type {{ race: Race; }} */
            const { race } = message.channel;

            if (!race.category.isIL || (race.state !== RaceState.JOINING || race.state !== RaceState.ACTIVE)) {
                return;
            }

            if (race.ilResults.length === 0) {
                message.inlineReply("No ILs have been finished yet in this series.");
                return;
            }

            // if people do too many ILs, it might break the message limit,
            // so it gets split over multiple messages
            const messageStart = `**Results for current IL series (`;

            message.multiReply(onError, `${messageStart}listed by race ID):**\n`,
                `${messageStart}cont):**\n`, function*() {
                for (let result of race.ilResults) {
                    yield `\t${result.id}: ${result.level} (${result.game.config.emotes.firstPlace} ${result.winnerTeamName})\n`;
                }
            });
        }
    },
    raceLeaderboard: {
        names: [ "leaderboard" ],
        aliases: [ "elo" ],
        description: "Shows the Elo leaderboard for the current/given game / category",
        usage: "<game name> / <category name>",
        category: HelpCategory.STATS,
        guildDependent: true,
        onUse: async function raceLeaderboard(onError, message, member, args) {
            /** @type {Discord.GuildMember} */
            const { guild } = member;
            const { sqlite } = guild;

            /** @type {?Game} */
            let game;
            /** @type {string} */
            let categoryName;

            let customCategory = false;
            if (args) {
                const splitArgs = args.split(RegExp(`${WHITESPACE}*/${WHITESPACE}*`));
                if (splitArgs.length !== 2) {
                    this.showUsage(...arguments);
                    return;
                }

                game = guild.getGame(splitArgs[0]);
                if (!game) {
                    message.inlineReply("Game not found.");
                    return;
                }

                const category = game.getCategory(splitArgs[1]);
                if (!category) {
                    log(category);
                    categoryName = clean(splitArgs[1], message);
                    customCategory = true;
                } else {
                    categoryName = category.name;
                    if (category.multiGame) {
                        game = guild.games[MULTI_GAME];
                    }
                }
            } else {
                /** @type {{ race: Race; }} */
                const { race } = message.channel;

                if (!race) {
                    message.inlineReply("You're not in a race channel and didn't specify the game / category.");
                    return;
                }

                if (race.state === RaceState.NO_RACE) {
                    message.inlineReply("No race currently happening, please specify game / category.");
                    return;
                }

                game = race.game;
                categoryName = race.category.name;
            }

            const memberStats = sqlite.getLeaderboard.all(game.name, categoryName);
            if (memberStats.length === 0) {
                message.inlineReply(customCategory ? "Category not found."
                    : `No leaderboard found for ${game.name} / ${categoryName}.`);
                return;
            }

            const messageStart = `**Elo Rankings for ${game} / ${categoryName}`;
            message.multiReply(onError, `${messageStart}:**\n`, `${messageStart} (cont):**\n`, async function*() {
                yield* toTable(memberStats, [ "place" ], async (stat, index) => {
                    // \xA0 is a non-breaking space
                    return `\`${stat.place}\` ${game.placeEmote(index + 1)}   \`${stat.elo}\`\xA0${game.config.emotes.elo} – ${await guild.getUserName(stat.user_id)}\n`;
                });
            });
        }
    },
    raceFixElo: {
        names: [ "fixelo" ],
        description: "Recalculates the Elo leaderboards",
        category: HelpCategory.MOD,
        modOnly: true,
        onUse: function raceFixElo(onError, message, member) {
            /** @type {Discord.GuildMember} */
            const { guild } = member;
            const { sqlite } = guild;

            if (Date.now() < guild.fixEloTimestamp) {
                message.inlineReply(`${this.toString(guild)} has a 10 minute cooldown.`);
                return;
            }

            guild.fixEloTimestamp = Date.now() + 600000;

            // reset all Elo points
            for (let gameName of sqlite.getGames.all()) {
                sqlite.updateAllGameElos.run({
                    game: gameName,
                    elo: guild.getGame(gameName).config.race.elo.start
                });
            }

            /** @type {Config.Elo} */
            let eloConfig;
            let raceID = 0;
            let teams;
            let previousGameName;
            let previousCategoryName;

            function recordRace() {
                const updateEloObject = {
                    game: previousGameName,
                    category: previousCategoryName
                };

                for (let team of teams) {
                    updateEloObject.elo = team.newElo;

                    function updateElo(userID) {
                        updateEloObject.user_id = userID;
                        sqlite.updateElo.run(updateEloObject);
                    }

                    if (Array.isArray(team.userIDOrIDs)) {
                        for (let userID of team.userIDOrIDs) {
                            updateElo(userID);
                        }
                    } else {
                        updateElo(team.userIDOrIDs);
                    }
                }
            }

            for (let row of sqlite.getAllResults.all()) {
                if (row.race_id !== raceID) {
                    if (previousGameName) {
                        recordRace(row);
                    }

                    eloConfig = guild.getGame(row.game).config.race.elo;
                    raceID = row.race_id;
                    teams = [];
                    previousGameName = row.game;
                    previousCategoryName = row.category;
                }

                const userIDOrIDs = row.coop
                    ? sqlite.getTeamUserIDs.all(parseInt(row.user_or_team_id))
                    : row.user_or_team_id;

                const oldElo = row.coop
                    ? eloConfig.calculateTeamElo(userIDOrIDs.map((userID) => sqlite.getUserEloForCategory.get(userID, row.game, row.category)))
                    : sqlite.getUserEloForCategory.get(userIDOrIDs, row.game, row.category);

                let newElo = oldElo;

                const state = row.forfeited ? TeamState.FORFEITED : TeamState.DONE;

                for (let team2 of teams) {
                    const eloChange = calculateEloMatchup(oldElo, state, row.time, team2.oldElo, team2.state, team2.state, eloConfig);

                    newElo += eloChange;
                    team2.newElo -= eloChange;
                }

                teams.push({
                    userIDOrIDs,
                    coop: row.coop,
                    oldElo,
                    newElo,
                    time: row.time,
                    state
                });
            }

            recordRace();

            message.acknowledge();
        }
    },
    raceMe: {
        names: [ "me" ],
        description: "Shows your race stats for a game",
        usage: "<game name>",
        category: HelpCategory.STATS,
        guildDependent: true,
        onUse: function raceMe(onError, message, member, args) {
            if (!args) {
                this.showUsage(...arguments);
                return;
            }

            showUserStats(onError, member.guild, message, member.id, member.cleanName, args, true);
        }
    },
    raceRunner: {
        names: [ "runner" ],
        description: "Shows a member's race stats",
        usage: "<@member or user ID> <game name>",
        category: HelpCategory.STATS,
        guildDependent: true,
        onUse: async function raceRunner(onError, message, member, args) {
            if (!args) {
                this.showUsage(...arguments);
                return;
            }

            /** @type {Discord.GuildMember} */
            const { guild } = member;

            const splitArgs = args.split(WHITESPACE_PLUS);
            const id = getUserID(splitArgs[0]);

            if (!id) {
                this.showUsage(...arguments);
                return;
            }

            const userName = await guild.getUserName(id);
            const gameInput = splitArgs.slice(1).join("");
            showUserStats(onError, guild, message, id, userName, gameInput, false);
        }
    }
};

/**
 * For !me and !runner
 * @param {(error) => void} onError
 * @param {Discord.Guild} guild
 * @param {Discord.Message} message
 * @param {string} userID
 * @param {string} userName
 * @param {Game} gameInput
 * @param {boolean} fromMeCmd
 */
function showUserStats(onError, guild, message, userID, userName, gameInput, fromMeCmd) {
    const game = guild.getGame(gameInput);
    if (!game) {
        message.inlineReply("Game not found.");
        return;
    }

    const { sqlite } = guild;
    const { emotes } = game.config;

    /** @type {object[]} */
    const stats = sqlite.getUserStatsForGame.all(userID, game.name);
    if (stats.length === 0) {
        message.inlineReply(`${fromMeCmd ? "You have" : `${userName} has`}n't done any ${game} races yet.`);
        return;
    }

    const ilStats = [];
    let index = 0;
    for (let stat of stats) {
        if (stat.il) {
            ilStats.push(stats.splice(index, 1)[0]);
        }

        index++;
    }

    /**
     * @param {object[]} stats
     * @returns {any[]}
     */
    function table(stats) {
        if (stats.length === 0) {
            return FROZEN_ARRAY;
        }

        return toTable(stats, [ "race_count", "first_place_count", "second_place_count", "third_place_count", "forfeit_count" ], (stat) =>
            // \xA0 is a non-breaking space
            `  ${stat.category}:\n\t${emotes.done}\xA0\`${stat.race_count
            }\`   ${emotes.firstPlace}\xA0\`${stat.first_place_count
            }\`   ${emotes.secondPlace}\xA0\`${stat.second_place_count
            }\`   ${emotes.thirdPlace}\xA0\`${stat.third_place_count
            }\`   ${emotes.forfeited}\xA0\`${stat.forfeit_count
            }\`   ${emotes.elo}\xA0\`${Math.floor(stat.elo).toString().padStart(4)
            }\`   ${emotes.racing}\xA0\`${formatTime(stat.pb, false)}\`\n`);
    }

    const messageStart = `**${fromMeCmd ? "Your" : `${userName}'s`} ${game} stats`;
    message.multiReply(onError, `${messageStart}:**\n`, `${messageStart} (cont):**\n`, function*() {
        yield* table(stats);
        yield* table(ilStats);
    });
}
