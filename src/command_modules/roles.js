import Command from "../Command.js";
import { HelpCategory } from "../enums.js";
import { clean, decodeHTML, httpsGet, isMod, log, logError, RateLimiter } from "../misc.js";

import assert from "assert";

import Discord from "discord.js";

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
	guild.unicodeNameFix = guildInput.roles.unicodeNameFix ?? false;

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

			if (!args) {
				const srcID = guild.sqlite.getSrcID.get(member.id);
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

			function onErrorCatch404(error) {
				if (error.message.endsWith("'404 Not Found'")) {
					message.inlineReply("speedrun.com user not found.");
				} else {
					onError(error);
				}
			}

			const response = (await callSRC(onErrorCatch404, guild, `/user/${args}`))?.content;
			if (!response) {
				return;
			}

			if (response.slice(0, 1000).includes("<title>speedrun.com</title>")) {
				// this can't be a user site, the title would be something else if it was
				message.inlineReply("speedrun.com user site not found.");
				return;
			}

			const tagMatch = response.slice(20000).match(/data-original-title="Discord: ([^#]+#\d{4})"/);
			if (!tagMatch) {
				message.inlineReply(`Can't determine if the speedrun.com account is yours; make sure you've linked your Discord tag (\`${member.user.cleanTag}\`) at https://www.speedrun.com/editprofile.`);
				return;
			}

			/** @type {string} */
			const discordTag = member.user.tag;
			const srcTag = decodeHTML(tagMatch[1]);
			if (srcTag === discordTag) {
				updateRoles(onError, message, member, args, true).catch(onError);
				return;
			}

			// sr.c replaces characters whose char code is higher than 0xFF with question marks
			if (
				guild.unicodeNameFix
				&& srcTag.includes("?")
				&& srcTag.length === discordTag.length
				&& srcTag.slice(-5) === discordTag.slice(-5)
			) {
				let tagsMatch = true;
				let index = 0;
				// the last 5 characters (e.g. '#0872') have already been checked
				for (let srcChar of srcTag.slice(0, -5)) {
					if (
						srcChar !== discordTag[index]
						&& (srcChar !== "?" || discordTag.charCodeAt(index) < 0x100)
					) {
						tagsMatch = false;
						break;
					}
					index += 1;
				}

				if (tagsMatch) {
					updateRoles(onError, message, member, args, true).catch(onError);
					return;
				}
			}

			message.inlineReply(`The Discord tag specified on speedrun.com (${clean(srcTag, message)}) doesn't match your actual one (${member.user.cleanTag}). You can update it at https://www.speedrun.com/editprofile. If you have issues with this, contact a moderator.`);
			return;
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
			guild,
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
				message.inlineReply(`Couldn't find any ${guild.srName} runs on your speedrun.com account.`);
				return;
			}

			log(`sr.c role update: ${member.id} (${member.user.tag}) doesn't have sr.c runs anymore (ID: ${srcID}); removing them`, guild);
			guild.sqlite.deleteSrcUser(member.id);
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
 * @param {Discord.Guild} guild The guild
 * @param {string} path The path, starting with '/'
 * @returns {Promise<{ content: string; path: string; } | void>}
 */
async function callSRC(onError, guild, path) {
	// - delay after API call: 1 sec
	// - delay after downloading any other sr.c page: 5 sec
	// API: https://github.com/speedruncomorg/api/tree/master/version1
	await srcRateLimiter.wait(path.startsWith("/api") ? 1000 : 5000);
	return httpsGet("www.speedrun.com", path).catch(onError);
}
