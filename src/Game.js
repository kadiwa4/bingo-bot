/// <reference path="./types.d.ts" />

import Category from "./Category.js";
import { invertObject, newMap } from "./misc.js";

import Discord from "discord.js";

export default class Game {
	/**
	 * Creates a new game
	 * @param {Discord.Guild} guild
	 * @param {string} name
	 * @param {GuildInput.BaseGame} [gameInput]
	 */
	constructor(guild, name, gameInput) {
		/** The game name */
		this.name = name;

		/**
		 * The config for the game. If a property isn't specified,
		 * it will default to the value in the guild config
		 * @type {Config}
		 */
		this.config = (gameInput?.config ?? {}).withPrototypeRecursive(guild.config);
		if (gameInput?.default) {
			if ("defaultGame" in guild) {
				throw new Error(`multiple default games\n1: '${guild.defaultGame}'\n2: '${this}'`);
			}

			guild.defaultGame = this;
		}

		/**
		 * Object that maps from a user's category input to the category they meant
		 * @type {NodeJS.Dict<Category>}
		 */
		this.categories = newMap();

		/**
		 * Object that maps from a user's level input to the level name they meant
		 * @type {NodeJS.Dict<string>}
		 */
		this.levels = newMap();
	}

	/**
	 * Determines whether or not levels are configured for this game
	 * @readonly
	 */
	get ilsConfigured() {
		return !!this.defaultLevel;
	}

	/**
	 * Gets the category that matches the input the closest or null
	 * @param {string} input The user's input
	 * @returns {?Category}
	 */
	getCategory(input) {
		const { name, coop } = this.config.cleanUpCategory(input.trim());
		const category = this.categories[name];

		return category ? category.forCoop(coop) : null;
	}

	/**
	 * Gets the level name that matches the input the closest or null
	 * @param {string} input The user's input
	 * @returns {?string}
	 */
	getLevel(input) {
		return this.levels[this.config.cleanUpLevelName(input)] ?? null;
	}

	/**
	 * Returns the corresponding emote for the place
	 * @param {number} place The 1-based place
	 * @returns {string}
	 */
	placeEmote(place) {
		const { emotes } = this.config;
		return [
			null,
			emotes.firstPlace,
			emotes.secondPlace,
			emotes.thirdPlace,
		][place] ?? emotes.done;
	}

	/** Returns the game name */
	toString() {
		return this.name;
	}

	/**
	 * Sets up the game's categories. Helper function for `race_control.init`
	 * @param {Discord.Guild} guild
	 * @param {NodeJS.Dict<?GuildInput.Category> | NodeJS.Dict<?GuildInput.MultiGameCategory>} categoriesInput
	 * @param {boolean} multiGame
	 */
	setUpCategories(guild, categoriesInput, multiGame) {
		for (let categoryName in categoriesInput) {
			/** @type {GuildInput.Category | GuildInput.MultiGameCategory} */
			const categoryInput = categoriesInput[categoryName];
			const category = new Category(categoryName, categoryInput);

			if (categoryInput?.default) {
				if (this.defaultCategory) {
					throw new Error(`multiple default categories of game '${this}'\n1: '${this.defaultCategory}'\n2: '${categoryName}'`);
				}

				this.defaultCategory = category;
			}

			const cleanedUpCategoryName = this.config.cleanUpCategory(categoryName).name;
			if (multiGame) {
				category.games = [];
				if (!("games" in categoryInput)) {
					throw new Error(`no property 'games' of multi-game category '${categoryName}'`);
				}

				/** @type {GuildInput.MultiGameCategory} */
				const multiCategoryInput = categoryInput;
				for (let input of multiCategoryInput.games) {
					/** @type {Game} */
					const game = guild.getGame(input);
					if (!game) {
						throw new Error(`couldn't find game '${input}' for multi-game category '${categoryName}'`);
					}

					category.games.push(game);
					invertObject(cleanedUpCategoryName, multiCategoryInput.aliases, game.categories, category);
				}
			}

			invertObject(cleanedUpCategoryName, categoryInput?.aliases, this.categories, category);
		}

		if (!this.defaultCategory) {
			throw new Error(`no default category of game '${this}'`);
		}
	}
}

/**
 * The default category for the game
 * @type {Category}
 */
Game.prototype.defaultCategory;

/**
 * The default level name for the game
 * @type {string}
 */
Game.prototype.defaultLevel;

/**
 * The game's speedrun.com ID or null if it was never set
 * @type {?string}
 */
Game.prototype.srcID = null;
