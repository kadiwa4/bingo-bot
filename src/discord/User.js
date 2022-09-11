import Discord, { User } from "discord.js";

Object.defineProperty(User.prototype, "cleanTag", {
	/**
	 * Gets a user's tag string with escaped markdown/mentions
	 * @this User
	 */
	get: function cleanTag() {
		return Discord.escapeMarkdown(this.tag);
	},
});
