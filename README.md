# Bingo Bot

Bingo Bot is a speedrunning race bot for Discord, [originally developed for LittleBigPlanet](https://github.com/TadCordle/bingo-bot) by RbdJellyfish (no bingo functionality).

To get an overview of how the code works and where to start, see [`code_structure.md`](/code_structure.md).

[Discord server](https://discord.gg/B9hBn7Gu9z)

## Setup

[Set up a Discord bot](https://discord.com/developers/applications)

Enable Application > Bot > Server Members Intent.

Install [Node.js](https://nodejs.org/en/) (LTS version or newer).

Get build tools.
* Windows: Install "VC++ 2015.3 v14.00 (v140) toolset for desktop" through VS Installer
* Linux: `sudo apt-get install build-essential`

Get dependencies.

```
npm i
```

Create `discord_auth.json` in the bingo-bot folder with your auth token.

```json
{
	"token": "discord auth token here"
}
```

Create a configuration file for your speedrunning server and put it into `src/guild_configs`.

Run bot.

```
npm start
```

To run the bot on a server, I recommend [PM2](https://github.com/Unitech/pm2).

If you want properties on discord.js types to work, go to `node_modules/discord.js/package.json` and edit this line.

```
"types": "../../src/discord/types.d.ts",
```

## Commands

**Pre-race commands**
* `race`/`join` – Starts a new race, or joins the currently open race.
* `quit` – Leaves the race.
* `category [<game name> /] <category name>` – Sets the (game and) category.
* `ready`/`r` – Indicates that you're ready to start.
* `unready`/`ur` – Indicates that you're not actually ready.
* `loads [<timespan>]` – Sets your (team's) loading time for the upcoming race
* `clearloads` – Resets everyone's loading times

**Mid-race commands**
* `done`/`d` – Indicates that you/your team finished.
* `undone`/`ud` – Indicates that you didn't actually finish.
* `forfeit`/`f` – Drops you/your team out of the race.
* `unforfeit`/`uf` – Rejoins the race after you forfeited.

**Co-op-race commands**
* `team <entrant 1> [/ <entrant 2>…]` – Moves the slash-separated entrants into your team.
* `teamname [<team name>]` – Changes/resets your team's name.
* `unteam` – Leaves your current team.
* `unteamall` – Disbands all current teams.
* `randomteams [<team size>]` – Randomly assigns entrants to teams of the given size.

**IL-race commands**
* `level <level name>` – Sets the level.
* `ilresults` – Shows the ILs that have been raced so far in this series.

**Stat commands**
* `status`/`s` – Shows the current race status.
* `result [<race ID>]` – Shows the results of the given/last race.
* `leaderboard <game name> / <category name>` – Shows the Elo leaderboard for the current/given game / category.
* `me <game name>` – Shows your race stats for a game.
* `runner <user> / <game name>` – Shows a user's race stats.

**Other commands**
* `help [<command name>]` – Shows a list of commands or details on one command.

**Moderator-only commands**
* `as <@user or ID> <command>` – Calls a command as the specified user.
* `clearrace` – Ends the race immediately.
* `fixelo` – Recalculates the Elo leaderboards.
* `removerace <race ID>` – Deletes the given race.
