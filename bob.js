const config = require("./config.json");
const emotes = require("./emotes.json");
const categories = require("./categories.js");
const fun = require("./fun.js");
const Discord = require("discord.js");
const SQLite = require("better-sqlite3");
const https = require('https');
const Entities = require('html-entities').Html5Entities;

const client = new Discord.Client();
const sql = new SQLite('./race.sqlite');
const entities = new Entities();
var categoryName = "Art's Dream - Any%";
var prevCategoryName = "Art's Dream - Any%"; // Used to save full-game category when people do IL races
var levelName = "The Open Door";
var raceId = 0;

// References to timeouts, to cancel them if someone interrupts them
var countDownTimeout1;
var countDownTimeout2;
var countDownTimeout3;
var goTimeout;
var raceDoneTimeout;
var raceDoneWarningTimeout;

// Indicates a race bot state
var State = {
    NO_RACE: 0,
    JOINING: 1,
    COUNTDOWN: 2,
    ACTIVE: 3,
    DONE: 4
}

// Keeps track of the current stage of racing the bot is occupied with
class RaceState {
    constructor() {
        this.entrants = new Map(); // Maps from user id to their current race state ()
        this.doneEntrants = [];
        this.ffEntrants = [];
        this.state = State.NO_RACE;
        this.startTime = 0;
        this.ilScores = new Map();
        this.ilResults = [];
    }

    // Adds an entrant. Returns true if successful, returns false if the user has already joined.
    addEntrant(message) {
        if (this.entrants.has(message.author.id)) {
            return false;
        }
        this.entrants.set(message.author.id, new Entrant(message));
        return true;
    }

    // Removes an entrant. Returns true if successful, returns false if the user isn't an entrant.
    removeEntrant(id) {
        if (this.entrants.has(id)) {
            this.entrants.delete(id);
            return true;
        }
        return false;
    }

    // Returns true if the user is joined and ready, false if not.
    entrantIsReady(id) {
        return this.entrants.has(id) && this.entrants.get(id).ready;
    }

    // Returns the current IL score of a user
    getILScore(id) {
        if (this.ilScores.has(id)) {
            return this.ilScores.get(id);
        }
        return 0;
    }
}

// Represents a race entrant
class Entrant {
    constructor(message) {
        this.message = message;
        this.ready = false;
        this.doneTime = 0;
        this.disqualified = false;
    }
}

// Holds the winner of an IL race
class ILResult {
    constructor(id, level, winner) {
        this.id = id;
        this.level = level;
        this.winner = winner;
    }
}

var raceState = new RaceState();

client.on("ready", () => {
    // Setup tables for keeping track of race results
    const resultsTable = sql.prepare("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='results'").get();
    if (!resultsTable['count(*)']) {
        sql.prepare("CREATE TABLE results (race_id INTEGER, user_id TEXT, user_name TEXT, category TEXT, time INTEGER, ff INTEGER, dq INTEGER);").run();
        sql.prepare("CREATE UNIQUE INDEX idx_results_race ON results (race_id, user_id);").run();
        sql.pragma("synchronous = 1");
        sql.pragma("journal_mode = wal");
    }

    // Setup tables for keeping track of user stats
    const usersTable = sql.prepare("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='users'").get();
    if (!usersTable['count(*)']) {
        sql.prepare("CREATE TABLE users (user_id TEXT, category TEXT, races INTEGER, gold INTEGER, silver INTEGER, bronze INTEGER, ffs INTEGER, elo REAL, pb INTEGER);").run();
        sql.prepare("CREATE UNIQUE INDEX idx_users_id ON users (user_id, category);").run();
        sql.pragma("synchronous = 1");
        sql.pragma("journal_mode = wal");
    }

    // Setup SQL queries for setting/retrieving results
    client.getLastRaceID = sql.prepare("SELECT MAX(race_id) AS id FROM results");
    client.getResults = sql.prepare("SELECT * FROM results WHERE race_id = ? ORDER BY time ASC");
    client.addResult = sql.prepare("INSERT OR REPLACE INTO results (race_id, user_id, user_name, category, time, ff, dq) VALUES (@race_id, @user_id, @user_name, @category, @time, @ff, @dq);");

    // Setup SQL queries for setting/retrieving user stats
    client.getUserStatsForCategory = sql.prepare("SELECT * FROM users WHERE user_id = ? AND category = ?");
    client.getUserStats = sql.prepare("SELECT * FROM users WHERE user_id = ? ORDER BY category ASC");
    client.addUserStat = sql.prepare("INSERT OR REPLACE INTO users (user_id, category, races, gold, silver, bronze, ffs, elo, pb) "
                                   + "VALUES (@user_id, @category, @races, @gold, @silver, @bronze, @ffs, @elo, @pb);");

    // Setup SQL query to show leaderboard
    client.getLeaderboard = sql.prepare("SELECT DISTINCT results.user_id AS user_id, results.user_name AS user_name, users.elo AS elo FROM results INNER JOIN users ON results.user_id = users.user_id "
                                      + "WHERE results.category = ? AND users.category = ? GROUP BY results.user_id ORDER BY users.elo DESC");

    // Set race ID to highest recorded race ID + 1
    raceId = client.getLastRaceID.get().id;
    if (!raceId) {
        raceId = 0;
    }
    raceId++;

    console.log("Ready! Next race ID is " + raceId + ".");
});

