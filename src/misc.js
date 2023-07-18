/// <reference path="./types.d.ts" />
import { TeamState } from "./enums.js";

import assert from "node:assert";
import https from "node:https";
import util from "node:util";

import BetterSqlite3 from "better-sqlite3";
import { BufferList } from "bl";
import Discord from "discord.js";

/** to stay consistent with how String#trim() behaves */
export const WHITESPACE = "[\\s\\uFEFF\\xA0]";
export const FROZEN_ARRAY = Object.freeze([]);
export const MULTI_GAME = "Multiple Games";
export const WHITESPACE_PLUS = new RegExp(`${WHITESPACE}+`, "g");

export function noop() {}

/**
 * Adds the member to the user_names table or updates it
 * @param {Discord.GuildMember} member
 */
export function addUserNames(member) {
	let nickname = null;
	if (member.id === "159245797328814081") {
		nickname = "bean";
	} else if (member.nickname) {
		nickname = member.cleanName;
	}

	member.guild.sqlite.addUserNames.run({
		user_id: member.id,
		name: member.user.username,
		nickname,
	});
}

/**
 * For the given function (property `functionKey` of `object`), creates
 * a bound function that has the same body as the original function
 * @template {{ bind(thisArg: any, ...argArray: any[]): F; }} F
 * @param {*} object
 * @param {string | number} functionKey
 * @param {any[]} args
 * @returns {F}
 */
export function bind(object, functionKey, ...args) {
	return object[functionKey].bind(object, ...args);
}

/**
 * Calculates the Elo difference for a 1v1 matchup between two entrant teams
 * @param {number} team1Elo Team 1's Elo before the race
 * @param {TeamState} team1State Team 1's current TeamState
 * @param {number} team1Time Team 1's time in seconds
 * @param {number | (() => number)} team2Elo Team 2's Elo before the race or a function returning it
 * @param {TeamState} team2State Team 2's current TeamState
 * @param {number} team2Time Team 2's time in seconds
 * @param {Config.Elo} eloConfig The Elo calculation configuration
 */
export function calculateEloMatchup(team1Elo, team1State, team1Time, team2Elo, team2State, team2Time, eloConfig) {
	// the score is a number between 0 and 1:
	//   0: loss
	// 0.5: tie
	//   1: win
	// it's then multiplied by the max Elo increase

	if (team1State === TeamState.FORFEITED && team2State === TeamState.FORFEITED) {
		// both teams forfeited, those two teams don't affect each other's scores
		return 0;
	}

	if (team2Elo instanceof Function) {
		team2Elo = team2Elo();
	}

	// the expected score is an approximation of the score (anywhere between
	// 0 and 1) that is calculated by comparing the previous Elos.
	// the better the team (judging by the current Elos), the higher the expectations
	// it's then multiplied by the max Elo increase
	const expectedScore = eloConfig.maxEloGain / (
		1 + eloConfig.base ** ((team2Elo - team1Elo) / eloConfig.dividend)
	);

	if (team1State === team2State) {
		// both teams finished
		// calculate who was faster/if the teams tied
		return (eloConfig.maxEloGain / 2) * (1 + Math.sign(team2Time - team1Time)) - expectedScore;
	}

	// else determine who finished
	return eloConfig.maxEloGain * +(team1State === TeamState.DONE) - expectedScore;
}

/**
 * Escapes any Discord-flavour markdown and mentions in a string
 * @param {string} text The string to escape
 * @param {Discord.Message} message The message containing that string
 */
export function clean(text, message) {
	return Discord.escapeMarkdown(Discord.cleanContent(text, message));
}

/**
 * Escapes any Discord-flavour markdown and mentions in a name
 * @param {string} name The string to escape
 */
