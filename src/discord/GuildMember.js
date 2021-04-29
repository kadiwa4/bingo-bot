import { GuildMember } from "discord.js";

import { cleanName } from "../misc.js";

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
        },
    },
    cleanName: {
        /**
         * Gets a member's displayName string with escaped markdown/mentions
         * @this GuildMember
         */
        get: function cleanName_() {
            // \u200B is a zero-width space
            return cleanName(this.displayName);
        },
    },
    readyEmote: {
        /**
         * Either emotes.ready or emotes.notReady
         * @this GuildMember
         * @returns {string}
         */
        get: function readyEmote() {
            return this.team.race.game.config.emotes[this.isReady ? "ready" : "notReady"];
        },
    },
});
