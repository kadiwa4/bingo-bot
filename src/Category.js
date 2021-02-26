/// <reference path="./types.d.ts" />

import Game from "./Game.js";

export default class Category {
    /**
     * Creates a new category object
     * @param {string} name The category name without "(Co-op)"
     * @param {GuildInput.CommonCategory} [categoryInput] The category input
     */
    constructor(name, categoryInput) {
        this.nameNoCoop = name;

        if (!categoryInput) {
            this.officialCategory = false;
        } else if (categoryInput.il) {
            this.isIL = true;
        }
    }

    /**
     * Returns the same category but solo/co-op
     * @param {boolean} coop Whether or not the returned category should be co-op
     */
    forCoop(coop) {
        if (this.isCoop === coop) {
            return this;
        }

        const category = new Category();
        Object.assign(category, this);
        category.isCoop = coop;
        return category;
    }

    /**
     * Whether or not the category is a multi-game category
     * @readonly
     */
    get multiGame() {
        return this.games !== null;
    }

    /**
     * The category name, including "(Co-op)" if it is a co-op category
     * @readonly
     */
    get name() {
        return `${this.nameNoCoop}${this.isCoop ? " (Co-op)" : ""}`;
    }

    /** Returns the category name, including "(Co-op)" if it is a co-op category */
    toString() {
        return this.name;
    }
};

/** Whether or not the category is an IL category */
Category.prototype.isIL = false;

/** Whether or not the category ends with "(Co-op)" */
Category.prototype.isCoop = false;

/** Whether or not this category is mentioned in the guild config */
Category.prototype.officialCategory = true;

/**
 * The games included in the multi-game category or null
 * @type {?Game[]}
 */
Category.prototype.games = null;
