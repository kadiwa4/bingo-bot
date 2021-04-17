import Command from "../Command.js";
import EntrantTeam from "../EntrantTeam.js";
import { HelpCategory, RaceState, TeamState } from "../enums.js";
import Game from "../Game.js";
import Race from "../Race.js";
import { assert, calculateEloMatchup, clean, formatTime, getUserID, increasePlace, MULTI_GAME, toTable, WHITESPACE } from "../misc.js";

import BetterSqlite3 from "better-sqlite3";
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

                    race.showJoiningEntrants(onError, message,
                        `**${race} is currently open with ${entrantCount} entrant${entrantCount === 1 ? "" : "s"}. Use \`${guild.commandPrefix}race\` to join!**\n`,
                        `**${race.gameCategoryLevel} race (cont):**\n`);

                    return;

                case RaceState.ACTIVE:
                case RaceState.DONE:
                    /** @param {EntrantTeam} team */
                    function teamMembers(team) {
                        return team.isCoop ? `\n  \t${team.names.join("\n  \t")}` : "";
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
                            .map((team) => `  ${race.game.placeEmote(team.place)} \`${formatTime(team.doneTime, false)}\` – ${team} (${team.eloChangeString})${teamMembers(team)}\n`);

                        // list racers still going
                        yield* racingTeams.map((team) => `  ${emotes.racing} \`--:--:--.--\` – ${team}${teamMembers(team)}\n`);

                        // list forfeited entrants
                        yield* forfeitedTeams.map((team) => (race.state === RaceState.DONE)
                            ? `  ${emotes.forfeited} \`--:--:--.--\` – ${team} (${team.eloChangeString})${teamMembers(team)}\n`
                            : `  ${emotes.forfeited} \`--:--:--.--\` – ${team}${teamMembers(team)}\n`);
                    });
            }
        }
    },
    raceResult: {
        names: [ "result" ],
        aliases: [ "results" ],
        description: "Shows the results of the given/last race",
        usage: "[<race ID>]",
        category: HelpCategory.STATS,
        guildDependent: true,
        onUse: async function raceResult(onError, message, member, args) {
            /** @type {Discord.GuildMember} */
            const { guild } = member;
            const { sqlite } = guild;

            if (guild.raceID === 1) {
                message.inlineReply("No races have happened yet.");
                return;
            }

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
                message.inlineReply("Race not found.");
                return;
            }

            /** @type {Game} */
            const game = guild.getGame(race.game);

            const messageStart = `**Result for ${game} / ${race.category}${race.level ? ` / ${race.level}` : ""} race (`;

            /** @returns {Promise<string>} */
            async function userOrTeamName(result) {
                return result.team_name
                    ? `**${result.team_name}**`
                    : await guild.getUserName(result.user_or_team_id);
            }

            async function teamMembers(result) {
                return result.team_name
                    ? `\t${(await Promise.all(sqlite.getTeamUserIDs.all(parseInt(result.user_or_team_id))
                        .map((userID) => guild.getUserName(userID))))
                        .join("\n\t")}\n`
                    : "";
            }

            let placeObject = { place: 1, tie: 1 };

            // \xA0 is a non-breaking space
            message.multiReply(onError, `${messageStart}ID\xA0\`${raceID}\`):**\n`,
                `${messageStart}cont):**\n`, async function*() {
                for (let result of sqlite.getResults.all(raceID)) {
                    const name = await userOrTeamName(result).catch(onError);
                    const members = await teamMembers(result).catch(onError);
                    assert(name && members !== undefined);

                    yield `  ${result.forfeited ? game.config.emotes.forfeited : game.placeEmote(placeObject.place)} \`${formatTime(result.time, false)}\` – ${name}\n${members}`;

                    if (!result.forfeited) {
                        increasePlace(placeObject, result.time);
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

            if (!race.category.isIL || (race.state !== RaceState.JOINING && race.state !== RaceState.COUNTDOWN && race.state !== RaceState.ACTIVE)) {
                // no IL race happening
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
                yield* toTable(race.ilResults, [ "id" ], true, (result) => `\t\`${result.id}\`: ${result.level} (${result.game.config.emotes.firstPlace} ${result.winnerTeamName})\n`);
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
                // \xA0 is a non-breaking space
                yield* toTable(memberStats, [ "place" ], false, async (stat, index) => `\`${stat.place}\` ${game.placeEmote(index + 1)}   \`${stat.elo.toFixed()}\`\xA0${game.config.emotes.elo} – ${await guild.getUserName(stat.user_id)}\n`);
            });
        }
    },
    raceFixElo: {
        names: [ "fixelo" ],
        aliases: [ "elofix" ],
        description: "Recalculates the Elo leaderboards",
        category: HelpCategory.MOD,
        modOnly: true,
        onUse: function raceFixElo(onError, message, member) {
            /** @type {Discord.GuildMember} */
            const { guild } = member;
            const { sqlite } = guild;

            if (guild.raceID === 1) {
                message.inlineReply("No races have happened yet.");
                return;
            }

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

            for (let row of sqlite.getAllResults.all()) {
                if (row.race_id !== raceID) {
                    if (previousGameName) {
                        recordRaceElo(sqlite, teams, raceID, previousGameName, previousCategoryName);
                    }

                    if (previousGameName !== row.game) {
                        previousGameName = row.game;
                        eloConfig = guild.getGame(row.game).config.race.elo;
                    }

                    raceID = row.race_id;
                    teams = [];
                    previousCategoryName = row.category;
                }

                recalculateElo(sqlite, eloConfig, row, teams, row.game, row.category);
            }

            recordRaceElo(sqlite, teams, raceID, previousGameName, previousCategoryName);

            message.acknowledge(member);
        }
    },
    raceRemove: {
        names: [ "removerace" ],
        aliases: [ "deleterace" ],
        description: "Deletes the given race",
        usage: "<race ID>",
        category: HelpCategory.MOD,
        modOnly: true,
        onUse: function raceRemove(onError, message, member, args) {
            /** @type {Discord.GuildMember} */
            const { guild } = member;
            const { sqlite } = guild;

            const raceID = parseInt(args);
            if (Number.isNaN(raceID) || raceID <= 0) {
                this.showUsage(...arguments);
                return;
            }

            const race = sqlite.getRace.get(raceID);
            if (!race) {
                message.inlineReply("Race not found.");
                return;
            }

            const eloConfig = guild.getGame(race.game).config.race.elo;
            const resultsSinceRace = sqlite.getResultsSinceRace.all(raceID, race.game, race.category);

            let placeObject = { place: 1, tie: 1 };
            function revertUserStat(userID, row) {
                const stat = sqlite.getUserStat.get(userID, race.game, race.category);
                if (stat.race_count === 1) {
                    sqlite.deleteUserStat.run(userID, race.game, race.category);
                    return;
                }

                stat.race_count--;
                if (stat.pb === row.time) {
                    stat.pb = null;
                }

                if (row.time === null) {
                    stat.forfeit_count--;
                } else {
                    const placeWord = [ null, "first", "second", "third" ][placeObject.place];
                    if (placeWord) {
                        stat[`${placeWord}_place_count`]--;
                    }

                    increasePlace(placeObject, row.time);
                }

                sqlite.addUserStat.run(stat);
            }

            for (let row of resultsSinceRace) {
                if (row.team_name) {
                    for (let teamMember of sqlite.getTeamUserIDsAndElo.all(row.user_or_team_id, race.game, race.category)) {
                        sqlite.updateUserElo.run(teamMember.elo - row.elo_change, teamMember.user_id, race.game, race.category);

                        if (row.race_id === raceID) {
                            revertUserStat(teamMember.user_id, row);
                        }
                    }
                } else {
                    const elo = sqlite.getUserElo.get(row.user_or_team_id, race.game, race.category);
                    sqlite.updateUserElo.run(elo - row.elo_change, row.user_or_team_id, race.game, race.category);

                    if (row.race_id === raceID) {
                        revertUserStat(row.user_or_team_id, row);
                    }
                }
            }

            for (let teamID of sqlite.getResultTeamIDs.all(raceID)) {
                if (sqlite.getTeamRaceCount.get(teamID) === 1) {
                    sqlite.deleteTeam.run(teamID);
                }
            }

            const teamCount = sqlite.getRaceTeamCount.get(raceID);

            sqlite.deleteRace.run(raceID);
            sqlite.deleteResults.run(raceID);

            // remove deleted race from resultsSinceRace
            resultsSinceRace.splice(0, teamCount);

            raceID = 0;
            let teams;
            for (let row of resultsSinceRace) {
                if (row.race_id !== raceID) {
                    if (raceID !== 0) {
                        recordRaceElo(sqlite, teams, raceID, race.game, race.category);
                    }

                    raceID = row.race_id;
                    teams = [];
                }

                recalculateElo(sqlite, eloConfig, row, teams, race.game, race.category);
            }

            if (resultsSinceRace.length > 0) {
                recordRaceElo(sqlite, teams, raceID, race.game, race.category);
            }

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
        description: "Shows a user's race stats",
        usage: "<user> / <game name>",
        category: HelpCategory.STATS,
        guildDependent: true,
        onUse: async function raceRunner(onError, message, member, args) {
            if (!args) {
                this.showUsage(...arguments);
                return;
            }

            /** @type {Discord.GuildMember} */
            const { guild } = member;

            const splitArgs = args.split("/");
            if (!splitArgs) {
                this.showUsage(...arguments);
                return;
            }

            let id;
            let userName;

            const mentionedMember = await guild.getMember(splitArgs[0]);
            if (mentionedMember) {
                id = mentionedMember.id;
                userName = mentionedMember.cleanName;
            } else {
                id = getUserID(splitArgs[0]);
                if (!id) {
                    message.inlineReply(`User “${splitArgs[0]}” not found.`, { split: true });
                    return;
                }

                userName = await guild.getUserName(id);

                if (!userName) {
                    message.inlineReply(`User ${id} not found.`);
                    return;
                }
            }

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

    let fullGameIndex = 0;
    const stats2 = [];
    for (let stat of stats) {
        if (stat.il) {
            stats2.push(stat);
        } else {
            stats2.splice(fullGameIndex, 0, stat);
            fullGameIndex++;
        }
    }

    const messageStart = `**${fromMeCmd ? "Your" : `${userName}'s`} ${game} stats`;
    message.multiReply(onError, `${messageStart}:**\n`, `${messageStart} (cont):**\n`, function*() {
        if (stats2.length === 0) {
            return;
        }

        yield* toTable(stats2, [ "race_count", "first_place_count", "second_place_count", "third_place_count", "forfeit_count" ], false, (stat) =>
            // \xA0 is a non-breaking space
            `  ${stat.category}:\n\t${emotes.done}\xA0\`${stat.race_count
            }\`   ${emotes.firstPlace}\xA0\`${stat.first_place_count
            }\`   ${emotes.secondPlace}\xA0\`${stat.second_place_count
            }\`   ${emotes.thirdPlace}\xA0\`${stat.third_place_count
            }\`   ${emotes.forfeited}\xA0\`${stat.forfeit_count
            }\`   ${emotes.elo}\xA0\`${Math.floor(stat.elo).toString().padStart(4)
            }\`   ${emotes.racing}\xA0\`${formatTime(stat.pb, false)}\`\n`);
    });
}

/**
 * @param {BetterSqlite3.Database} sqlite
 * @param {Config.Elo} eloConfig
 * @param {object} row
 * @param {object[]} teams
 * @param {string} game
 * @param {string} category
 */
function recalculateElo(sqlite, eloConfig, row, teams, game, category) {
    const team1 = {
        userOrTeamID: row.user_or_team_id,
        oldElo: null,
        eloChange: 0,
        time: row.time,
        state: row.time ? TeamState.DONE : TeamState.FORFEITED
    };

    if (row.team_name) {
        team1.teamName = row.team_name;
        team1.members = sqlite.getTeamUserIDsAndElo.all(parseInt(team1.userOrTeamID), game, category);
        team1.oldElo = eloConfig.calculateTeamElo(team1.members.map((member) => member.elo));
    } else {
        team1.oldElo = sqlite.getUserElo.get(team1.userOrTeamID, game, category);
    }

    const team1Length = team1.members?.length ?? 1;

    for (let team2 of teams) {
        let eloChange = calculateEloMatchup(team1.oldElo, team1.state, team1.time, team2.oldElo, team2.state, team2.time, eloConfig);

        team1.eloChange += eloChange * (team2.members?.length ?? 1);
        team2.eloChange -= eloChange * team1Length;
    }

    teams.push(team1);
}

/**
 * @param {BetterSqlite3.Database} sqlite
 * @param {object[]} teams
 * @param {number} raceID
 * @param {string} game
 * @param {string} category
 */
function recordRaceElo(sqlite, teams, raceID, game, category) {
    for (let team of teams) {
        if ("members" in team) {
            sqlite.updateCoopEloChange.run(team.eloChange, raceID, team.userOrTeamID);
            for (let member of team.members) {
                sqlite.updateUserElo.run(member.elo + team.eloChange, member.user_id, game, category);
            }
        } else {
            sqlite.updateSoloEloChange.run(team.eloChange, raceID, team.userOrTeamID);
            sqlite.updateUserElo.run(team.oldElo + team.eloChange, team.userOrTeamID, game, category);
        }
    }
}
