import Command from "../Command.js";
import { HelpCategory } from "../enums.js";
import { assert, clean, createSQLiteTable, decodeHTML, httpsGet, log, logError, setTimeoutPromise } from "../misc.js";

import Discord from "discord.js";

export const id = "roles";

/**
 * @param {Discord.Guild} guild
 * @param {GuildInput} guildInput
 * @see CommandModule.init
 */
export function init(guild, guildInput) {
    assert(guildInput.roles, "no config for command module roles", guild);

    const { database } = guild;

    // setup tables for keeping track of speedrun.com user IDs
    createSQLiteTable(database, "src_users",
        `discord_id TEXT PRIMARY KEY,
        src_id TEXT NOT NULL`);

    Object.assign(guild.sqlite, {
        getSrcUsers: database.prepare("SELECT * FROM src_users;"),
        addSrcUser: database.prepare("INSERT OR REPLACE INTO src_users (discord_id, src_id) VALUES (@discord_id, @src_id);"),
        deleteSrcUser: database.prepare("DELETE FROM src_users WHERE discord_id = ?;")
    });

    /** @param {string} roleID */
    function role(roleID) {
        const role = guild.roles.cache.get(roleID);
        assert(role, `role ${roleID} not found`, guild);
        return role;
    }

    Object.assign(guild, {
        allSRRoles: guildInput.roles.init?.(guild, role),
        getSRRoles: guildInput.roles.getRoles,
        srcAPIFilter: guildInput.roles.srcAPIFilter ?? "",
        unicodeNameFix: guildInput.roles.unicodeNameFix ?? false
    });

    setUpdateAllRolesTimeout(guild);
}

