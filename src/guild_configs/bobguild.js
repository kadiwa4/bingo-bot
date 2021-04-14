/// <reference path="../types.d.ts" />

import Category from "../Category.js";
import { MULTI_GAME } from "../misc.js";
import Race from "../Race.js";

import Discord from "discord.js";

const emotes = {
    ppjE: "<:ppjE:795059062403760129>", // "<:ppjE:230442929859198977>" REPLACE
    ppjSmug: "<:ppjSmug:795059081957343260>", // "<:ppjSmug:230442929838227457>" REPLACE
    ppjWink: "<:ppjWink:795059091969671169>" // "<:ppjWink:367254404811980801>" REPLACE
};

const ilAliases = [ "il", "ils" ];
const anyNCAliases = [ "anynooverlord", "nocreate", "nooverlord", "anync", "anyno", "nc", "no" ];

const COOP_REGEX = /coop|[2-5]p(layers?)?/;

/**
 * @param {string} input
 * @returns {{ name: string; coop: boolean; }}
 */
function bobCleanUpCategory(input) {
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
function bobCleanUpLevelName(input) {
    return input.toLowerCase()
        .replace(/&/g, "and")
        .replace(/\W|^the/g, "")
        .replace("introduction", "intro");
}

let gameRoles;
let wrRoles;
let ilWRRoles;

/** Maps from sr.c IDs to the game names */
const gameNameFromID = {
    "369pp31l": "LittleBigPlanet",
    "pd0n821e": "LittleBigPlanet (PSP)",
    "4d704r17": "Sackboy's Prehistoric Moves",
    "pdvzzk6w": "LittleBigPlanet 2",
    "369vz81l": "LittleBigPlanet PS Vita",
    "pd0n531e": "LittleBigPlanet Karting",
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

const ilFullGameCategories = new Set([
    "824xr8md", // LBP1 - Styrofoam%
    "9d8pgl6k", // LBP1 - Die%
    "7dg8qml2", // LBP3 - Profile Corruption%
    "5dw60re2"  // SABA - Trial 16
]);

/**
 * @param {Race} race
 */
function bobOnRaceRecorded(race) {
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
    id: "794629930667343915", // "129652811754504192" REPLACE
    name: "bob testing", // "LittleBigPlanet" REPLACE // LBP Speedrunning
    aliases: [ "bob" ], // [ "lbp", "lbpsr" ] REPLACE
    abbreviation: "bob", // "LBP" REPLACE
    guildCommand: "bob", // "lbp" REPLACE
    raceChannelIDs: [
        "794629930667343918",
        "814156861221634089"
    ], // [ "551242726251954185" ] REPLACE // #racing
    modRoleIDs: [ "795064134609666118" ], /*[
        "485215306990747649", // Moderator
        "146643995307540480"  // Admin
    ] REPLACE */
    moduleIDs: [ "lbp", "race_control", "roles" ],
    commonCategories: {
        "Individual Levels": {
            aliases: ilAliases,
            il: true
        }
    },
    cleanUpGameName: function bobCleanUpGameName(input) {
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
                "Any%": null,
                "100%": null,
                "Any% No Overlord": {
                    aliases: [ "anynocreate", "nooverlord", "nocreate", "anyno", "anync", "no", "nc" ],
                    default: true
                },
                "All Levels": { aliases: [ "al" ] }
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
                "Jetpack Tunnel": null
            }
        },
        "LittleBigPlanet (PSP)": {
            aliases: [ "psp", "lbpp", "p" ],
            categories: {
                "Any%": { default: true },
                "100%": null
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
                "The Procession": { aliases: [ "carnival" ] }
            }
        },
        "Sackboy's Prehistoric Moves": {
            aliases: [ "lbpspm", "lbpm", "m" ],
            categories: {
                "Any%": { default: true },
                "100%": null
            },
            levels: {
                "Learning to Move": {
                    aliases: [ "intro" ],
                    default: true
                },
                "Prehistoric Paradise": null,
                "Inside Big Rex": null,
                "Cro-Magnon City": null,
                "Hot Stepping": null,
                "Fossil Fight": null
            },
            config: {
                race: { maxTeamSize: 5 }
            }
        },
        "LittleBigPlanet 2": {
            aliases: [ "2" ],
            categories: {
                "Any%": null,
                "100%": null,
                "Any% No Create": {
                    aliases: anyNCAliases,
                    default: true
                },
                "All Levels": { aliases: [ "al" ] }
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
                "Space Pool": null
            }
        },
        "LittleBigPlanet PS Vita": {
            aliases: [ "vita", "lbpv", "v"],
            categories: {
                "Any%": { default: true },
                "100%": null
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
                "Sorting Panic": null
            }
        },
        "LittleBigPlanet Karting": {
            aliases: [ "karting", "lbpk", "k" ],
            categories: {
                "Any%": { default: true },
                "100%": null
            },
            levels: {
                "Karting Lessons": {
                    aliases: [ "intro" ],
                    default: true
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

                "The Garage at the End of the Craftverse": { aliases: [ "tgateotc", "gateotc" ] }
            }
        },
        "LittleBigPlanet 3": {
            aliases: [ "3" ],
            categories: {
                "Any%": null,
                "100%": null,
                "Any% No Create": {
                    aliases: anyNCAliases,
                    default: true
                },
                "All Main Quests": { aliases: [ "amq" ] },
                "Profile Corruption%": { aliases: [ "corruption", "pc", "crash" ] }
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
                "Joust In Time": null
            }
        },
        "Sackboy: A Big Adventure": {
            aliases: [ "saba", "sackboy", "s" ],
            categories: {
                "Any%": { default: true },
                "New Game+": { aliases: [ "ng" ] },
                "100%": null
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
                    default: true
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
                "Little Big Finale": null
            }
        },
        "DLC": {
            aliases: [ "lbpdlc", "lbpseriesdlc", "seriesdlc" ],
            categories: {
                "Individual Levels": {
                    aliases: ilAliases,
                    default: true,
                    il: true
                }
            },
            levels: {
                "Metal Gear Solid Level Pack": {
                    aliases: [ "mgs" ],
                    default: true
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
                "TAKLAMAKAN 'Go and never come back'": { aliases: [ "taklamakan", "goandnevercomeback" ] }
            },
            config: {
                cleanUpLevelName: function lbpdlcCleanUpLevelName(input) {
                    return bobCleanUpLevelName(input).replace(/(level|move)?(pack|kit)/g, "");
                }
            }
        }
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
        init: function bobRolesInit(guild, role) {
            guild.sqlite.getUserGamesRan = guild.database.prepare("SELECT DISTINCT game, category FROM user_stats WHERE user_id = ?;");
            gameRoles = {
                "LittleBigPlanet": role("797952946150440960"), // role("716015233256390696") REPLACE
                "LittleBigPlanet (PSP)": role("797953068159074325"), // role("716015332040507503") REPLACE
                "Sackboy's Prehistoric Moves": role("797953108616413207"), // role("716015421878435891") REPLACE
                "LittleBigPlanet 2": role("797953167790571558"), // role("716015284183367701") REPLACE
                "LittleBigPlanet PS Vita": role("797953189961269278"), // role("716015465024979085") REPLACE
                "LittleBigPlanet Karting": role("797953243023802431"), // role("716015510797680741") REPLACE
                "LittleBigPlanet 3": role("797953274270449694"), // role("716015547984117872") REPLACE
                "Sackboy: A Big Adventure": role("797954957784383538"), // role("760606311679000626") REPLACE
                "DLC": role("797953016271470632") // role("729768987365474355") REPLACE
            };

            wrRoles = [
                role("797953312540459078"), // role("716014433121337504") REPLACE // 1
                role("797953352087371787"), // role("725437638974373978") REPLACE // 2
                role("797953626194182194"), // role("725437745262231602") REPLACE // 3
                role("797953610108370984"), // role("725437781073199265") REPLACE // 4
                role("797953595752054786"), // role("725437800874377317") REPLACE // 5
                role("797953578798940182"), // role("725437819224588300") REPLACE // 6
                role("797953560536285185"), // role("725437839403384962") REPLACE // 7
                role("797953542299058196"), // role("725437863381958696") REPLACE // 8
                role("797953512133754892"), // role("725437884420587703") REPLACE // 9
                role("797953471579553802") // role("725437901680279637") REPLACE // 10+
            ];

            ilWRRoles = {
                1: role("797953960316239902"), // role("784118229143781397") REPLACE // 1
                2: role("797953941731541002"), // role("784627988703739976") REPLACE // 2
                3: role("797953924271308830"), // role("784628034317058058") REPLACE // 3
                4: role("797953897197076501"), // role("784628058149617684") REPLACE // 4
                5: role("797953871284666398"), // role("784118331388854288") REPLACE // 5+
                10: role("797953843093569557"), // role("784118436585799721") REPLACE // 10+
                20: role("797953811028377631"), // role("784118484342800384") REPLACE // 20+
                30: role("797953763897376778"), // role("784118537933291541") REPLACE // 30+
                40: role("797953740261818399"), // role("784118624197672960") REPLACE // 40+
                50: role("797953711703851078"), // role("784118766145503232") REPLACE // 50+
                60: role("814211501065896046"), // role("800566048586727454") REPLACE // 60+
                70: role("814211629830111293"), // role("800566126827536385") REPLACE // 70+
                80: role("814211652965892118"), // role("800566196738981888") REPLACE // 80+
                90: role("814211666325667852"), // role("800566238891343873") REPLACE // 90+
                100: role("814211678270652419") // role("800566271573229659") REPLACE // 100+
            };

            const multiCategories = guild.games[MULTI_GAME].categories;
            multiCategoryFromID = {
                "wkp3v8v2": multiCategories["an3"],
                "7dg69w4k": multiCategories["7ny"]
            };

            guild.on("raceRecorded", bobOnRaceRecorded);

            const allRoles = Object.values(gameRoles);
            allRoles.push(...wrRoles, ...Object.values(ilWRRoles));
            return new Set(allRoles);
        },
        getRoles: function bobGetRoles(member, srcData) {
            const { guild } = member;

            /** @type {Set<Discord.Role>} */
            const newRoles = new Set();
            const wrCounts = { fullGame: 0, il: 0 };
            for (let run of srcData) {
                if (run.place === 1) {
                    wrCounts[(!run.run.level || ilFullGameCategories.has(run.run.category))
                        ? "fullGame" : "il"]++;
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
                    newRoles.add(ilWRRoles[(wrCounts.il >= 100)
                        ? 100 : 10 * Math.floor(wrCounts.il / 10)])
                }
            }

            const multiGame = guild.games[MULTI_GAME];
            for (let stat of guild.sqlite.getUserGamesRan.all(member.id)) {
                if (stat.game === MULTI_GAME) {
                    const category = multiGame.getCategory(stat.category);
                    if (category) {
                        newRoles.add(category.games.map((game) => gameRoles[game.name]));
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
                calculateTeamElo: function bobCalculateTeamElo(elos) {
                    return (Math.max(...elos) * (elos.length - 1) + elos.reduce((elo1, elo2) => elo1 + elo2)) / (2 * elos.length - 1);
                }
            }
        },
        cleanUpCategory: bobCleanUpCategory,
        cleanUpLevelName: bobCleanUpLevelName,
        emotes: {
            acknowledge: "795059101402791936", // "394255134340677634" REPLACE // :rbdBingo:
            elo: emotes.ppjSmug,

            countdownStart: emotes.ppjWink,
            countdown: emotes.ppjE,
            raceStart: emotes.ppjSmug
        }
    }
};

export default lbp;
