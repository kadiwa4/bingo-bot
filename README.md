# Bingo Bot

Dreams speedrunning race bot for Discord based on RbdJellyfish’s LBP race bot.

# Setup

Install nodejs (version 6.x or higher).

Get build tools.
* Windows: Install "VC++ 2015.3 v14.00 (v140) toolset for desktop" through VS Installer
* Linux: `sudo apt-get install build-essential`

Get dependencies.

* `npm init -y`
* `npm i discord.js node-gyp better-sqlite3`

Create config.json in same directory as bob.js with your auth token.

```
{
    "token": "discord auth token goes here"
}
```

Run bot.

```
node bob.js
```

# Features

**Pre-race commands**

* `!race` - Starts a new full-game race, or joins the current open race if someone already started one.
* `!category <category name>` - Sets the category (e.g. `!category any%`).
* `!exit` - Leave the race.
* `!ready` - Indicate that you're ready to start.
* `!unready` - Indicate that you're not actually ready.

**Mid-race commands**
* `!d` / `!done` - Indicate that you finished.
* `!ud` / `!undone` - Get back in the race if you finished by accident.
* `!f` / `!forfeit` - Drop out of the race.
* `!uf` / `!unforfeit` - Rejoin the race if you forfeited by accident.

**IL race commands**
* `!ilrace` - Starts a new series of IL races.
* `!level <level name>` - Sets the next level to race. Also accepts indreams.me links.
* `!luckydip` - Sets the next level to race to a random lucky dip level.
* `!ilresults` - Shows the ILs that have been played so far in a series, and the winner of each one.

**Stat commands**
* `!status` - Shows current race status/entrants.
* `!results <race num>` - Shows results of the specified race number (e.g. `!results 2`).
* `!me` - Shows your race statistics.
* `!elo <category name>` - Shows the ELO leaderboard for the given category (e.g. `!elo any%`).
* `!help` - Shows the bot commands.

**Fun command**
* `!nr` / `!newrunner` - Mixes two halves of the names of random Dreams runners together.

**Admin/moderator only**
* `!kick @user` - Kicks someone from the race (in case they're afk or something).
* `!clearrace` - Resets the bot; forces ending the race without recording any results.