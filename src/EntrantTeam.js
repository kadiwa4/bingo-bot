/// <reference path="./types.d.ts" />

import { TeamState } from "./enums.js";
import Race from "./Race.js";

import Discord from "discord.js";

/**
 * Represents a team of entrants (might be just one entrant)
 * @extends {Array<Discord.GuildMember>}
 */
export default class EntrantTeam extends Array {
    /**
     * Creates a new entrant team
     * @param {Race} race The race this team is part of
     * @param {...Discord.GuildMember} entrants The entrants to be put into this team
     */
    constructor(race, ...entrants) {
        // have to call array constructor to initialize the array correctly
        super();

        /** The race this team is part of */
        this.race = race;
        this.push(...entrants);
    }

    /**
     * The current team state during a race
     * @default TeamState.NOT_DONE
     */
    state = TeamState.NOT_DONE;

    /**
     * The time in seconds it took the team to finish
     * or null if not done
     * @type {?number}
     */
    doneTime = null;

    /**
     * The 1-based team place or null if not done
     * @type {?number}
     */
    place = null;

    /**
     * The difference in Elo points caused by the current race or null if not finished
     * (or when forfeited while others are still going)
     * @type {?number}
     */
    eloDifference = null;

    /**
     * Promise for the message that says that the team is done/has forfeited
     * or null if not finished
     * @type {?Promise<Discord.Message>}
     */
    endMessage = null;

    /**
     * Array containing the message that says that the team is done, split into 5 strings (or null):
     *  - Everything up to the place
     *  - The place as an ordinal number
     *  - Everything between place and Elo
     *  - The Elo difference
     *  - The rest of the message including the time
     * @type {?string[]}
     */
    splitDoneMessageContent = null;

    /**
     * The custom team name or null if none was chosen
     * @type {?string}
     */
    teamName = null;

    /**
     * The team ID the team had in the previous IL
     * or null if the team changed since the last race/no IL has happened yet
     * @type {?number}
     */
    previousTeamID = null;

    /**
     * The guild where the race is taking place
     * @readonly
     */
    get guild() {
        return this.leader.guild;
    }

    /**
     * Whether or not the team has more than one member
     * @readonly
     */
    get isCoop() {
        return this.length > 1;
    }

    /**
     * The first team member
     * @readonly
     */
    get leader() {
        return this[0];
    }

    /**
     * The custom team name or the leader's name.
     * Starts with "Team" if the team has more than one member
     * @type {string}
     * @readonly
     */
    get name() {
        return this.isCoop ? (this.teamName ?? `Team ${this.leader.cleanName}`) : this.leader.cleanName;
    }

    /**
     * Array containing all team member names
     * @type {string[]}
     * @readonly
     */
    get names() {
        return this.map((entrant) => entrant.cleanName);
    }

    /**
     * Moves the other team's members to the team
     * @param {EntrantTeam} team The other team
     */
    joinTeam(team) {
        this.race.teams.remove(team);
        this.push(...team);
    }

    /**
     * Moves the entrant to this team
     * @param {Discord.GuildMember} entrant The entrant to move
     */
    affiliateEntrant(entrant) {
        entrant.team.remove(entrant);
        this.push(entrant);
    }

    /**
     * Adds entrants to the team and returns the new length of the array
     * @param {...Discord.GuildMember} entrants Entrants to add
     */
    push(...entrants) {
        this.previousTeamID = null;
        for (let entrant of entrants) {
            entrant.team = this;
        }

        return super.push(...entrants);
    }

    /**
     * Removes team members from the team and dissolves it if it is empty
     * @param {...Discord.GuildMember} teamMembers Team members to remove from the team
     */
    remove(...teamMembers) {
        this.previousTeamID = null;
        super.remove(...teamMembers);

        if (this.length === 1) {
            this.teamName = null;
        } else if (this.length < 1) {
            this.race.teams.remove(this);
        }
    }

    /**
     * Whether or not everyone in the team is ready
     * @readonly
     */
    get isReady() {
        return this.every((teamMember) => teamMember.isReady);
    }

    /**
     * The average IL score of the team members
     * @readonly
     * @type {number}
     */
    get ilScoreAverage() {
        return this.reduce((teamMember1, teamMember2) => teamMember1.ilScore + teamMember2.ilScore) / this.length;
    }

