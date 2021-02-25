import Discord, { GuildMember } from "discord.js";

Object.defineProperties(GuildMember.prototype, {
    displayName: {
        /**
         * Gets a member's displayName string (unless it's FireThieff, then it returns "bean")
         * @this GuildMember
         * @returns {string}
         */
        get: function displayName() {
            return (this.id === "159245797328814081") ? "bean"
                // the line from the original function
                : (this.nickname ?? this.user.username);
        }
    },
    cleanName: {
        /**
         * Gets a member's displayName string with escaped markdown/mentions
         * @this GuildMember
         */
        get: function cleanName() {
            // \u200B is a zero-width space
            return Discord.Util.escapeMarkdown(this.displayName.replace(/<(#|@[!&]?)(\d+>)/, "<$1\u200B$2"));
        }
    },
    isMod: {
        /**
         * Determines whether or not the member is a mod/an admin in the guild
         * @this GuildMember
         * @returns {boolean}
         */
        get: function isMod() {
            return this.guild.modRoles.some((role) => this.roles.cache.has(role.id));
        }
    },
    readyEmote: {
        /**
         * Either emotes.ready or emotes.notReady
         * @this GuildMember
         * @returns {string}
         */
        get: function readyEmote() {
            return this.team.race.game.config.emotes[this.isReady ? "ready" : "notReady"];
        }
    }
});
