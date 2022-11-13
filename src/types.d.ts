import Game from "./Game.js";

import Discord from "discord.js";

declare global {
	type ErrorFunction = (error: Error | any) => void;

	/** Type of the guild input's root object */
	interface GuildInput {
		/** Discord guild ID */
		id: string;

		/** Full name of the guild, preferably without "Speedrunning" */
		name: string;

		/** Abbreviation of the guild, preferably without "SR" */
		abbreviation: string;

		/** Other names for the guild as `client.cleanUpGuildName` would output them. Can include "sr" but not "speedrun(ning)", "server" or "guild" */
		aliases?: string[];

		/** Command name that runs the command after that on the guild */
		guildCommand: string;

		/** Discord channel IDs of channels where races should take place */
		raceChannelIDs: string[];

		/** Discord role IDs that show that someone is a moderator */
		modRoleIDs: string[];

		/** Command module IDs of all modules from `command_modules` that can be used in the guild */
		moduleIDs: string[];

		/** Takes a user-input string and cleans it up so that it can then be used as a key in an object */
		cleanUpGameName(input: string): string;

		/** Object that maps from category names common across all games to category input objects */
		commonCategories?: NodeJS.Dict<GuildInput.CommonCategory>;

		/** Object that maps from game names to game input objects */
		games: NodeJS.Dict<GuildInput.Game>;

		/** Game input object of the game "Multiple Games", which has multi-game categories */
		multiGame?: GuildInput.MultiGame;

		/** What commands start with. Must match the RegEx pattern `.?\W` and can't contain `` ` `` */
		commandPrefix: string;

		/** Object that maps from command IDs to example usages (that include the command name itself but not the command prefix) */
		commandExamples?: NodeJS.Dict<string>;

		/** Game-specific-configuration defaults for all games in the guild. If a (sub-)property is missing, defaults to the value in the corresponding command module */
		config: Config;

		/** Configuration for the `roles` command module */
		roles?: GuildInput.Roles;
	}

	namespace GuildInput {
		/**
		 * Type containing properties common across all game input objects
		 * @template TCategory Type of category input objects
		 */
		interface BaseGame<TCategory> {
			/** Whether or not this is the game that's selected by default when starting a new race */
			default?: boolean;

			/** Object that maps from category names to category input objects or `null` */
			categories: NodeJS.Dict<?TCategory>;

			/** Game-specific configuration. If a (sub-)property is missing, defaults to the value in the GuildInput config */
			config?: Config;
		}

		/** Type of normal game input objects */
		interface Game extends BaseGame<Category> {
			/** Other names for the game as `cleanUpGameName` would output them */
			aliases?: string[];

			/** Object that maps from level names to level input objects or `null` */
			levels?: NodeJS.Dict<?Level>;
		}

		/** Type of the game "Multiple Games" */
		declare type MultiGame = BaseGame<MultiGameCategory>;

		/** Type of category input objects common across all games */
		interface CommonCategory {
			/** Other names for the category as `game.config.cleanUpCategory` would output them */
			aliases?: string[];

			/** Whether or not the category is an Individual Level category. If it is one, that should be apparent from the name */
			il?: boolean;
		}

		/** Type of normal category input objects */
		interface Category extends CommonCategory {
			/** Whether or not this is the category that's selected by default when starting a new race. In games that are not the default game this is currently unused */
			default?: boolean;
		}

		/** Type of category input objects in the game "Multiple Games" */
		interface MultiGameCategory extends Category {
			/** Games that are played in the category as user-input-like strings */
			games: string[];
		}

		/** Type of level input objects */
		interface Level {
			/** Other names for the level as `game.config.cleanUpLevelName` would output them */
			aliases?: string[];

			/** Whether or not this is the level that's selected by default when starting a new IL race series */
			default?: boolean;
		}

		/** Type of `roles`, which contains configuration for the `roles` command module */
		interface Roles {
			/** Gets called on startup */
			init?(guild: Discord.Guild): Set<string>;

			/** Returns a set of roles that the guild member should have */
			getRoles(member: Discord.GuildMember, srcData: any[]): Set<string>;

			/**
			 * URL query that filters users' personal-best lists. Either `?game=` or `?series=`, followed by a speedrun.com game/series ID
			 * @default ""
			 */
			srcAPIFilter: string;

			/**
			 * Speedrun.com replaces characters with a char code > `0xFF` with question marks.
			 * If `unicodeNameFix` is true, users with affected names can still easily link their speedrun.com account.
			 * However, this also allows other Discord users with Nitro to connect that speedrun.com account to their own Discord account.
			 * They will most likely have to change their Discord name (not nickname) to steal the account, though
			 * @default false
			 */
			unicodeNameFix?: boolean;
		}
	}

	/** Type of `config` properties, which contain game-specific configuration */
	interface Config {
		/** Game-specific configuration for races */
		race?: Config.Race;

		/** Game-specific Discord emotes */
		emotes?: Config.Emotes;

		/**
		 * Takes a user-input string and cleans it up so that it can then be used as a key in an object.
		 * Additionally determines whether or not the category is a co-op category
		 */
		cleanUpCategory?(input: string): { name: string; coop: boolean; };

		/** Takes a user-input string and cleans it up so that it can then be used as a key in an object */
		cleanUpLevelName?(input: string): string;
	}

	namespace Config {
		/** Type of `config.race`, which contains game-specific configuration for races */
		interface Race {
			/**
			 * Length of the countdown before each race
			 * @default 10
			 */
			countdownLength?: number;

			/**
			 * How to count down before races. Keep in mind that Discord has rate limiting (https://discord.com/developers/docs/topics/gateway#rate-limiting)
			 * @default [ 3, 2, 1 ]
			 */
			countdown?: number[];

			/**
			 * Time in seconds that a race starts at, usually this is a negative number
			 * @default 0
			 */
			timerOffset?: number;

			/**
			 * How many members can be in a team. If greater than 1,
			 * you have to include the `race_coop` command module
			 * @default 1
			 */
			maxTeamSize?: number;

			/**
			 * Whether or not to suggest who should choose the next level when an IL race is finished
			 * @default true
			 */
			sayWhoChoosesNextIL?: boolean;

			/** Chooses community levels. If it returns a string, that means a community level was chosen */
			communityLevels?(onError: (error: any) => void, message: Discord.Message, member: Discord.GuildMember, args: string, cleanArgs: string): Promise<string | null>;

			/** Game-specific configuration for elo */
			elo?: Elo;
		}

		/** Type of `config.race.elo`, which contains game-specific configuration for elo */
		interface Elo {
			/**
			 * Maximum amount of Elo that can be gained by beating one player
			 * @default 32
			 */
			maxEloGain?: number;

			/**
			 * A number in the Elo calculation
			 * @default 10
			 */
			base?: number;

			/**
			 * A number in the Elo calculation. The smaller the number is, the higher is the impact of the skill level on the result
			 * @default 400
			 */
			dividend?: number;

			/**
			 * Amount of Elo that a player starts with
			 * @default 1500
			 */
			start?: number;

			/** Calculates the team's Elo. By default, this is the average of the team members' Elos */
			calculateTeamElo?(elos: number[]): number;
		}

		/** Type of `config.emotes`, which contains game-specific emotes */
		interface Emotes {
			/** Emoji or Discord emote ID which is used to react to read messages */
			acknowledge?: string;

			/** Emoji or text which is used next to Elo points/differences */
			elo?: string;

			/** Emoji or text which shows that someone is not ready */
			notReady?: string;

			/** Emoji or text which shows that someone is ready */
			ready?: string;

			/** Emoji or text which is used in the first countdown message */
			countdownStart?: string;

			/** Emoji or text which is used in the countdown messages from `config.race.countdown` */
			countdown?: string;

			/** Emoji or text which is used in the race start message */
			raceStart?: string;

			/** Emoji or text which shows a gold medal/trophy */
			firstPlace?: string;

			/** Emoji or text which shows a silver medal/trophy */
			secondPlace?: string;

			/** Emoji or text which shows a bronze medal/trophy */
			thirdPlace?: string;

			/** Emoji or text which is used when a race finished */
			done?: string;

			/** Emoji or text which shows that someone is still going */
			racing?: string;

			/** Emoji or text which shows that someone forfeited */
			forfeited?: string;
		}
	}

	/** Keeps track of the result of an IL race */
	interface ILResult {
		/** The race ID */
		id: number;

		/** The game which was raced */
		game: Game;

		/** The level which was raced */
		level: string;

		/** The name of the winner team */
		winnerTeamName: string;
	}
}
