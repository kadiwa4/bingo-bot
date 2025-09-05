import Command from "../Command.js";
import { HelpCategory } from "../enums.js";
import { clean, httpsGet, isMod, log, logError, RateLimiter, StatusCodeError } from "../misc.js";

import assert from "node:assert";

import Discord from "discord.js";
import { decode } from "html-entities";

export const id = "roles";

/**
 * @param {Discord.Guild} guild
 * @param {GuildInput} guildInput
 * @see CommandModule.init
 */
export function init(guild, guildInput) {
	assert(guildInput.roles, "no config for command module roles");

	const { database } = guild;

	// set up tables for keeping track of speedrun.com user IDs
	database.createTable(
		"src_users",
		`discord_id TEXT PRIMARY KEY,
		src_id TEXT NOT NULL`
	);

	Object.assign(guild.sqlite, {
		// set up SQLite queries for setting/retrieving speedrun.com user IDs
		getAllSrcUsers: database.prepare("SELECT * FROM src_users;"),
		getSrcID: database.prepare("SELECT src_id FROM src_users WHERE discord_id = ?;").pluck(),
		addSrcUser: database.prepare("INSERT OR REPLACE INTO src_users (discord_id, src_id) VALUES (@discord_id, @src_id);"),
		deleteSrcUser: database.prepare("DELETE FROM src_users WHERE discord_id = ?;"),
	});

	guild.allSRRoles = guildInput.roles.init?.(guild);
	guild.getSRRoles = guildInput.roles.getRoles;
	guild.srcAPIFilter = guildInput.roles.srcAPIFilter;

	setUpdateAllRolesTimeout(guild);
}