client.on("message", (message) => {
    if (!message.content.startsWith("!") || message.author.bot) {
        return;
    }

    // Don't let kicked people use any commands until there's a new race
    if (raceState.entrants.has(message.author.id) && raceState.entrants.get(message.author.id).disqualified) {
        return;
    }

    // Race commands
    lowerMessage = message.content.toLowerCase();
    if (message.guild) {
        if (lowerMessage.startsWith("!race") || lowerMessage.startsWith("!join"))
            raceCmd(message);

        else if (lowerMessage.startsWith("!ilrace"))
            ilRaceCmd(message);

        else if (lowerMessage.startsWith("!category"))
            categoryCmd(message);

        else if (lowerMessage.startsWith("!level"))
            levelCmd(message);

        else if (lowerMessage.startsWith("!luckydip"))
            luckyDipCmd(message);

        else if (lowerMessage.startsWith("!exit") ||
                lowerMessage.startsWith("!unrace") ||
                lowerMessage.startsWith("!leave") ||
                lowerMessage.startsWith("!quit") ||
                lowerMessage.startsWith("!yeet") ||
                lowerMessage.startsWith("!f"))
            forfeitCmd(message);

        else if (lowerMessage.startsWith("!ready"))
            readyCmd(message);

        else if (lowerMessage.startsWith("!unready"))
            unreadyCmd(message);

        else if (lowerMessage.startsWith("!d") || lowerMessage.startsWith("! d"))
            doneCmd(message);

        else if (lowerMessage.startsWith("!ud") || lowerMessage.startsWith("!undone"))
            undoneCmd(message);

        else if (lowerMessage.startsWith("!uf") || lowerMessage.startsWith("!unforfeit"))
            unforfeitCmd(message);

        // Admin/Mod only commands
        else if (message.member.roles.find("name", "Admin") || message.member.roles.find("name", "Moderator")) {
            if (lowerMessage.startsWith("!kick"))
                kickCmd(message);

            else if (lowerMessage.startsWith("!clearrace"))
                clearRaceCmd(message);
        }
    }

    // Commands available anywhere
    if (lowerMessage.startsWith("!help") || lowerMessage.startsWith("!commands"))
        helpCmd(message);

    else if (lowerMessage.startsWith("!me"))
        meCmd(message);

    else if (lowerMessage.startsWith("!results"))
        resultsCmd(message);

    else if (lowerMessage.startsWith("!ilresults"))
        ilResultsCmd(message);

    else if (lowerMessage.startsWith("!elo") || lowerMessage.startsWith("!leaderboard"))
        leaderboardCmd(message);

    else if (lowerMessage.startsWith("!s"))
        statusCmd(message);

    else fun.funCmds(lowerMessage, message);
});

client.on('error', console.error);

// !help/!commands
helpCmd = (message) => {
    message.channel.send(`
**Pre-race commands**
\`!race\` - Starts a new full-game race, or joins the current open race if someone already started one.
\`!category <category name>\` - Sets the category. Default is "Art's Dream - Any%".
\`!exit\` - Leave the race.
\`!ready\` - Indicate that you're ready to start.
\`!unready\` - Indicate that you're not actually ready.

**Mid-race commands**
\`!d\` / \`!done\` - Indicate that you finished.
\`!ud\` / \`!undone\` - Get back in the race if you finished by accident.
\`!f\` / \`!forfeit\` - Drop out of the race.
\`!uf\` / \`!unforfeit\` - Rejoin the race if you forfeited by accident.

**IL race commands**
\`!ilrace\` - Starts a new series of IL races.
\`!level <level name>\` - Sets the next level to race. Also accepts indreams.me links. Default is "The Open Door".
\`!luckydip\` - Sets the next level to race to a random lucky dip level.
\`!ilresults\` - Shows the ILs that have been played so far in a series, and the winner of each one.

**Stat commands**
\`!status\` - Shows current race status/entrants.
\`!results raceNum\` - Shows results of the specified race number (e.g. \`!results 2\`).
\`!me\` - Shows your race statistics.
\`!elo <category name>\` - Shows the ELO leaderboard for the given category (e.g. \`!elo any%\` shows the Art's Dream - Any% leaderboard).
\`!help\` - Shows this message.

**Fun command**
\`!nr\` / \`!newrunner\` - Mixes two halves of the names of random Dreams runners together.

**Admin/moderator only**
\`!kick @user\` - Kicks someone from the race (in case they're afk or something).
\`!clearrace\` - Resets the bot; forces ending the race without recording any results.
`);}

