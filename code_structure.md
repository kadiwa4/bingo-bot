# How the code works

## Files and folders in `src`

* `command_modules` – [Command modules](#command-modules)
* `discord` – Extensions to [Discord.js](https://discord.js.org) objects
* `guild_configs` – [Configuration](#guild-configurations) for a Discord guild (aka server)

* `bob.js` – The main file and entry point, contains startup code and event handlers
* `Category.js` – Class representing a speedrunning category (e.g. “Any%”)
* `Command.js` – Class representing a bot command (e.g. the `race` command)
* `CommandModule.js` – Class representing a [command module](#command-modules)
* `EntrantTeam.js` – Class representing a team in a race. This can also be just *one* person
* `enums.js` – Enumerations that don't deserve their own files
* `Game.js` – Class representing a game that can be raced
* `misc.js` – Miscellaneous helper functions and constants
* `Race.js` – Class representing the current state of a race in one race channel and all its properties. This can also be the state `NO_RACE`

## Command modules

Each command module is a file in `src/command_modules` that contains commands. The commands can then be activated on a Discord guild by enabling that command module in the [guild config](#guild-configurations). The module `meta` is always loaded.

## Guild configurations

A guild config is a JavaScript file containing guild-specific information like emotes, games, categories, levels and which commands should work on the guild. If you place it in `guild_configs`, it will automatically be loaded when the bot starts. To write your own guild config, you can look at one of the existing configs to see what belongs in there.