/** @type {NodeJS.Dict<Command>} */
export const commands = {
	roles: {
		names: [ "roles" ],
		usage: "[<speedrun.com name>]",
		description: "Sets your roles to match races finished + speedrun.com PBs or updates roles",
		/** @param {Discord.GuildMember} member */
		onUse: async function roles(onError, message, member, args) {
			const { guild } = member;

			const srcID = guild.sqlite.getSrcID.get(member.id);
			if (!args || args === srcID) {
				if (!srcID) {
					message.inlineReply("Please specify your speedrun.com name.");
					return;
				}

				updateRoles(onError, message, member, srcID).catch(onError);
				return;
			}

			if (/[?&/%$!"#`^[\]\\()=+*:,;<>]|\s/.test(args)) {
				message.inlineReply("The speedrun.com name contains invalid characters.");
				return;
			}

			if (isMod(message, member)) {
				updateRoles(onError, message, member, args, true).catch(onError);
				return;
			}

			function onHTTPError(error) {
				if (error instanceof StatusCodeError && error.code === 404) {
					message.inlineReply("speedrun.com user not found.");
				} else {
					onError(error);
				}
			}

			const response = await callSRC(onHTTPError, `/users/${args}`);
			if (!response?.content) {
				return;
			}

			const tagMatch = response.content.match(/"networkId": ?5, ?"value": ?"([^"]+)"/);
			if (!tagMatch) {
				message.inlineReply(`Can't determine if the speedrun.com account is yours; make sure you've linked your Discord tag (\`${clean(member.user.tag, message)}\`) at <https://www.speedrun.com/users/${args}/settings/socials>.`);
				return;
			}

			const srcTag = decode(tagMatch[1]).replace(/#0$/, "");
			if (srcTag !== member.user.tag) {
				message.inlineReply(`The Discord tag specified on speedrun.com (${clean(srcTag, message)}) doesn't match your actual one (${clean(member.user.tag, message)}). You can update it at <https://www.speedrun.com/users/${args}/settings/socials>. If you have issues with this, contact a moderator.`);
				return;
			}

			updateRoles(onError, message, member, args, true).catch(onError);
		},
	},
	rolesRemove: {
		names: [ "removeroles" ],
		aliases: [ "clearroles", "deleteroles", "unroles" ],
		description: "Removes your speedrun roles",
		/** @param {Discord.GuildMember} member */
		onUse: function rolesRemove(onError, message, member) {
			const { guild } = member;

			guild.sqlite.deleteSrcUser.run(member.id);
			updateRoles(onError, message, member, null).catch(onError);
		},
	},
	rolesUpdate: {
		names: [ "updateroles" ],
		aliases: [ "updateallroles", "reloadroles", "reloadallroles" ],
		description: "Reloads all registered roles",
		category: HelpCategory.MOD,
		modOnly: true,
		/** @param {Discord.GuildMember} member */
		onUse: async function rolesUpdate(onError, message, member) {
			await updateAllRoles(onError, member.guild).catch(onError);
			message.acknowledge(member);
		},
	},
};

function setUpdateAllRolesTimeout(guild) {
	function onError(error) {
		logError(`error while trying to automatically update all roles:\n${error?.stack ?? error}`, guild);
	}

	clearTimeout(guild.updateAllRolesTimeout);
	guild.updateAllRolesTimeout = setTimeout(
		updateAllRoles,
		86400000 * Math.ceil(Date.now() / 86400000) - Date.now() + 1,
		onError,
		guild,
	);
}

async function updateAllRoles(onError, guild) {
	setUpdateAllRolesTimeout(guild);

	for (let { discord_id: discordID, src_id: srcID } of guild.sqlite.getAllSrcUsers.all()) {
		let member;

		try {
			member = await guild.members.fetch(discordID);
		} catch {
			log(`sr.c role update: ${discordID} is not a member of the guild; removing them`, guild);
			guild.sqlite.deleteSrcUser.run(discordID);
			continue;
		}

		await updateRoles(onError, null, member, srcID).catch(onError);
	}
}

/**
 * @param {ErrorFunction} onError
 * @param {?Discord.Message} message
 * @param {Discord.GuildMember} member
 * @param {?string} srcID
 * @param {boolean} [addToDB]
 */
async function updateRoles(onError, message, member, srcID, addToDB = false) {
	member = await member.fetch(true);
	const { guild } = member;

	/** @type {Set<string>} */
	let newRoles;
	if (srcID) {
		const result = await callSRC(
			onError ?? logError,
			`/api/v1/users/${srcID}/personal-bests${guild.srcAPIFilter}`,
		);

		if (!result) {
			return;
		}

		const { content, path } = result;
		const srcResponse = JSON.parse(content);
		if ("status" in srcResponse) {
			if (message) {
				message.inlineReply("speedrun.com user not found.");
			} else {
				log(`sr.c role update: ${member.id} (${member.user.tag}) doesn't have sr.c anymore (previous ID: ${srcID}); removing them`, guild);
			}

			return;
		}

		if (srcResponse.data.length === 0) {
			if (message) {
				message.inlineReply(`Couldn't find any verified ${guild.srName} runs on your speedrun.com account.`);
				return;
			}

			log(`sr.c role update: ${member.id} (${member.user.tag}) doesn't have sr.c runs anymore (ID: ${srcID}); removing them`, guild);
			guild.sqlite.deleteSrcUser.run(member.id);
		} else if (addToDB) {
			guild.sqlite.addSrcUser.run({
				discord_id: member.id,
				src_id: path.match(/s\/([^/]+)\/p/)[1],
			});
		}

		newRoles = guild.getSRRoles(member, srcResponse.data);
	} else {
		// remove roles
		newRoles = new Set();
	}

	const allRoles = new Set(member.roles.cache.keys());

	for (let role of guild.allSRRoles) {
		const shouldHave = newRoles.has(role);
		if (shouldHave !== allRoles.has(role)) {
			allRoles[shouldHave ? "add" : "delete"](role);
		}
	}

	await member.roles.set(
		[ ...allRoles ],
		(!message || message?.author === member.user)
			? undefined
			: `responsible user: '${message.author.tag}'`,
	);

	message?.acknowledge(member);
}

const srcRateLimiter = new RateLimiter();

/**
 * Gets a speedrun.com page over HTTPS
 * @param {ErrorFunction} onError Function that gets called to catch an error
 * @param {string} path The path, starting with '/'
 * @returns {Promise<{ content: string; path: string; } | void>}
 */
async function callSRC(onError, path) {
	const isApiCall = path.startsWith("/api");
	// The website doesn't like requests that don't have appropriate values for these headers
	const headers = isApiCall ? {} : {
		"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"accept-encoding": "identity"
	};

	// - delay after API call: 1.5 sec
	// - delay after downloading any other sr.c page: 5 sec
	// API docs on throttling say that 100 req/min would be fine:
	// https://github.com/speedruncomorg/api/blob/master/throttling.md
	await srcRateLimiter.wait(isApiCall ? 1500 : 5000);
	return httpsGet("www.speedrun.com", path, headers).catch(onError);
}