// !race/!join
raceCmd = (message) => {
    if (raceState.state === State.DONE) {
        // Record race results now if results are pending
        clearTimeout(raceDoneTimeout);
        recordResults();
    }

    if (raceState.state === State.NO_RACE) {
        // Start race
        raceState.addEntrant(message);
        message.channel.send(mention(message.author) + " has started a new race! Use `!race` to join; use `!category` to setup the race further (currently " + categoryName + ").");
        raceState.state = State.JOINING;

    } else if (raceState.state === State.JOINING) {
        // Join existing race
        if (raceState.addEntrant(message)) {
            message.react(emotes.bingo);
        }

    } else if (raceState.state === State.COUNTDOWN || raceState.state === State.ACTIVE) {
        // Can't join race that already started
        message.author.send("Can't join because there's a race already in progress!");
    }
}

// !ilrace
ilRaceCmd = (message) => {
    if (raceState.state === State.DONE) {
        // Record race results now if results are pending
        clearTimeout(raceDoneTimeout);
        recordResults();
    }

    categoryName = "Individual Levels";
    if (raceState.state === State.NO_RACE) {
        // Start race
        raceState.addEntrant(message);
        message.channel.send(mention(message.author) + " has started a new IL race! Use `!race` to join; use `!level` to setup the race further (currently " + levelName + ").");
        raceState.state = State.JOINING;

    } else if (raceState.state === State.JOINING) {
        // Join existing race
        if (raceState.addEntrant(message)) {
            message.react(emotes.bingo);
        }

    } else if (raceState.state === State.COUNTDOWN || raceState.state === State.ACTIVE) {
        // Can't join race that already started
        message.author.send("Can't join because there's a race already in progress!");
    }
}

// !category
categoryCmd = (message) => {
    if (raceState.state === State.JOINING) {
        category = message.content.replace("!category", "").trim();
        if (category === null || category === "") {
            if (isILRace()) {
                message.channel.send("IL race is currently in progress. Current level is set to " + levelName + ".");
            } else {
                message.channel.send("The category is currently set to " + categoryName + ". Set it using: `!category <category name>`");
            }
            return;
        }

        normalized = categories.normalizeCategory(category);
        if (normalized === null) {
            if (isILRace()) {
                message.channel.send("Switching from IL race to full-game race (" + category + "). (This doesn't seem to be an official category, though; did you mean something else?)");
            } else {
                message.channel.send("Category updated to " + category + ". (This doesn't seem to be an official category, though; did you mean something else?)");
            }
            categoryName = category;
            prevCategoryName = category;
            return;
        }

        if (normalized === "Individual Levels") {
            if (!isILRace()) {
                categoryName = normalized;
                message.channel.send("Switched to IL race. Use `!race` to join; use `!level` to setup the race further (currently " + levelName + ").");
            }
            return;
        }

        if (isILRace()) {
            message.channel.send("Switching from IL race to full-game race (" + normalized + ").");
        } else {
            message.channel.send("Category updated to " + normalized + ".");
        }
        categoryName = normalized;
        prevCategoryName = normalized;
    }
}

// !level
levelCmd = (message) => {
    if (!isILRace() || raceState.state !== State.JOINING) {
        return;
    }

    // Show current level
    level = message.content.replace("!level", "").trim();
    if (level === null || level === "") {
        message.channel.send("The level is currently set to " + levelName + ". Set it using: `!level <level name>`");
        return;
    }

    // Choose community dream
    if (level.includes("ms.me/")) {
        chooseDrmsMeLevel(level, message);
        return;
    }

    normalized = categories.normalizeLevel(level);
    if (normalized === null) {
        // Choose other non-story dream
        levelName = level;
        message.channel.send("Level updated to " + levelName + ". (This doesn't seem to be a story level; try again if this isn't a community level.)");
        return;
    }

    // Choose story level
    levelName = normalized;
    message.channel.send("Level updated to " + levelName + ".");
}

// !luckydip
luckyDipCmd = (message) => {
    if (!isILRace() || raceState.state !== State.JOINING) {
        return;
    }
    "use-strict";
    https.get("https://indreams.me/search/results/?categories=interactive&type=dreams&sort=releasedate", function (result) {
        var { statusCode } = result;
        if (statusCode !== 200) {
            message.channel.send("Error: Couldn't follow https://indreams.me/search/results/?categories=interactive&type=dreams&sort=releasedate; got a " + statusCode + " response.");
            return;
        }
        var dataQueue = "";
        result.on("data", function (dataBuffer) {
            dataQueue += dataBuffer;
        });
        result.on("end", function () {
            matches = [];
            dataQueue.replace(/href="\/dream\/(\w+)"/g, (wholeMatch, parenthesesContent) => {
                matches.push(parenthesesContent);
            });
            dreamURL = ("https://drms.me/")
                    + matches[Math.floor(Math.random() * 48)];
            chooseDrmsMeLevel(dreamURL, message);
        });
    });
    return;
}