/** @type {NodeJS.Dict<Command>} */
export const commands = {
    roles: {
        names: [ "roles" ],
        usage: "[<speedrun.com name>]",
        description: "Updates your roles to match races finished + speedrun.com PBs (you need to link your Discord account on sr.c) or deletes roles if nothing is specified",
        onUse: async function roles(onError, message, member, args) {
            const { guild } = member;

            if (!args) {
                guild.sqlite.deleteSrcUser.run(member.id);
                await updateRoles(onError, message, member, null).catch(onError);
                return;
            }

            if (/[?&/%$!"#`^[\]\\()=+*:,;<>]|\s/.test(args)) {
                message.inlineReply("The speedrun.com name contains invalid characters.");
                return;
            }

            if (message.member.isMod) {
                await updateRoles(...arguments).catch(onError);
                return;
            }

            function onErrorCatch404(error) {
                if (error.message.endsWith("'404 Not Found'")) {
                    message.inlineReply("speedrun.com user not found.");
                } else {
                    onError(error);
                }
            }

            const response = (await callSRC(onErrorCatch404, `/user/${args}`))?.content;
            if (!response) {
                return;
            }

            if (response.slice(0, 1000).includes("<title>speedrun.com</title>")) {
                // this can't be a user site, the title would be something else if it was
                message.inlineReply("speedrun.com user site not found.");
                return;
            }

            const tagMatch = response.slice(20000).match(/data-original-title="Discord: ([^#]+#\d{4})"/);
            console.log(tagMatch.index);
            if (!tagMatch) {
                message.inlineReply(`Can't determine if the speedrun.com account is yours; make sure you've linked your Discord tag (\`${member.user.cleanTag}\`) at https://www.speedrun.com/editprofile.`);
                return;
            }

            /** @type {string} */
            const discordTag = member.user.tag;
            const srcTag = decodeHTML(tagMatch[1]);
            if (srcTag === discordTag) {
                await updateRoles(...arguments).catch(onError);
                return;
            }

            // sr.c replaces characters whose char code is higher than 0xFF with question marks
            if (guild.unicodeNameFix && srcTag.includes("?") && srcTag.length === discordTag.length && srcTag.slice(-5) === discordTag.slice(-5)) {
                let tagsMatch = true;
                // the last 5 characters (e.g. '#0872') have already been checked
                for (let srcChar of srcTag.slice(0, -5)) {
                    if (srcChar !== discordTag[i] && (srcChar !== "?" || discordTag.charCodeAt(i) < 0x100)) {
                        tagsMatch = false;
                        break;
                    }
                }

                if (tagsMatch) {
                    await updateRoles(...arguments).catch(onError);
                    return;
                }
            }

            message.inlineReply(`The Discord tag specified on speedrun.com (${clean(srcTag, message)}) doesn't match your actual one (${member.user.cleanTag}). You can update it at https://www.speedrun.com/editprofile. If you have issues with this, contact a moderator.`);
            return;
        }
    },
    rolesUpdate: {
        names: [ "updateroles" ],
        aliases: [ "updateallroles", "reloadroles", "reloadallroles" ],
        description: "Reloads all registered roles",
        category: HelpCategory.MOD,
        modOnly: true,
        onUse: async function rolesUpdate(onError, message, member) {
            await updateAllRoles(onError, member.guild).catch(onError);
            message.acknowledge();
        }
    }
};

function setUpdateAllRolesTimeout(guild) {
    function onError(error) {
        logError(`error while trying to automatically update all roles:\n${error?.stack ?? error}`, guild);
    }

    clearTimeout(guild.updateAllRolesTimeout);
    guild.updateAllRolesTimeout = setTimeout(updateAllRoles, 86400000 * Math.ceil(Date.now() / 86400000) - Date.now() + 1, onError, guild);
}

async function updateAllRoles(onError, guild) {
    setUpdateAllRolesTimeout(guild);

    for (let { discord_id: discordID, src_id: srcID } of guild.sqlite.getSrcUsers.all()) {
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
 * @param {(error) => void} onError
 * @param {?Discord.Message} message
 * @param {Discord.GuildMember} member
 * @param {string} srcID
 */
async function updateRoles(onError, message, member, srcID) {
    const { guild } = member;

    /** @type {Set<Discord.Role>} */
    let newRoles;
    if (srcID) {
        const { content, path } = await callSRC(onError ?? logError, `/api/v1/users/${srcID}/personal-bests${guild.srcAPIFilter}`);
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
            } else {
                log(`sr.c role update: ${member.id} (${member.user.tag}) doesn't have sr.c runs anymore (ID: ${srcID}); removing them`, guild);
                guild.sqlite.deleteSrcUser(member.id);
            }
        } else {
            guild.sqlite.addSrcUser.run({ discord_id: member.id, src_id: path.match(/s\/(\w+)\/p/)[1] });
        }

        newRoles = guild.getSRRoles(member, srcResponse.data);
    } else {
        // remove roles
        newRoles = new Set();
    }

    const allRoles = new Set(member.roles.cache.values());

    for (let role of guild.allSRRoles) {
        const shouldHave = newRoles.has(role);
        if (shouldHave !== allRoles.has(role)) {
            allRoles[shouldHave ? "add" : "delete"](role);
        }
    }

    await member.roles.set([...allRoles]);
    message?.acknowledge();
}

let srcCallTimestamp = 0;

/**
 * Gets a speedrun.com page over HTTPS
 * @param {(error) => void} onError Function that gets called to catch an error
 * @param {string} path The path, starting with '/'
 * @returns {Promise<{ content: string; path: string; }>}
 */
async function callSRC(onError, path) {
    // - delay after API call: 1 sec
    // - delay after downloading any other sr.c page: 5 sec
    // API: https://github.com/speedruncomorg/api/tree/master/version1
    let apiPauseLength = path.startsWith('/api') ? 1000 : 5000;
    if (srcCallTimestamp < Date.now()) {
        srcCallTimestamp = Date.now() + apiPauseLength;
    } else {
        let prevApiCallTimestamp = srcCallTimestamp;
        srcCallTimestamp += apiPauseLength;
        await setTimeoutPromise(prevApiCallTimestamp - Date.now());
    }

    return httpsGet("www.speedrun.com", path).catch(onError);
}
