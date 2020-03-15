var exports = module.exports = {};

// Given a category string, this returns the closest matching category name.
exports.normalizeCategory = (category) => {
    normalizedCategory = category.toLowerCase()
            .replace(/\W|s$/g, "")
            .replace("artsdream", "")

    if (normalizedCategory === "any") {
        return "Art's Dream - Any%";
    } else if (normalizedCategory === "100") {
        return "Art's Dream - 100%";
    } else if (normalizedCategory === "il" || normalizedCategory === "individuallevel" || normalizedCategory === "individualscene" || normalizedCategory === "individualdream") {
        return "Individual Levels";
    }

    else {
        return null;
    }
}

// this function is so dumb
exports.normalizeLevel = (level) => {
    level = level.toLowerCase()
            .replace(/\W|the/g, "");
    
    // Art's Dream scenes
    if (level === "opendoor") {
        return "The Open Door";
    } else if (level === "treehouse") {
        return "The Treehouse";
    } else if (level === "gatheringstorm") {
        return "The Gathering Storm";
    } else if (level === "weightofpast") {
        return "The Weight of the Past";
    } else if (level === "wilderness") {
        return "The Wilderness";
    } else if (level === "meridianforest") {
        return "The Meridian Forest";
    } else if (level === "treeinchains") {
        return "The Tree in Chains";
    } else if (level === "crashingtrain") {
        return "The Crashing Train";
    } else if (level === "greatdescent") {
        return "The Great Descent";
    } else if (level === "thornbeaksdoor") {
        return "Thornbeak's Door";
    } else if (level === "greatestrobot") {
        return "The Greatest Robot";
    } else if (level === "quietvoice") {
        return "The Quiet Voice";
    } else if (level === "rumoursofarevolution") {
        return "The Rumours of a Revolution";
    } else if (level === "weepingwillows") {
        return "The Weeping Willows";
    } else if (level === "studio") {
        return "The Studio";
    } else if (level === "searchforaheart") {
        return "The Search for a Heart";
    } else if (level === "brokenhead") {
        return "The Broken Head";
    } else if (level === "escape") {
        return "The Escape";
    } else if (level === "lairofrootr") {
        return "The Lair of ROOT-R";
    } else if (level === "superpower") {
        return "The Superpower";
    } else if (level === "firewithin") {
        return "The Fire Within";
    } else if (level === "firerages") {
        return "The Fire Rages";
    } else if (level === "cabin") {
        return "The Cabin";
    } else if (level === "chase") {
        return "The Chase";
    } else if (level === "convergence") {
        return "The Convergence";
    }

    // Other Mm dreams
    else if (level === "") {
        return "";
    }

    else {
        return null;
    }
}