// Sets the current level in an IL race to the dream at the given drms.me link
chooseDrmsMeLevel = (dreamURL, message) => {
    if (dreamURL.startsWith("http:")) {
        dreamURL = dreamURL.replace("http:", "https:");
    } else if (!dreamURL.startsWith("https:")) {
        dreamURL = "https://" + dreamURL;
    }
    if (dreamURL.startsWith("https://i")) {
        dreamURL = dreamURL.replace(/indreams\.me\/\w+\//, "drms.me/");
    }
    longURL = dreamURL.replace("drms.me", "indreams.me/dream");
    "use-strict";
    https.get(longURL, function (result) {
        var { statusCode } = result;
        if (statusCode !== 200) {
            message.channel.send("Error: Couldn't follow " + longURL + "; got a " + statusCode + " response.");
            return;
        }

        var dataQueue = "";
        result.on("data", function (dataBuffer) {
            dataQueue += dataBuffer;
        });
        result.on("end", function () {
            title = entities.decode(dataQueue.substring(dataQueue.search(/<title>/) + 7, dataQueue.search(/ \| indreams\.me<\/title>/)).trim());
            levelName = title + " - " + dreamURL;
            message.channel.send("Level updated to " + levelName + ".");
        });
    });
}

// !ff/!forfeit/!leave/!exit/!unrace
forfeitCmd = (message) => {
    if (raceState.state === State.JOINING) {
        // Leave race completely if the race hasn't started yet
        if (raceState.removeEntrant(message.author.id)) {
            if (raceState.entrants.size === 0) {
                // Close down race if this is the last person leaving
                message.channel.send(username(message) + " has left the race. Closing race.");
                raceState = new RaceState();
                categoryName = prevCategoryName;
            } else {
                message.channel.send(username(message) + " has left the race.");
                if (raceState.entrants.size === 1) {
                    // If only one person is left now, make sure they are marked as unready
                    raceState.entrants.forEach((entrant) => { entrant.ready = false; });
                }
            }
        }

    } else if (raceState.state === State.ACTIVE || raceState.state === State.COUNTDOWN) {
        // Only mark as forfeited if the race is in progress
        if (raceState.entrants.has(message.author.id) && !raceState.ffEntrants.includes(message.author.id) && !raceState.doneEntrants.includes(message.author.id)) {
            raceState.ffEntrants.push(message.author.id);
            message.channel.send(username(message) + " has forfeited (use `!unforfeit` to rejoin if this was an accident).");
            if (raceState.ffEntrants.length + raceState.doneEntrants.length === raceState.entrants.size) {
                if (raceState.state === State.COUNTDOWN) {
                    // Everyone forfeited during the countdown
                    clearTimeout(countDownTimeout1);
                    clearTimeout(countDownTimeout2);
                    clearTimeout(countDownTimeout3);
                    clearTimeout(goTimeout);
                    if (isILRace()) {
                        newIL();
                        raceDoneWarningTimeout = setTimeout(() => { message.channel.send("Everyone forfeited. IL not counted."); }, 1000);
                    } else {
                        raceState = new RaceState();
                        raceDoneWarningTimeout = setTimeout(() => { message.channel.send("Everyone forfeited. Closing race."); }, 1000);
                    }
                } else {
                    doEndRace(message);
                }
            }
        }
    }
}

// !uff/!unforfeit
unforfeitCmd = (message) => {
    if (raceState.state === State.ACTIVE || raceState.state === State.COUNTDOWN || raceState.state === State.DONE) {
        if (raceState.entrants.has(message.author.id) && raceState.ffEntrants.includes(message.author.id)) {
            raceState.state = State.ACTIVE;
            raceState.ffEntrants = arrayRemove(raceState.ffEntrants, message.author.id);
            clearTimeout(raceDoneTimeout);
            clearTimeout(raceDoneWarningTimeout);
            message.react(emotes.bingo);
        }
    }
}

// !ready
readyCmd = (message) => {
    if (raceState.state === State.JOINING) {
        // Don't allow readying up if only one person has joined.
        if (raceState.entrants.size === 1) {
            if (raceState.entrants.has(message.author.id)) {
                message.channel.send("Need more than one entrant before starting!");
                return;
            }
        }
        if (!raceState.entrantIsReady(message.author.id)) {
            // Mark as ready
            raceState.addEntrant(message);
            raceState.entrants.get(message.author.id).ready = true;
            message.react(emotes.bingo);

            // Start countdown if everyone is ready
            everyoneReady = true;
            raceState.entrants.forEach((entrant) => {
                if (!entrant.ready) {
                    everyoneReady = false;
                }
            });
            if (everyoneReady) {
                doCountDown(message);
            }
        }
    }
}

// !unready
unreadyCmd = (message) => {
    unforfeitCmd(message);
    if (raceState.state === State.JOINING || raceState.state === State.COUNTDOWN) {
        if (raceState.entrantIsReady(message.author.id)) {
            raceState.entrants.get(message.author.id).ready = false;
            message.react(emotes.bingo);

            // If someone unready'd during countdown, stop the countdown
            if (raceState.state === State.COUNTDOWN) {
                raceState.state = State.JOINING;
                clearTimeout(countDownTimeout1);
                clearTimeout(countDownTimeout2);
                clearTimeout(countDownTimeout3);
                clearTimeout(goTimeout);
                message.channel.send(username(message) + " isn't ready; stopping countdown.");
            }
        }
    }
}

// !d/!done
doneCmd = (message) => {
    if (raceState.state === State.ACTIVE) {
        if (raceState.entrants.has(message.author.id) && !raceState.doneEntrants.includes(message.author.id) && !raceState.ffEntrants.includes(message.author.id)) {
            time = message.createdTimestamp / 1000 - raceState.startTime;
            raceState.entrants.get(message.author.id).doneTime = time;
            raceState.doneEntrants.push(message.author.id);
            points = raceState.entrants.size - raceState.doneEntrants.length + 1;
            message.channel.send(mention(message.author)
                        + " has finished in "
                        + formatPlace(raceState.doneEntrants.length)
                        + " place "
                        + (isILRace() ? "(+" + points + " point" + (points > 1 ? "s" : "") + ") " : "")
                        + "with a time of " + formatTime(time)) + "! (Use `!undone` if this was a mistake.)";
            if (raceState.ffEntrants.length + raceState.doneEntrants.length === raceState.entrants.size) {
                doEndRace(message);
            }
        }
    } else if (isILRace() && raceState.State === State.JOINING) {
        // Leave the IL race lobby
        forfeitCmd(message);
    }
}

// !ud/!undone
undoneCmd = (message) => {
    if (raceState.state === State.ACTIVE || raceState.state === State.DONE) {
        if (raceState.entrants.has(message.author.id) && raceState.doneEntrants.includes(message.author.id)) {
            raceState.state = State.ACTIVE;
            raceState.entrants.get(message.author.id).doneTime = 0;
            raceState.doneEntrants = arrayRemove(raceState.doneEntrants, message.author.id);
            clearTimeout(raceDoneTimeout);
            clearTimeout(raceDoneWarningTimeout);
            message.react(emotes.bingo);
        }
    }
}

// !s/!status
statusCmd = (message) => {
    if (raceState.state === State.NO_RACE) {
        message.channel.send("No race currently happening.");

    } else if (raceState.state === State.JOINING) {
        raceString = "**" + categoryName + " race is currently open with " + raceState.entrants.size + " entrant"
                + (raceState.entrants.size === 1 ? "" : "s") + ". Type `!race` to join!**\n";
        if (isILRace()) {
            raceString += "*Starting " + formatPlace(raceState.ilResults.length + 1) + " IL (" + levelName + " - id: " + raceId + ")*\n";
            sortedEntrants = [];
            raceState.entrants.forEach((entrant) => {
                sortedEntrants.push(entrant);
            });
            sortedEntrants.sort((entrant1, entrant2) => {
                score1 = raceState.getILScore(entrant1.message.author.id);
                score2 = raceState.getILScore(entrant2.message.author.id);
                if (score1 > score2) return -1;
                if (score1 < score2) return 1;
                return 0;
            });
            sortedEntrants.forEach((entrant) => {
                raceString += entrant.ready ? "\t:white_check_mark: " : "\t:small_orange_diamond: ";
                raceString += username(entrant.message) + " - " + raceState.getILScore(entrant.message.author.id) + "\n";
            });
        } else {
            raceState.entrants.forEach((entrant) => {
                raceString += entrant.ready ? "\t:white_check_mark: " : "\t:small_orange_diamond: ";
                raceString += username(entrant.message) + "\n";
            });
        }
        message.channel.send(raceString);

    } else if (raceState.state === State.ACTIVE || raceState.state === State.DONE) {
        // Say race is done if it is, otherwise say it's in progress and show the time
        raceString = "**" + categoryName + " race is "
                + (raceState.state === State.ACTIVE
                        ? "in progress. Current time: " + formatTime(Date.now() / 1000 - raceState.startTime)
                        : "done!" + (raceState.ffEntrants.length === raceState.entrants.size ? "" : " Results will be recorded soon."))
                + "**";

        // List done entrants
        raceState.doneEntrants.forEach((id, i) => {
            entrant = raceState.entrants.get(id);
            points = raceState.entrants.size - i;
            raceString += "\n\t" + placeEmote(i)
                    + " **" + username(entrant.message) + "** "
                    + (isILRace() ? "(+" + points + " point" + (points > 1 ? "s" : "") + ")" : "")
                    + " (" + formatTime(entrant.doneTime) + ")";
        });

        // List racers still going
        raceState.entrants.forEach((entrant) => {
            if (!raceState.doneEntrants.includes(entrant.message.author.id) && !raceState.ffEntrants.includes(entrant.message.author.id)) {
                raceString += "\n\t:stopwatch: " + username(entrant.message);
            }
        });

        // List forfeited/DQ'd entrants
        raceState.ffEntrants.forEach((id) => {
            entrant = raceState.entrants.get(id);
            raceString += "\n\t:x: " + username(entrant.message);
        });

        message.channel.send(raceString);
    }
}

// !kick
kickCmd = (message) => {
    id = message.content.replace("!kick <@", "").replace(">", "").trim();

    if (raceState.state === State.JOINING) {
        // Just remove user from race
        raceState.entrants.delete(id);
        if (raceState.entrants.size === 0) {
            // Close down race if this was the last person
            raceState = new RaceState();
        } else if (raceState.entrants.size === 1) {
            // If only one person is left now, make sure they are marked as unready
            raceState.entrants.forEach((entrant) => { entrant.ready = false; });
        }
        message.react(emotes.bingo);

    } else if (raceState.state === State.ACTIVE || raceState.state === State.COUNTDOWN) {
        // If race is in progress, auto-forfeit them
        if (raceState.entrants.has(id)) {
            if (raceState.doneEntrants.includes(id)) {
                raceState.entrants.get(id).doneTime = 0;
                arrayRemove(raceState.doneEntrants, id);
            }
            if (!raceState.ffEntrants.includes(id)) {
                raceState.ffEntrants.push(id);
            }
            raceState.entrants.get(id).disqualified = true;
            if (raceState.ffEntrants.length + raceState.doneEntrants.length === raceState.entrants.size) {
                doEndRace(message);
            }
            message.react(emotes.bingo);
        }
    }
}

// !clearrace
clearRaceCmd = (message) => {
    // Force end of race, unless it's already done
    clearTimeout(countDownTimeout1);
    clearTimeout(countDownTimeout2);
    clearTimeout(countDownTimeout3);
    clearTimeout(goTimeout);
    clearTimeout(raceDoneTimeout);
    clearTimeout(raceDoneWarningTimeout);
    raceState = new RaceState();
    categoryName = "Art's Dream - Any%";
    prevCategoryName = "Art's Dream - Any%";
    levelName = "The Open Door";
    raceId = client.getLastRaceID.get().id;
    if (!raceId) {
        raceId = 0;
    }
    raceId++;
    message.channel.send("Clearing race.");
}

// !me
meCmd = (message) => {
    // Show stats
    stats = client.getUserStats.all(message.author.id);
    if (stats.length > 0) {
        title = "**Dreams**";
        meString = "";
        ilString = "";
        var maxNumberLength = {races: 1, gold: 1, silver: 1, bronze: 1, ffs: 1, elo: 1};
        stats.forEach((line) => {
            maxNumberLength.races = Math.max(maxNumberLength.races, line.races.toString().length);
            maxNumberLength.gold = Math.max(maxNumberLength.gold, line.gold.toString().length);
            maxNumberLength.silver = Math.max(maxNumberLength.silver, line.silver.toString().length);
            maxNumberLength.bronze = Math.max(maxNumberLength.bronze, line.bronze.toString().length);
            maxNumberLength.ffs = Math.max(maxNumberLength.ffs, line.ffs.toString().length);
            maxNumberLength.elo = Math.max(maxNumberLength.elo, Math.floor(line.elo).toString().length);
        });
        stats.forEach((line) => {
            lineString = "\n    :checkered_flag:\u00A0`" + addSpaces(line.races.toString(), maxNumberLength.races)
                    + "`   :first_place:\u00A0`" + addSpaces(line.gold.toString(), maxNumberLength.gold)
                    + "`   :second_place:\u00A0`" + addSpaces(line.silver.toString(), maxNumberLength.silver)
                    + "`   :third_place:\u00A0`" + addSpaces(line.bronze.toString(), maxNumberLength.bronze)
                    + "`   :x:\u00A0`" + addSpaces(line.ffs.toString(), maxNumberLength.ffs)
                    + "`   " + emotes.ppjSmug + "\u00A0`" + addSpaces(Math.floor(line.elo).toString(), maxNumberLength.elo)
                    + "`   :stopwatch:\u00A0`" + formatTime(line.pb)
                    + "`";
            if (line.category === "Individual Levels") {
                ilString = "\n  " + line.category + lineString;
            } else {
                meString += "\n  " + line.category + lineString;
            }
        });
        message.channel.send(title + ilString + meString);
    } else {
        message.channel.send("No stats found; you haven't done any races yet.");
    }
}

// !results
resultsCmd = (message) => {
    raceNum = message.content.replace("!results", "").trim();
    if (raceNum === "") {
        raceNum = raceId - 1;
    }
    rows = client.getResults.all(raceNum);
    if (rows.length > 0) {
        // Header
        messageString = "Results for race #" + raceNum + " (" + rows[0].category + "):";

        // First list people who finished, but keep track of the forfeits
        ffd = [];
        placeCount = 0;
        rows.forEach((row) => {
            if (row.time < 0) {
                ffd.push(row);
            } else {
                messageString += "\n\t" + placeEmote(placeCount) + " " + row.user_name + " (" + formatTime(row.time) + ")";
                placeCount++;
            }
        });

        // Now we can list forfeits
        ffd.forEach((row) => {
            messageString += "\n\t:x: " + row.user_name;
        });
        message.channel.send(messageString);

    } else {
        message.channel.send("Results not found for race #" + raceNum);
    }
}

// !ilresults
ilResultsCmd = (message) => {
    if (isILRace() && (raceState.state === State.JOINING || raceState.state === State.ACTIVE)) {
        if (raceState.ilResults.length === 0) {
            message.channel.send("No ILs have been finished yet in this series.");
            return;
        }

        // If people do too many ILs, it might break the message limit, so try to split it over multiple messages.
        msgs = [];
        messageString = "**Results for current IL series (listed by race ID):**\n";
        raceState.ilResults.forEach((result, num) => {
            toAdd = "\t#" + result.id + " - " + result.level + " (:first_place: " + result.winner + ")\n";
            if (messageString.length + toAdd.length > 2000) {
                msgs.push(messageString);
                messageString = "**Results for current IL series (cont):**\n";
            }
            messageString += toAdd;
        });
        msgs.push(messageString);
        msgs.forEach((msg, count) => {
            setTimeout(() => { message.channel.send(msg); }, 100 + count * 100);
        });
    }
}

// !leaderboard/!elo
leaderboardCmd = (message) => {
    category = message.content.replace("!leaderboard ", "").replace("!elo ", "").trim();
    if (category = "") {
        message.channel.send("Usage: `!leaderboard <category name>` (e.g. `!leaderboard any%`)");
        return;
    }

    category = categories.normalizeCategory(category);
    if (category === null) {
        category = message.content.replace("!leaderboard ", "").trim();
    }

    rows = client.getLeaderboard.all(category, category);
    if (rows.length > 0) {
        msgs = [];
        messageString = "**ELO Rankings for " + category + ":**\n";
        rows.forEach((row, num) => {
            toAdd = "\t" + (num + 1) + ". (" + emotes.ppjSmug + " " + Math.floor(row.elo) + ") " + row.user_name + "\n";
            if (messageString.length + toAdd.length > 2000) {
                msgs.push(messageString);
                messageString = "**ELO Rankings for " + category + " (cont):**\n";
            }
            messageString += toAdd;
        });
        msgs.push(messageString);
        msgs.forEach((msg, count) => {
            setTimeout(() => { message.channel.send(msg); }, 100 + count * 100);
        });

    } else {
        message.channel.send("No rankings found for " + category + ".");
    }
}

// Sets up a bunch of callbacks that send messages for the countdown
doCountDown = (message) => {
    raceState.state = State.COUNTDOWN;
    message.channel.send("Everyone is ready, gl;hf! " + emotes.ppjWink + " Starting race in 10 seconds...");
    countDownTimeout3 = setTimeout(() => { message.channel.send(emotes.ppjE + " 3..."); }, 7000);
    countDownTimeout2 = setTimeout(() => { message.channel.send(emotes.ppjE + " 2..."); }, 8000);
    countDownTimeout1 = setTimeout(() => { message.channel.send(emotes.ppjE + " 1..."); }, 9000);
    goTimeout = setTimeout(() => {
        message.channel.send(emotes.ppjSmug + " **Go!!!**");
        raceState.state = State.ACTIVE;
        raceState.startTime = Date.now() / 1000;
    }, 10000);
}

// Sets up a callback to record the race results
doEndRace = (message) => {
    if (isILRace()) {
        if (raceState.doneEntrants.length === 0) {
            raceDoneWarningTimeout = setTimeout(() => { message.channel.send("Everyone forfeited. IL not counted."); }, 1000);
        } else {
            raceDoneWarningTimeout = setTimeout(() => { message.channel.send("Race complete (id: " + (raceId-1) + ")! Use `!level` to choose another level, or `!leave` to leave the lobby."); }, 1000);
        }
        recordResults();
    } else {
        raceState.state = State.DONE;

        // Setup callback to record results in 60 seconds. recordResults() will do nothing if everyone forfeited.
        raceDoneTimeout = setTimeout(() => { recordResults(); }, 60000);
        if (raceState.doneEntrants.length === 0) {
            raceDoneWarningTimeout = setTimeout(() => { message.channel.send("Everyone forfeited; race results will not be recorded. Clearing race in 1 minute."); }, 1000);
        } else {
            raceDoneWarningTimeout = setTimeout(() => { message.channel.send("Race complete (id: " + raceId + ")! Recording results/clearing race in 1 minute."); }, 1000);
        }
    }
}

// Records the previous race results and resets the race state
recordResults = () => {
    // Don't record the race if everyone forfeited
    if (raceState.doneEntrants.length === 0) {
        if (isILRace()) {
            newIL();
        } else {
            raceState = new RaceState();
        }
        return;
    }

    // Record race
    raceState.doneEntrants.forEach((id) => {
        entrant = raceState.entrants.get(id);
        result = { race_id: `${raceId}`, user_id: `${id}`, user_name: `${username(entrant.message)}`, category: `${categoryName}`, time: `${entrant.doneTime}`, ff: 0, dq: 0 };
        client.addResult.run(result);
    });
    raceState.ffEntrants.forEach((id) => {
        entrant = raceState.entrants.get(id);
        result = { race_id: `${raceId}`, user_id: `${id}`, user_name: `${username(entrant.message)}`, category: `${categoryName}`, time: -1, ff: 1, dq: `${entrant.disqualified ? 1 : 0}` };
        client.addResult.run(result);
    });

    // Update racers' stats
    playerStats = new Map();
    newElos = new Map();
    raceRankings = raceState.doneEntrants.concat(raceState.ffEntrants);
    raceRankings.forEach((id, i) => {
        statObj = client.getUserStatsForCategory.get(id, categoryName);
        if (!statObj) {
            statObj = { user_id: `${id}`, category: `${categoryName}`, races: 0, gold: 0, silver: 0, bronze: 0, ffs: 0, elo: 1500, pb: -1 };
        }
        newElos.set(id, statObj.elo);

        // Update simple stats while we're iterating through these; need all ELOs to calculate new ones though, so we'll do that in a bit
        statObj.races++;
        if (raceState.ffEntrants.includes(id)) {
            statObj.ffs++;
        } else {
            if (i === 0) {
                statObj.gold++;
                if (isILRace()) {
                    raceState.ilResults.push(new ILResult(raceId, levelName, username(raceState.entrants.get(id).message)))
                }
            } else if (i === 1) {
                statObj.silver++;
            } else if (i === 2) {
                statObj.bronze++;
            }

            if (isILRace()) {
                raceState.ilScores.set(id, raceState.getILScore(id) + raceState.doneEntrants.length + raceState.ffEntrants.length - i);
            } else {
                if (statObj.pb === -1 || raceState.entrants.get(id).doneTime < statObj.pb) {
                    statObj.pb = raceState.entrants.get(id).doneTime;
                }
            }
        }
        playerStats.set(id, statObj);
    });

    // Calculate new ELOs by treating each pair of racers in the race as a 1v1 matchup.
    // See https://en.wikipedia.org/wiki/Elo_rating_system
    raceRankings.forEach((id1, p1Place) => {
        actualScore = 0;
        expectedScore = 0;
        raceRankings.forEach((id2, p2Place) => {
            // Don't compare the player against themselves
            if (id1 === id2) {
                return;
            }

            expectedDiff = 1.0 / (1 + Math.pow(10, (playerStats.get(id2).elo - playerStats.get(id1).elo) / 400));
            expectedScore += expectedDiff;

            if (raceState.ffEntrants.includes(id1)) {
                if (raceState.ffEntrants.includes(id2)) {
                    // If both players forfeited, those two players won't affect each other's scores
                    actualScore += expectedDiff;
                } else {
                    // Loss gives 0 points
                }
            } else if (p1Place < p2Place) {
                // Ahead of opponent, count as win
                actualScore++;
            } else {
                // Loss gives 0 points
            }
        });

        newElos.set(id1, playerStats.get(id1).elo + 32 * (actualScore - expectedScore));
    });

    // Update/save stats with new ELOs
    playerStats.forEach((stat, id) => {
        stat.elo = newElos.get(id);
        client.addUserStat.run(stat);
    });

    raceId++;
    if (isILRace()) {
        newIL();
    } else {
        raceState = new RaceState();
    }
}

newIL = () => {
    raceState.doneEntrants = [];
    raceState.ffEntrants = [];
    raceState.entrants.forEach((entrant) => {
        entrant.ready = false;
        entrant.disqualified = false;
        entrant.doneTime = 0;
    });
    raceState.state = State.JOINING;
}

// Gets a user's username string (unless it's FireThieff, then it returns "bean")
username = (message) => {
    if (message.author.id === "159245797328814081") {
        return "bean";
    }
    return message.member.displayName;
}

// Gets a formatted string for @ing a user
mention = (user) => {
    return "<@" + user.id + ">";
}

// Formats a time in seconds in H:mm:ss.xx
formatTime = (time) => {
    if (time === -1) {
        return "--:--:--.--";
    }

    var hrs = Math.floor(time / 3600);
    var min = Math.floor((time - (hrs * 3600)) / 60);
    var sec = Math.round((time - (hrs * 3600) - (min * 60)) * 100) / 100;

    var result = (hrs < 10 ? "0" : "") + hrs;
    result += ":" + (min < 10 ? "0" + min : min);
    result += ":" + (sec < 10 ? "0" + sec : sec);
    if (sec % 1 === 0) {
        result += ".0";
    }
    if ((sec * 10) % 1 === 0) {
        result += "0";
    }

    return result;
}

// Converts a number to its place, e.g. 1 -> 1st, 2 -> 2nd, etc.
formatPlace = (place) => {
    placeDigit = place % 10;
    if (placeDigit > 3 || (3 < place % 100 && place % 100 < 21)) {
        return place + "th";
    } else if (placeDigit === 1) {
        return place + "st";
    } else if (placeDigit === 2) {
        return place + "nd";
    }
    return place + "rd";
}

// Helper for removing an object (value) from an array (arr)
arrayRemove = (arr, value) => {
    return arr.filter((element) => {
        return element != value;
    });
}

// Returns true if there is an IL race series in progress
isILRace = () => {
    return categoryName === "Individual Levels";
}

// e.g. 1 --> "  1"
addSpaces = (input, outputLength) => {
    var spacesString = "";
    for (let i = 0; i < outputLength - input.length; i++) {
        spacesString += " ";
    }
    return spacesString + input;
}

// Returns either ":..._place:" or ":checkered_flag:"
placeEmote = (place) => {
    switch (place) {
        case 0:
            return ":first_place:";
        case 1:
            return ":second_place:";
        case 2:
            return ":third_place:";
        default:
            return ":checkered_flag:";
    }
}

client.login(config.token);