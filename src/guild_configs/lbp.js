/// <reference path="../types.d.ts" />

import Category from "../Category.js";
import { MULTI_GAME } from "../misc.js";
import * as misc from "../misc.js";
import Race from "../Race.js";

import Discord from "discord.js";

const emotes = {
	ppjE: "<:ppjE:230442929859198977>",
	ppjSmug: "<:ppjSmug:230442929838227457>",
	ppjWink: "<:ppjWink:367254404811980801>",
	rbdBingo: "<:rbdBingo:394255134340677634>"
};

const ilAliases = [ "il", "ils" ];
const anyNCAliases = [ "anynooverlord", "nocreate", "nooverlord", "anync", "anyno", "nc", "no" ];
const knownLighthouseInstances = [ "lighthouse.lbpunion.com", "beacon.lbpunion.com", "lnfinite.site" ];

const ilCategory = {
	aliases: ilAliases,
	il: true
};

const COOP_REGEX = /coop|[2-5]p(layers?)?/;
const LIGHTHOUSE_REGEX = /([a-z\.]+\.[a-z]{2,4})(\/slot\/[0-9]+)/i;

/**
 * @param {string} input
 * @returns {{ name: string; coop: boolean; }}
 */
function lbpCleanUpCategory(input) {
	const name = input.toLowerCase().replace(/\W/g, "");
	return {
		name: name.replace(COOP_REGEX, ""),
		coop: COOP_REGEX.test(name)
	};
}

/**
 * @param {string} input
 * @returns {string}
 */
function lbpCleanUpLevelName(input) {
	return input.toLowerCase()
		.replace(/&/g, "and")
		.replace(/\W|^the/g, "")
		.replace("introduction", "intro");
}

const lbpRateLimiter = new misc.RateLimiter();

/**
 * @param {(error: any) => void} onError
 * @param {string} cleanArgs
 * @returns {Promise<{ level: string; note?: string; } | null>}
 */
async function lbpCommunityLevels(onError, message, member, args, cleanArgs) {
	const match = cleanArgs.match(LIGHTHOUSE_REGEX);
	if (!match) {
		return null;
	}
	const hostname = match[1];
	const path = match[2];
	if (!knownLighthouseInstances.includes(hostname)) {
		return {
			level: `<https://${hostname}${path}>`,
			note: `\n**Note**: ${hostname} is not a known/trusted instance of Project Lighthouse (yet?).`
		};
	}

	await lbpRateLimiter.wait(5000);
	const data = (await misc.httpsGet(hostname, path).catch(onError)).content;
	const start = data.search(`<h1>`) + 4;
	const end = data.search(`</h1>`);
	const title = misc.decodeHTML(data.substring(start, end).trim());
	return { level: `${title} – <https://${hostname}${path}>` };
}

const gameRoles = {
	"LittleBigPlanet": "716015233256390696",
	"LittleBigPlanet (PSP)": "716015332040507503",
	"Sackboy's Prehistoric Moves": "716015421878435891",
	"LittleBigPlanet 2": "716015284183367701",
	"LittleBigPlanet PS Vita": "716015465024979085",
	"LittleBigPlanet Karting": "716015510797680741",
	"Run Sackboy! Run!": "931711079132835910",
	"LittleBigPlanet 3": "716015547984117872",
	"Sackboy: A Big Adventure": "760606311679000626",
	"DLC": "729768987365474355"
};

const wrRoles = [
	"716014433121337504",
	"725437638974373978",
	"725437745262231602",
	"725437781073199265",
	"725437800874377317",
	"725437819224588300",
	"725437839403384962",
	"725437863381958696",
	"725437884420587703",
	"725437901680279637"
];

const ilWRRoles = {
	1: "784118229143781397",  // 1
	2: "784627988703739976",  // 2
	3: "784628034317058058",  // 3
	4: "784628058149617684",  // 4
	5: "784118331388854288",  // 5+
	10: "784118436585799721", // 10+
	20: "784118484342800384", // 20+
	30: "784118537933291541", // 30+
	40: "784118624197672960", // 40+
	50: "784118766145503232", // 50+
	60: "800566048586727454", // 60+
	70: "800566126827536385", // 70+
	80: "800566196738981888", // 80+
	90: "800566238891343873", // 90+
	100: "800566271573229659" // 100+
};

