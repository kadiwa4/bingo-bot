/// <reference path="./types.d.ts" />

import { TeamState } from "./enums.js";
import { bind, calculateEloMatchup } from "./misc.js";
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
     * @return {number}
     */
    getElo() {
        const { sqlite } = this.guild;
        const eloConfig = this.race.game.config.race.elo;

        const gameName = this.race.game.name;
        const categoryName = this.race.category.name;

        // calculate team Elo as specified in the config
        // if the team has more than one member
        return this.isCoop
            ? eloConfig.calculateTeamElo(this.map((member) => sqlite.getUserEloForCategory.get(member.id, gameName, categoryName) ?? eloConfig.start))
            : sqlite.getUserEloForCategory.get(this.leader.id, gameName, categoryName);
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
     */
    calculateEloDifference() {
        let eloDifference = 0;
        const elo = this.getElo();
        for (let team2 of this.race.teams) {
            if (this !== team2) {
                eloDifference += calculateEloMatchup(elo, this.state, this.doneTime,
                    bind(team2, "getElo"), team2.state, team2.doneTime, this.race.game.config.race.elo, true);;
            }
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
