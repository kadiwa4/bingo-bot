/**
 * The category where the command is shown in the !help command list
 * @enum {string}
 */
export const HelpCategory = {
	PRE_RACE: "Pre-race commands",
	MID_RACE: "Mid-race commands",
	COOP_RACE: "Co-op-race commands",
	IL_RACE: "IL-race commands",
	STATS: "Stat commands",
	OTHER: "Other commands",
	MOD: "Moderator-only commands",
};

/**
 * The race state
 * @enum {number}
 */
export const RaceState = {
	NO_RACE: 0,
	JOINING: 1,
	COUNTDOWN: 2,
	ACTIVE: 3,
	DONE: 4,
};

/**
 * The team state during a race
 * @enum {number}
 */
export const TeamState = {
	NOT_DONE: 0,
	DONE: 1,
	FORFEITED: 2,
};