    /**
     * Gets the team Elo
     * @param {string} [gameName] The game name
     * @param {string} [categoryName] The category name
     * @return {number}
     */
    getElo(gameName, categoryName) {
        const { sqlite } = this.guild;
        const eloConfig = this.race.game.config.race.elo;

        if (!gameName) {
            gameName = this.race.game.name;
            categoryName = this.race.category.name;
        }

        const elos = [];

        for (let entrant of this) {
            const entrantStats = sqlite.getUserEloForCategory.get(entrant.id, gameName, categoryName);
            elos.push(entrantStats ? entrantStats.elo : eloConfig.start);
        }

        // calculate team Elo as specified in the config
        // if the team has more than one member
        return this.isCoop ? eloConfig.calculateTeamElo(elos) : elos[0];
    }

    /**
     * Gets the team Elo as a string with the Elo emote
     * @param {string} [gameName] The game name
     * @param {string} [categoryName] The category name
     */
    eloString(gameName, categoryName) {
        // \xA0 is a non-breaking space
        return `${this.getElo(gameName, categoryName).toFixed()}\xA0${this.race.game.config.emotes.elo}`;
    }

    /**
     * Gets the team Elo difference as a string with the Elo emote
     * @readonly
     */
    get eloDifferenceString() {
        // \xA0 is a non-breaking space
        return `${(Math.round(100 * this.eloDifference) / 100).toDifference()}\xA0${this.race.game.config.emotes.elo}`;
    }

    /**
     * Calculates Elo difference by treating each other team as being in a 1v1 matchup against this team.
     * See https://en.wikipedia.org/wiki/Elo_rating_system
     * @param {string} [gameName] The game name
     * @param {string} [categoryName] The category name
     * @param {EntrantTeam[]} [teams] Array of teams
     * @param {EloConfig} [eloConfig] The Elo calculation config
     */
    calculateEloDifference(gameName, categoryName, teams = this.race.teams, eloConfig = this.race.game.config.race.elo) {
        let eloDifference = 0;
        const elo = this.getElo(gameName, categoryName);
        for (let team of teams) {
            if (this === team) {
                // don't compare Elo with this team
                continue;
            }

            // the score is a number between 0 and 1:
            //   0: loss
            // 0.5: tie
            //   1: win
            // it's then multiplied by the max Elo increase
            let actualScore = 0;

            // the expected score is an approximation of this score (anywhere between
            // 0 and 1) that is calculated by comparing the previous Elos.
            // the better the team (judging by the current Elos), the higher the expectations
            const expectedScore = eloConfig.maxEloGain / (1 + eloConfig.base ** ((elo - team.getElo(gameName, categoryName)) / eloConfig.dividend));

            if (this.state === TeamState.DONE) {
                if (team.state === TeamState.DONE) {
                    // calculate who was faster/if the teams tied
                    actualScore = eloConfig.maxEloGain * (1 + Math.sign(team.doneTime - this.doneTime)) / 2;
                } else {
                    // ahead of opponent (they're still going), count as win
                    actualScore = eloConfig.maxEloGain;
                }
            } else if (team.state === TeamState.FORFEITED) {
                // both teams forfeited, those two teams don't affect each other's scores
                continue;
            }

            // else forfeiting gives 0 points
            eloDifference += actualScore - expectedScore;
        }

        this.eloDifference = eloDifference;
        return eloDifference;
    }

    /**
     * Corrects the message that says the team is done
     * @param {number} placeDifference The increase/decrease in the place number
     */
    async correctDoneMessage(placeDifference) {
        this.calculateEloDifference();

        this.place += placeDifference;
        const splitContent = this.splitDoneMessageContent;
        this.splitDoneMessageContent = [
            splitContent[0],
            this.place.toOrdinal(),
            splitContent[2],
            this.eloDifferenceString,
            splitContent[4]
        ];

        (await this.endMessage).edit(this.splitDoneMessageContent.join(""));
    }

    /**
     * The team name in bold (markdown) if the team has more than one member
     * @readonly
     */
    get boldName() {
        const stars = this.isCoop ? "**" : "";

        return `${stars}${this.name}${stars}`
    }

    /** Returns the team name in bold (markdown) if the team has more than one member */
    toString() {
        return this.boldName;
    }
};