/** Maps from sr.c IDs to the game names */
const gameNameFromID = {
	"369pp31l": "LittleBigPlanet",
	"pd0n821e": "LittleBigPlanet (PSP)",
	"4d704r17": "Sackboy's Prehistoric Moves",
	"pdvzzk6w": "LittleBigPlanet 2",
	"369vz81l": "LittleBigPlanet PS Vita",
	"pd0n531e": "LittleBigPlanet Karting",
	"3698870d": "Run Sackboy! Run!",
	"k6qw8z6g": "LittleBigPlanet 3",
	"j1nevzx1": "Sackboy: A Big Adventure",
	"j1llxz71": "DLC"
	//"4d79me31": MULTI_GAME
};

/**
 * Maps from sr.c IDs to the categories
 * @type {NodeJS.Dict<Category>}
 */
let multiCategoryFromID;

/**
 * @param {Race} race
 */
function lbpOnRaceRecorded(race) {
	/** @type {Discord.Role | Discord.Role[]} */
	const roles = race.category.games
		? race.category.games.map((game) => gameRoles[game.name])
		: gameRoles[race.game.name];

	for (let entrant of race.entrantIterator()) {
		entrant.roles.add(roles);
	}
}

/** @type {GuildInput} */
const lbp = {
	id: "129652811754504192",
	name: "LittleBigPlanet", // LBP Speedrunning
	aliases: [ "lbp", "lbpsr" ],
	abbreviation: "lbp",
	guildCommand: "lbp",
	raceChannelIDs: [ "551242726251954185" ], // #racing
	modRoleIDs: [
		"485215306990747649", // Moderator
		"146643995307540480"  // Admin
	],
	moduleIDs: [ "lbp", "race_control", "race_coop", "roles" ],
	cleanUpGameName: function lbpCleanUpGameName(input) {
		return input.toLowerCase()
			.replace(/\W/g, "")
			.replace("littlebigplanet", "lbp")
			.replace(/psv(ita)?/, "vita")
			.replace(/(sackboys)?(prehistoric)?m(ov|em)es/, "spm")
			.replace(/multi(ple)?(lbp)?(games?)?/, MULTI_GAME);
	},
	games: {
		"LittleBigPlanet": {
			aliases: [ "lbp1", "1" ],
			default: true,
			categories: {
				"Any%": { defaultLoadTime: 240 },
				"100%": null,
				"Any% No Overlord": {
					aliases: [ "anynocreate", "nooverlord", "nocreate", "anyno", "anync", "no", "nc" ],
					default: true,
					defaultLoadTime: 240,
				},
				"100% No Overlord": { aliases: [ "100nocreate", "100no", "100nc" ] },
				"All Levels": { aliases: [ "al" ] },
				"Demo%": null,
				"Individual Levels": ilCategory,
			},
			levels: {
				"Introduction": { default: true },
				"First Steps": null,
				"Get a Grip": null,
				"Skate to Victory": null,
				"Tie Skipping": null,
				"Castle Climb Challenge": null,
				"Skateboard Freefall": null,
				"Die%": null,

				"Swinging Safari": null,
				"Burning Forest": null,
				"The Meerkat Kingdom": null,
				"Flaming Seesaws - Easy": null,
				"Flaming Seesaws - Medium": null,
				"Flaming Seesaws - Hard": null,
				"Tunnel Plunge": null,
				"Meerkat Bounce": null,
				"Styrofoam%": null,

				"The Wedding Reception": null,
				"The Darkness": null,
				"Skulldozer": null,
				"The Dangerous Descent": null,
				"Wobble Poles": null,
				"Bubble Labyrinth": null,

				"Boom Town": null,
				"The Mines": null,
				"Serpent Shrine": null,
				"Wrestler's Drag": null,
				"Cowabunga": null,
				"Roller Run - Easy": null,
				"Roller Run - Medium": null,
				"Roller Run - Hard": null,
				"Puzzle Wheel": null,

				"Lowrider": null,
				"Subway": null,
				"The Construction Site": null,
				"The Drag Race": null,
				"Elevation": null,
				"The Discombobulator": null,

				"Endurance Dojo": null,
				"Sensei's Lost Castle": null,
				"The Terrible Oni's Volcano": null,
				"Daruma San": null,
				"Wheel of Misfortune": null,
				"Roller Castle": null,

				"The Dancers' Court": null,
				"Elephant Temple": null,
				"Great Magician's Palace": null,
				"The Shifting Temple": null,
				"Pillar Jumping": null,
				"Fire Pits": null,

				"The Frozen Tundra": null,
				"The Bunker": null,
				"The Collector's Lair": null,
				"The Collector": null,
				"Spline Rider": null,
				"Rotor Tubes": null,
				"Jetpack Tunnel": null,
			},
		},
		"LittleBigPlanet (PSP)": {
			aliases: [ "psp", "lbpp", "p" ],
			categories: {
				"Any%": {
					default: true,
					defaultLoadTime: 330,
				},
				"100%": null,
				"Individual Levels": ilCategory,
			},
			levels: {
				"The Introduction": { default: true },
				"Walkabout": null,
				"Gift of the Grab": null,
				"Didgerido Didgeridon't": { aliases: [ "didgeridoodidgeridont" ] },
				"Dreamtime": null,

				"Mortar Do": null,
				"Dragon on a Bite": null,
				"Eggstraction": null,

				"Cheeky Monkey": null,
				"Thieve's Den": null,
				"Rugs and Kisses": { aliases: [ "highonrugs", "rugsnkisses" ] },

				"Get the Hump": null,
				"Sand Ahoy": null,
				"Fun Pharaoh": null,

				"Mountin' Exzcitement": null,
				"Peak Performance": null,
				"Dogged Determination": null,

				"Stitch Gordon": null,
				"Frying Saucers": null,
				"The Sewn Identity": null,
				"Opening Fright": null,

				"Crashing the Party": null,
				"Road to Joy": null,
				"The Procession": { aliases: [ "carnival" ] },
			},
		},
		"Sackboy's Prehistoric Moves": {
			aliases: [ "lbpspm", "lbpm", "m" ],
			categories: {
				"Any%": { default: true },
				"100%": null,
				"Individual Levels": ilCategory,
			},
			levels: {
				"Learning to Move": {
					aliases: [ "intro" ],
					default: true,
				},
				"Prehistoric Paradise": null,
				"Inside Big Rex": null,
				"Cro-Magnon City": null,
				"Hot Stepping": null,
				"Fossil Fight": null,
			},
			config: {
				race: { maxTeamSize: 5 },
			},
		},
		"LittleBigPlanet 2": {
			aliases: [ "2" ],
			categories: {
				"Any%": { defaultLoadTime: 150 },
				"100%": null,
				"Any% No Create": {
					aliases: anyNCAliases,
					default: true,
					defaultLoadTime: 150,
				},
				"All Levels": { aliases: [ "al" ] },
				"Demo%": null,
				"Individual Levels": ilCategory,
			},
			levels: {
				"Introduction": { default: true },
				"Rookie Test": null,
				"Grab and Swing": null,
				"Gripple Grapple": null,
				"Bravery Test": null,
				"Final Test": null,
				"Hedge Hopping": null,
				"Tower of Whoop": null,
				"Block Drop": null,
				"Super Block Drop": null,

				"Runaway Train": null,
				"Brainy Cakes": null,
				"The Cakeinator": null,
				"Currant Affairs": null,
				"Kling Klong": null,
				"Rodent Derby": null,
				"Death by Shockolate": null,
				"Attack of the Mutant Marshmallows": null,

				"Maximum Security": null,
				"Pipe Dreams": null,
				"Bang for Buck": null,
				"Waste Disposal": null,
				"Fowl Play": null,
				"Basketball": null,
				"Split Paths": null,
				"Sackbot Bounce": null,

				"Avalon's Advanced Armaments Academy": { aliases: [ "aaaa" ] },
				"Got The Hump": null,
				"The Sackbot Redemption": null,
				"Flying In The Face Of Danger": { aliases: [ "fitfod" ] },
				"Huge Peril For Huge Spaceship": { aliases: [ "hpfhs" ] },
				"On Burrowed Time": null,
				"Gobotron": null,
				"Click Flick": null,

				"Up And At 'Em": null,
				"Patients Are A Virtue": null,
				"Fireflies When You're Having Fun": { aliases: [ "fwyhf", "ffwyhf" ] },
				"Casa Del Higginbotham": null,
				"Invasion Of The Body Invaders": { aliases: [ "iotbi" ] },
				"Hungry Caterpillars": null,
				"Mind Control": null,
				"Root Canal": null,

				"Set The Controls For The Heart Of The Negativatron": { aliases: [ "stcfthotn" ] },
				"Full Metal Rabbit": { aliases: [ "fullmetalrbd", "fullmetalrabid" ] },
				"Where In The World Is Avalon Centrifuge?": { aliases: [ "witwiac" ] },
				"Fight of the Bumblebee": { aliases: [ "fightofbumblebees", "flightofbumblebee", "flightofbumblebees" ] },
				"Into The Heart Of The Negativatron": null,
				"Rocket Funland": null,
				"Ping Pang Pong": null,
				"Space Pool": null,
			},
		},
		"LittleBigPlanet PS Vita": {
			aliases: [ "vita", "lbpv", "v"],
			categories: {
				"Any%": {
					default: true,
					defaultLoadTime: 840,
				},
				"100%": null,
				"Individual Levels": ilCategory,
			},
			levels: {
				"Introduction": { default: true },
				"First Lessons In Loco-Motion": null,
				"Swing-Bop Acrobatics": null,
				"Flounder's Jump & Jive": null,
				"Palace Of The Peculiar": null,
				"Piano of Peril": null,
				"Bonce Tappin'": null,
				"Tower Builder": null,
				"Wall Or Nothing": null,

				"A Wander Into Yonder": null,
				"Cogwheel Creek": null,
				"The Odd Rocket": null,
				"Mine O'Threat": null,
				"Driller Thriller": null,
				"Flower Pop": null,
				"Stream Race": null,

				"Hooks & Beats": null,
				"The Discard Factory": null,
				"High Tech Tunneling": null,
				"The Mainframe Heist": null,
				"A Capacitor For Evil": null,
				"Air Hockey": null,
				"Super Boxing": null,
				"Bounce Bop Hop": null,
				"Collision Course": null,

				"Spare Part Pursuit": null,
				"Three Wheel Tracks": null,
				"Makeshift Transportation": null,
				"An Appetite For Metal": null,
				"Flick-A-Bullseye": null,
				"Toy Tanks": null,
				"Chopper Throw": null,

				"Sunshine & Shadows": null,
				"A Recipe For Unpleasantness": null,
				"High Pressure Cellar": null,
				"Re-Animation Station": null,
				"In The Clutches Of Evil": null,
				"Zombie Springtime": null,
				"Eye Ball Maze": null,
				"Sorting Panic": null,
			},
		},
		"LittleBigPlanet Karting": {
			aliases: [ "karting", "lbpk", "k" ],
			categories: {
				"Any%": {
					default: true,
					defaultLoadTime: 1440,
				},
				"100%": null,
				"Individual Levels": ilCategory,
			},
			levels: {
				"Karting Lessons": {
					aliases: [ "intro" ],
					default: true,
				},
				"Garden Grip": null,
				"After The Wedding": null,
				"Serpent's Shrine": { aliases: [ "serpentshrine" ] },
				"Mine The Gap": null,
				"King's Castle": null,
				"Training Wheels": null,
				"Target Practice": null,
				"Self Defence": null,
				"Savannah Rally": null,
				"Craftworld GP": null,
				"Sackboy RC": null,

				"Turtle Island": null,
				"The Emperor Has No Clues": null,
				"Huge Monster Rally": null,
				"Night Rider": null,
				"Egg Kartin": null,
				"Egg Hunt": null,
				"Star Fishin'": null,

				"Sugar Rush": null,
				"Current Events": null,
				"Cakes on a Train": null,
				"Don't Go Baking My Kart": null,

				"Future Perfect": null,
				"Zeppelins Rule!": null,
				"The Infallible Breakfast Machine": null,
				"World's Fair in Love and War": null,
				"Best Before Date": null,
				"Monster Trucks": null,
				"Tank Combat": null,
				"Stuck In Jam": null,

				"Roots Of All Evil": null,
				"Firebug Circuit": null,
				"On the Wormpath": null,
				"Venus Speedtrap RC": null,

				"2.0 Bee Or Not 2.0 Bee": { aliases: [ "2beeornot2bee" ] },
				"RoboBun Test Chamber": null,
				"Huge Spaceship": null,
				"Lost In Bass": null,
				"Drum Smash": null,
				"The Funkhole (and Beyond?)": { aliases: [ "funkhole" ] },
				"Assault on Batteries": null,
				"Ride Scroller": null,
				"Full Tilt": null,

				"The Garage at the End of the Craftverse": { aliases: [ "tgateotc", "gateotc" ] },
			},
		},
		"Run Sackboy! Run!": {
			aliases: [ "r", "rsr", "run", "runsackboy", "rsbr" ],
			categories: {
				"First Loop": {
					aliases: [ "first", "1st", "1stloop", "loop1" ],
					default: true
				},
				"Second Loop": { aliases: [ "second", "2nd", "2ndloop", "loop2" ] },
				"100%": null,
			},
		},
		"LittleBigPlanet 3": {
			aliases: [ "3" ],
			categories: {
				"Any%": { defaultLoadTime: 60 },
				"100%": null,
				"Any% No Create": {
					aliases: anyNCAliases,
					default: true,
					defaultLoadTime: 660,
				},
				"All Main Quests": {
					aliases: [ "amq" ],
					defaultLoadTime: 1200,
				},
				"Profile Corruption%": { aliases: [ "corruption", "pc", "crash" ] },
				"Individual Levels": ilCategory,
			},
			levels: {
				"Introduction": { default: true },
				"Needlepoint Peaks": null,
				"Newton's Airship": null,
				"Stitchem Manor": null,
				"Tinpot Towers": null,

				"High Stakes Heist": null,
				"Deep Space Drive-in": null,
				"Shake, Rattle & Roll": null,
				"Crumbling Crypts": { aliases: [ "didyouknowyoucanscamperupwalls", "didyouknowyoucouldscamperupwalls" ] },
				"Lights, Camera, Traction!": null,
				"Guess Who's Coming To Dinner?": null,
				"Back In The Saddle": null,
				"Two Company": null,
				"The Wheel Deal": null,
				"Race to the Stars": null,

				"Go Loco": null,
				"Furry Soles, Hot Coals": null,
				"Flip-Flopped Folios": null,
				"Tutu Tango": null,
				"On The Link Of Disaster": null,
				"Bear With Us": null,
				"No Drain No Gain": null,
				"Here, There and Everywhere": null,

				"Masque Maker's Tower": null,
				"Belly Of The Beast": null,
				"Cloud Caravan": null,
				"The Great Escape": null,
				"Even Bosses Wear Hats Sometimes": null,
				"Battle Of The Airwaves": null,
				"Joust In Time": null,
			},
		},
		"Sackboy: A Big Adventure": {
			aliases: [ "saba", "sackboy", "s" ],
			categories: {
				"Any%": {
					default: true,
					defaultLoadTime: 600,
				},
				"New Game+": {
					aliases: [ "ng" ],
					defaultLoadTime: 600,
				},
				"100%": null,
				"Individual Levels": ilCategory,
			},
			levels: {
				"Trial 1: Ain't Seen Nothing Yeti": { aliases: [ "trial1", "aintseennothingyeti" ] },
				"Trial 2: Jumping The Queue": { aliases: [ "trial2", "jumpingthequeue" ] },
				"Trial 3: Turn for the Worse": { aliases: [ "trial3", "turnfortheworse" ] },
				"Trial 4: Let's Bounce": { aliases: [ "trial4", "letsbounce" ] },
				"Trial 5: The Flip Side": { aliases: [ "trial5", "flipside" ] },
				"Trial 6: Tilty Pleasures": { aliases: [ "trial6", "tiltypleasures" ] },
				"Trial 7: Don't Turret Up": { aliases: [ "trial7", "dontturretup" ] },
				"Trial 8: Sealife or Death": { aliases: [ "trial8", "sealifeordeath" ] },
				"Trial 9: You Jelly?": { aliases: [ "trial9", "youjelly" ] },
				"Trial 10: On Ya Spike": { aliases: [ "trial10", "onyaspike" ] },
				"Trial 11: Trial by Fire": { aliases: [ "trial11", "trialbyfire", "trialbybean" ] },
				"Trial 12: Spinning Class": { aliases: [ "trial12", "spinningclass" ] },
				"Trial 13: Sweet Beams": { aliases: [ "trial13", "sweetbeams", "sweetbeans" ] },
				"Trial 14: Stitch in Time": { aliases: [ "trial14", "stitchintime" ] },
				"Trial 15: Fish 'N' Slips": { aliases: [ "trial15", "fishnslips" ] },
				"Trial 16: The Ripsnorter": {
					aliases: [ "trial16", "ripsnorter", "alltrials" ],
					default: true,
				},

				"A Big Adventure": null,
				"Cold Feat": null,
				"Up For Grabs": null,
				"Keys To Success": null,
				"Friends In High Places": null,
				"Ready Yeti Go": null,
				"Treble In Paradise": { aliases: [ "dmca" ] },
				"Have You Herd?": null,
				"Blowing Off Steam": null,
				"Having A Blast": null,
				"Ice Cave Dash": null,

				"Between The Lines": null,
				"Snowman Left Behind": null,
				"Highwire Escape": null,

				"Sticking With It": null,
				"A Cut Above The Rest": null,
				"Slippery Slope": null,
				"Beat The Heat": null,
				"Monkey Business": null,
				"Going Bananas": null,
				"Weight For Me!": null,
				"Water Predicament": null,
				"The Home Stretch": null,
				"Pier Pressure": null,
				"Matter Of Factory": null,
				"Centipedal Force": null,
				"Factory Dash": null,

				"Riverside Rumble": null,

				"Sink or Swing": null,
				"Ferried Treasure": null,
				"Highs and Glows": null,
				"Pull Yourselves Together": null,
				"Bubble Jeopardy": null,
				"Thar She Blows": null,
				"Choral Reef": null,
				"Light At The Museum": null,
				"Squid Goals": null,
				"Eelectro Swing": null,
				"The Deep End": null,
				"Sea Trench Escape": null,

				"Seesaws on the Sea Floor": null,
				"The Graveyard Shift": null,

				"Boot Up Sequence": null,
				"Touch and Go": null,
				"Lead the Weigh": null,
				"Fight And Flight": null,
				"Science Friction": null,
				"Pros And Conveyors": null,
				"One Track Mind": null,
				"This Way Up": null,
				"Escape Velocity": null,
				"Swipe Right": null,
				"Nervous System": null,
				"Spaceport Dash": null,

				"The Struggle Is Rail": null,
				"Flossed In Space": null,

				"Off The Rails": null,
				"Keep It Tidy": null,
				"Double Down": null,
				"Stick or Twist": null,
				"Flash Forward": null,
				"Just A Phase": null,
				"Crate Expectations": null,
				"Multitask Force": null,
				"Doom & Bloom": null,
				"Until Vex Time": null,
				"Doom & Dash": null,
				"Jumping to Conclusions": null,
				"Vexpiration Date": null,

				"Keep On Leaping On": null,
				"Best in Throw": null,
				"High and Mighty": null,
				"In Full Swing": null,
				"Little Big Finale": null,
			},
		},
		"DLC": {
			aliases: [ "lbpdlc", "lbpseriesdlc", "seriesdlc" ],
			categories: {
				"Individual Levels": {
					aliases: ilAliases,
					default: true,
					il: true,
				},
			},
			levels: {
				"Metal Gear Solid Level Pack": {
					aliases: [ "mgs" ],
					default: true,
				},
				"Pirates of the Caribbean Level Kit": { aliases: [ "potc" ] },
				"Marvel Level Pack": null,
				"Toy Story Level Kit": null,
				"Move Pack: The Rise of the Cakeling": { aliases: [ "rotc" ] },
				"The Muppets Level Kit": null,
				"Cross-Controller Pack": { aliases: [ "ccp", "xcp" ] },
				"DC Comics Level Pack": { aliases: [ "dc" ] },
				"DC Comics Level Pack (Vita)": { aliases: [ "dccomicsv", "dcvita", "dcv" ] },
				"LittleBigPlanet 3: The Journey Home": { aliases: [ "journeyhome" ] },

				"Monsters Kit": null,
				"History Kit": null,
				"The Incredibles Level Kit": null,
				"The Nightmare Before Christmas Level Kit": { aliases: [ "nbc" ] },
				"Tiki Paradise Level Kit": null,
				"Adventure Time Level Kit": null,
				"Back to the Future Level Kit": null,
				"Seaside Surprise Level Kit": null,

				"Act 1: Introduction": { aliases: [ "act1", "intro" ] },
				"Act 2: VR Training": { aliases: [ "act2", "vrtraining" ] },
				"Act 3: The Mission": { aliases: [ "act3", "mission" ] },
				"Act 4: The Level Factory": { aliases: [ "act4", "levelfactory" ] },
				"Act 5: The Boss": { aliases: [ "act5", "boss" ] },
				"VR Survival Challenge": { aliases: [ "vrsurvival" ] },

				"Port Royal": null,
				"Pirate Town": null,
				"A Navy Frigate": null,
				"Cursed Bay": null,
				"The Kraken!!!!": null,
				"Diving For Treasure": null,

				"Issue 1 - Downtown Doom": { aliases: [ "issue1", "downtowndoom" ] },
				"Issue 2 - Freeway Frenzy": { aliases: [ "issue2", "freewayfrenzy" ] },
				"Issue 3 - Mad Lab": { aliases: [ "issue3", "madlab" ] },
				"Issue 4 - Rocket Rampage": { aliases: [ "issue4", "rocketrampage" ] },

				"The Watchtower": null,
				"No Pause On Paradise Island": null,
				"Toxic Terror!": null,
				"A Frosty Reception": null,
				"Mecha-Lex Madness": null,
				"And For Your Next Test...": null,
				"Raiding the Kitchen": null,

				"Stone": null,
				"Beavercows' Insomnia": null,
				"The Steampunk Samurai": null,
				"Bunnies In Space": null,
				"Tales of the Little Big Crystal": null,
				"Until The Cows Come Home": null,
				"In search": null,
				"Prism Panic": null,
				"Evil Duckies!": null,
				"Tube Racer 2": null,
				"THE CAT BURGLAR": null,
				"The Tumblerizer": null,
				"The GREAT GRATUITOUS RAID of GOBLIN-BERG!": null,
				"PANDAmonium": null,
				"Cereal Isle": null,
				"Watermill Valley": null,
				"Mighty Mite LBP8 Little Big Mountain Mission": { aliases: [ "mightymite", "mightymitelbp8", "littlebigmountainmission" ] },
				"TAKLAMAKAN 'Go and never come back'": { aliases: [ "taklamakan", "goandnevercomeback" ] },
			},
			config: {
				cleanUpLevelName: function lbpdlcCleanUpLevelName(input) {
					return lbpCleanUpLevelName(input).replace(/(level|move)?(pack|kit)/g, "");
				},
			},
		},
	},
	multiGame: {
		categories: {
			"An3%": {
				default: true,
				games: [ "1", "2", "3" ]
			},
			"7ny%": {
				aliases: [ "7y" ],
				games: [ "1", "p", "m", "2", "v", "k", "3" ]
			}
		}
	},
	commandPrefix: "!",
	commandExamples: {
		raceCategory: "category 2/il",
		raceLevel: "level first steps",
		raceTeam: "team rbdjellyfish",
		raceMe: "me saba",
		raceRunner: "runner kadiwa/lbp1",
		raceLeaderboard: "elo 1/no"
	},
	roles: {
		init: function lbpRolesInit(guild) {
			guild.sqlite.getUserGamesRan = guild.database.prepare("SELECT DISTINCT game, category FROM user_stats WHERE user_id = ?;");

			const multiCategories = guild.games[MULTI_GAME].categories;
			multiCategoryFromID = {
				"wkp3v8v2": multiCategories["an3"],
				"7dg69w4k": multiCategories["7ny"]
			};

			guild.on("raceRecorded", lbpOnRaceRecorded);

			const allRoles = Object.values(gameRoles);
			allRoles.push(...wrRoles, ...Object.values(ilWRRoles));
			return new Set(allRoles);
		},
		getRoles: function lbpGetRoles(member, srcData) {
			const { guild } = member;

			/** @type {Set<string>} */
			const newRoles = new Set();
			const wrCounts = { fullGame: 0, il: 0 };
			for (let run of srcData) {
				// filters out LBPCE
				if (run.run.game === "76r33je6") {
					continue;
				}

				if (run.place === 1) {
					wrCounts[run.run.level ? "il" : "fullGame"] += 1;
				}

				newRoles.add(gameRoles[gameNameFromID[run.run.game]]
					?? multiCategoryFromID[run.run.category].games.map((game) => gameRoles[game.name]));
			}

			if (wrCounts.fullGame > 0) {
				newRoles.add(wrRoles[(wrCounts.fullGame >= 10) ? 9 : wrCounts.fullGame - 1]);
			}

			if (wrCounts.il > 0) {
				if (wrCounts.il < 10) {
					newRoles.add(ilWRRoles[(wrCounts.il >= 5) ? 5 : wrCounts.il]);
				} else {
					newRoles.add(ilWRRoles[(wrCounts.il >= 100) ? 100 : 10 * Math.floor(wrCounts.il / 10)]);
				}
			}

			const multiGame = guild.games[MULTI_GAME];
			for (let stat of guild.sqlite.getUserGamesRan.all(member.id)) {
				if (stat.game === MULTI_GAME) {
					const category = multiGame.getCategory(stat.category);
					if (category) {
						for (let role of category.games.map((game) => gameRoles[game.name])) {
							newRoles.add(role);
						}
					}
				} else {
					newRoles.add(gameRoles[stat.game]);
				}
			}

			return newRoles;
		},
		srcAPIFilter: "?series=v7emqr49",
		unicodeNameFix: false
	},
	config: {
		race: {
			maxTeamSize: 4,
			elo: {
				calculateTeamElo: function lbpCalculateTeamElo(elos) {
					return (Math.max(...elos) * (elos.length - 1) + elos.reduce((elo1, elo2) => elo1 + elo2)) / (2 * elos.length - 1);
				}
			},
			communityLevels: lbpCommunityLevels
		},
		cleanUpCategory: lbpCleanUpCategory,
		cleanUpLevelName: lbpCleanUpLevelName,
		emotes: {
			acknowledge: emotes.rbdBingo,
			elo: emotes.ppjSmug,

			notReady: "🔸",
			ready: "✅",

			countdownStart: emotes.ppjWink,
			countdown: emotes.ppjE,
			raceStart: emotes.ppjSmug,

			firstPlace: "🥇",
			secondPlace: "🥈",
			thirdPlace: "🥉",
			done: "🏁",
			racing: "⏱",
			forfeited: "❌"
		}
	}
};

export default lbp;