export function cleanName(name) {
	// \u200B is a zero-width space
	return Discord.escapeMarkdown(name.replace(/<(#|@[!&]?)(\d+>)/, "<$1\u200B$2"));
}

/**
 * Formats a time in (HH:)mm:ss.ss
 * @param {number} time The time in seconds
 * @param {boolean} [canHideHours] Whether to hide the first 2 digits if the time is sub 1 hour
 * @returns {string}
 */
export function formatTime(time, canHideHours = true) {
	let sliceStart = (canHideHours && time < 3600) ? -10 : -13;
	return !time
		? `${canHideHours ? "" : "--:"}--:--.--`
		: `${(time < 0) ? "−" : ""}${new Date(Math.abs(1000 * time)).toISOString().slice(sliceStart, -2)}`;
}

/**
 * Formats a positive time in HH:mm:ss.ss, removing all leading zeros
 * @param {number} time The time in seconds
 * @returns {string}
 */
export function formatTimeShort(time) {
	let sliceStart;
	if (time < 10) {
		sliceStart = -6;
	} else if (time < 60) {
		sliceStart = -7;
	} else if (time < 600) {
		sliceStart = -9;
	} else if (time < 3600) {
		sliceStart = -10;
	} else if (time < 36000) {
		sliceStart = -12;
	} else {
		sliceStart = -13;
	}
	return new Date(1000 * time).toISOString().slice(sliceStart, -2);
}

/**
 * Gets the user ID from the user's input or null
 * @param {string} input The user input
 * @returns {?string}
 */
export function getUserID(input) {
	input = input.trim();
	const match = input.match(/^<@!?(\d{17,19})>$/) ?? input.match(/^(\d{17,19})$/);
	return match?.[1] ?? null;
}

/**
 * Returns whether or not the object has at least one iterable property
 * @param {*} object
 * @returns {boolean}
 */
export function hasProperties(object) {
	for (let property in object) {
		return true;
	}

	return false;
}

/**
 * Gets a web page over HTTPS
 * @param {string} hostname The hostname
 * @param {string} path The path, starting with '/'
 * @returns {Promise<{ content: string; path: string; }>}
 */
export function httpsGet(hostname, path) {
	return new Promise((resolve, reject) => {
		https.get({
			hostname: hostname,
			path: path,
			port: 443,
			headers: { "User-Agent": "bingo-bot/0.2" },
		}, (message) => {
			const bufferList = new BufferList();
			const { statusCode, statusMessage } = message;
			if ([ 301, 302, 307, 308 ].includes(statusCode)) {
				resolve(httpsGet(hostname, message.headers.location));
				return;
			}

			if (statusCode !== 200) {
				reject(new StatusCodeError(`https://${hostname}${path} responded '${statusCode} ${statusMessage}'`, statusCode));
				return;
			}

			message.on("data", bind(bufferList, "append"));
			message.on("end", function onEnd() {
				resolve({ content: bufferList.toString("utf8"), path });
			});
		}).on("error", reject);
	});
}

export class StatusCodeError extends Error {
	/**
	 * @param {string} message
	 * @param {number} code
	 */
	constructor(message, code) {
		super();
		this.name = this.constructor.name;
		this.message = message;
		this.code = code;
	}
}

/**
 * Helper function for `result` and `removerace` commands to count places correctly
 * @param {{ place: number; tie: number; previousTime?: number; }} placeObject
 * @param {number} time
 */
export function increasePlace(placeObject, time) {
	if (placeObject.previousTime === time) {
		placeObject.tie += 1;
	} else {
		placeObject.previousTime = time;
		placeObject.place += placeObject.tie;
		placeObject.tie = 1;
	}
}

/**
 * Adds properties to `object` where the value is always
 * set to `outputValue`. The property names to be added are
 * `cleanedUpName` and each name in `aliases`
 * @example
 * invertObject(myCleanUpFn("LittleBigPlanet"), [ "lbp1", "1" ], allMyGames, lbp1Game);
 * // allMyGames afterwards: { "lbp": lbp1Game, "lbp1": lbp1Game, "1": lbp1Game }
 * @template T
 * @param {?string} cleanedUpName Name to be appended to `aliases` or null
 * @param {?readonly string[] | undefined} aliases The keys to be set in the output object
 * @param {NodeJS.Dict<T>} object The object to be changed
 * @param {T} outputValue The value to be set in the output object
 */
export function invertObject(cleanedUpName, aliases, object, outputValue) {
	/** @param {string} name */
	function add(name) {
		const conflictingProperty = object[name];
		if (conflictingProperty) {
			throw new Error(`Can't add property '${name}' to object because it already exists.\n1: ${conflictingProperty}\n2: ${outputValue}`);
		}

		object[name] = outputValue;
	}

	if (cleanedUpName) {
		add(cleanedUpName);
	}

	if (aliases) {
		for (let name of aliases) {
			add(name);
		}
	}
}

/**
 * Determines whether or not the member is a mod/an admin in the guild
 * @param {Discord.Message} message
 * @param {Discord.GuildMember} member
 * @returns {boolean}
 */
export function isMod(message, member) {
	let authorMember = message.member;
	if (!authorMember) {
		authorMember = member.guild.members.cache.get(message.author.id);
		assert(authorMember);
	}

	return (
		member.guild.ownerId === authorMember.id
		|| member.guild.modRoles.some((role) => authorMember.roles.cache.has(role.id))
	);
}

/**
 * Formats text for functions log and logError
 * @param {string} text The string to write
 * @param {Discord.Guild} [guild] The guild that is the cause
 */
export function logFormat(text, guild) {
	return `[${new Date().toISOString()}${guild ? ` ${guild.abbreviation}` : ""}] ${text}`;
}

/**
 * Writes a string and the current time to stdout. Returns the input
 * @param {string} text The string to write
 * @param {Discord.Guild} [guild] The guild that is the cause
 */
export function log(text, guild) {
	console.log(logFormat(text, guild));
	return text;
}

/**
 * Writes a string and the current time to stderr. Returns the input
 * @param {string} text The string to write
 * @param {Discord.Guild} [guild] The guild that is the cause
 */
export function logError(text, guild) {
	console.error(logFormat(text, guild));
	return text;
}

/**
 * Returns a new object without a prototype, those can be used as maps
 * @template T
 * @returns {NodeJS.Dict<T>}
 */
export function newMap() {
	return Object.create(null);
}

/**
 * Parses a user-input time and returns it as a number
 * @param {string} input
 * @returns {number | null}
 */
export function parseTime(input) {
	let match = input.match(/^(((\d\d?):)?(\d\d?):)?(\d\d?(\.\d{1,3})?)$/);
	if (match) {
		let time = parseFloat(match[5]);
		if (match[4]) {
			time += 60 * parseInt(match[4], 10);
			if (match[3]) {
				time += 3600 * parseInt(match[3], 10);
			}
		}
		return time;
	}

	match = input.match(/^((\d\d?)\s*(hr?|hours?)\s*)?((\d\d?)\s*(m|min(ute)?s?)\s*)?((\d\d?(\.\d{1,3})?)\s*(s|sec(ond)?s?))?$/);
	if (match && (match[9] || match[5] || match[2])) {
		let time = 0;
		if (match[9]) {
			time += parseFloat(match[9]);
		}
		if (match[5]) {
			time += 60 * parseInt(match[5], 10);
		}
		if (match[2]) {
			time += 3600 * parseInt(match[2], 10);
		}
		return time;
	}

	return null;
}

/** Returns a promise that resolves after the specified time */
export const setTimeoutPromise = util.promisify(setTimeout);

/**
 * Helps output an array of objects as a table
 * @param {any[]} array The array to output
 * @param {string[]} consistentWidthProperties Array of property names whose values should be paded with spaces on the left to ensure the same width in every row
 * @param {boolean} cloneObjects Whether or not to clone the objects in the array before changing them
 * @param {(item: any, index: number) => void} lineString Function that gets executed for every row
 */
export function toTable(array, consistentWidthProperties, cloneObjects, lineString) {
	if (array.length === 0) {
		return [];
	}

	const properties = new Set(consistentWidthProperties);
	const maxWidths = {};

	for (let name in array[0]) {
		if (properties.has(name)) {
			for (let item of array) {
				maxWidths[name] = Math.max(maxWidths[name] ?? 0, item[name].toString().length);
			}
		}
	}

	const returnValues = [];
	let index = 0;
	for (let item of array) {
		if (cloneObjects) {
			item = item.clone();
		}

		for (let name in item) {
			if (properties.has(name)) {
				item[name] = item[name].toString().padStart(maxWidths[name]);
			}
		}

		returnValues.push(lineString(item, index));
		index += 1;
	}

	return returnValues;
}

/**
* Creates a new SQLite table and optionally a unique index
* @param {string} tableName The table name
* @param {string} tableColumns The table's columns
* @param {string} [indexName] The name of the UNIQUE INDEX created on the table
* @param {string} [indexColumns] The UNIQUE INDEX' columns
*/
BetterSqlite3.prototype.createTable = function (tableName, tableColumns, indexName, indexColumns) {
	if (
		this.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?;")
			.pluck().get(tableName)
	) {
		return;
	}

	this.prepare(`CREATE TABLE ${tableName} (${tableColumns});`).run();

	if (indexName) {
		this.prepare(`CREATE UNIQUE INDEX ${indexName} ON ${tableName} (${indexColumns});`).run();
	}

	this.pragma("synchronous = NORMAL;");
	this.pragma("journal_mode = WAL;");
};

Object.defineProperties(Array.prototype, {
	remove: {
		/**
		 * Removes elements from the array
		 * @template T
		 * @this T[]
		 * @param {...T} items The items to remove
		 */
		value: function remove(...items) {
			for (let item of items) {
				const index = this.indexOf(item);
				if (index > -1) {
					this.splice(index, 1);
				}
			}
		},
	},
	shuffle: {
		/**
		 * Shuffles the elements in the array
		 * https://stackoverflow.com/a/12646864
		 * @this any[]
		 */
		value: function shuffle() {
			for (let i = this.length - 1; i > 0; i -= 1) {
				const j = Math.floor(Math.random() * (i + 1));
				[ this[i], this[j] ] = [ this[j], this[i] ];
			}
		},
	},
});

const signs = {
	"-1": "−", // This is not a hyphen, it's a minus sign
	"0": "±",
	"1": "+",
};

/**
 * Converts the number to a string that always starts with a sign
 * @this {number}
 */
Number.prototype.toDifference = function () {
	return `${signs[Math.sign(this)]}${Math.abs(this)}`;
};

/** Suffixes for function toOrdinal */
const ordinalSuffixes = [ null, "st", "nd", "rd" ];

/**
 * Converts the integer number to an English ordinal number
 * @this {number}
 */
Number.prototype.toOrdinal = function () {
	return `${this}${ordinalSuffixes[this / 10 % 10 ^ 1 && this % 10] ?? "th"}`;
};

Object.defineProperties(Object.prototype, {
	clone: {
		/** Returns a shallow copy of the object, the prototype is the same */
		value: function clone() {
			return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
		},
	},
	withPrototype: {
		/**
		 * Returns an object (might be a shallow copy) that uses the specified prototype
		 * @param {*} prototype The prototype the output object should use
		 */
		value: function withPrototype(prototype) {
			return prototype ? Object.assign(Object.create(prototype), this) : this;
		},
	},
	withPrototypeRecursive: {
		/**
		 * Returns an object (might be a deep copy) that uses the specified prototype and
		 * whose "simple" subobjects (simple dicts with curly brackets; e.g. `{ e: 3 }`) also have that prototype.
		 * Used for game-specific configuration in the guild config.
		 * @param {*} prototype The prototype the output object should use
		 */
		value: function withPrototypeRecursive(prototype) {
			if (!prototype) {
				return this;
			}

			const object = Object.create(prototype);

			for (let key in this) {
				object[key] = this[key]?.constructor === Object
					? this[key].withPrototypeRecursive(prototype[key])
					: this[key];
			}

			return object;
		},
	},
});

export class RateLimiter {
	constructor() {
		this.timestamp = 0;
	}

	/**
	 * @param {number} delayAfter The milliseconds of delay after this invocation of this function
	 */
	async wait(delayAfter) {
		const now = Date.now();
		if (this.timestamp < now) {
			this.timestamp = now + delayAfter;
		} else {
			let prevTimestamp = this.timestamp;
			this.timestamp += delayAfter;
			await setTimeoutPromise(prevTimestamp - now);
		}
	}
}
