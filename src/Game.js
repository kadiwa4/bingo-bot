/// <reference path="./types.d.ts" />

import Category from "./Category.js";
import { assert, invertObject } from "./misc.js";

import Discord from "discord.js";

export default class Game {
    /**
     * Creates a new game
     * @param {Discord.Guild} guild
     * @param {string} name
     * @param {GameInput | MultiGameInput} gameInput
     */
    constructor(guild, name, gameInput) {
        /** The game name */
        this.name = name;

        /**
         * The config for the game. If a property isn't specified,
         * it will default to the value in the guild config
         * @type {Config}
         */
        this.config = (gameInput.config ?? {}).withPrototypeRecursive(guild.config);
        if (gameInput.default) {
            assert(!guild.defaultGame, `multiple default games (${guild.defaultGame} and ${this})`, guild);
            guild.defaultGame = this;
        }
    }

    /**
     * Object that maps from a user's category input to the category they meant
     * @type {NodeJS.Dict<Category>}
     */
    categories = Object.create(null);

    /**
     * The default category for the game
     * @type {Category}
     */
    defaultCategory;

    /**
     * Object that maps from a user's level input to the level name they meant
     * @type {NodeJS.Dict<string>}
     */
    levels = Object.create(null);

    /**
     * The default level name for the game
     * @type {string}
     */
    defaultLevel;

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
        const { name, coop } = this.config.cleanUpCategory(input);
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
            emotes.thirdPlace
        ][place] ?? emotes.done;
    };

    /** Returns the game name */
    toString() {
        return this.name;
    }

    /**
     * Sets up the game's categories. Helper function for `race_control.init`
     * @param {Discord.guild} guild
     * @param {NodeJS.Dict<?GuildInput.Category> | NodeJS.Dict<?GuildInput.MultiGameCategory>} categoriesInput
     * @param {boolean} multiGame
     */
    setUpCategories(guild, categoriesInput, multiGame) {
        for (let categoryName in categoriesInput) {
            /** @type {GuildInput.MultiGameCategory} */
            const categoryInput = categoriesInput[categoryName];
            const category = new Category(categoryName, categoryInput);

            if (categoryInput?.default) {
                assert(!this.defaultCategory, `multiple default categories for game ${this} (${this.defaultCategory} and ${categoryName})`, guild);
                this.defaultCategory = category;
            }

            const cleanedUpCategoryName = this.config.cleanUpCategory(categoryName).name;
            if (multiGame) {
                category.games = [];
                assert(categoryInput?.games, `no property 'games' for multi-game category ${categoryName}`, guild);
                for (let input of categoryInput.games) {
                    /** @type {Game} */
                    const game = guild.getGame(input);
                    assert(game, `couldn't find game ${input} for multi-game category ${categoryName}`, guild);
                    category.games.push(game);
                    invertObject(cleanedUpCategoryName, categoryInput.aliases, game.categories, category);
                }
            }

            invertObject(cleanedUpCategoryName, categoryInput?.aliases, this.categories, category);
        }

        assert(this.defaultCategory, `no default category for game ${this}`, guild);
    }
};

/**
 * The game's speedrun.com ID or null if it was never set
 * @type {?string}
 */
Game.prototype.srcID = null;
