import Command from "../Command.js";

export const id = "lbp";

/** @type {NodeJS.Dict<Command>} */
export const commands = {
	lbpLenny: {
		aliases: [ "lenny" ],
		description: "Responds with ( ͡° ͜ʖ ͡°)",
		guildDependent: false,
		onUse: function lbpLenny(onError, message) {
			message.channel.send("( ͡° ͜ʖ ͡°)");
		},
	},
	lbpNewRunner: {
		aliases: [ "newrunner", "nr" ],
		description: "Combines 2 LBP speedrunner names",
		onUse: function lbpNewRunner(onError, message) {
			const index1 = Math.floor(Math.random() * randomRunners.length);
			let index2 = Math.floor(Math.random() * (randomRunners.length - 1));
			index2 += +(index1 <= index2);
			message.inlineReply(`${randomRunners[index1][0]}${randomRunners[index2][1]}`);
		},
	},
};

const randomRunners = [ [ "KaDi", "Wa" ], [ "p-p", "-j" ], [ "Rbd", "Jellyfish" ], [ "Liam", "12221" ], [ "Wiigo", "cadee" ], [ "Slen", "ds" ], [ "Krosso", "TV" ], [ "fin", "raptor" ], [ "Loud", "Orange" ], [ "Darkened", "_Duck" ], [ "bross", "entia" ], [ "Fire", "Thieff" ], [ "Sean", "Vertigo" ], [ "Abstract", "Sadd" ], [ "Glit", "cher" ], [ "a50_Caliber", "Camel" ], [ "Retro", "gamer1246" ], [ "Ted", "der" ], [ "A2on", "Craft" ], [ "xsHI", "MEsx" ], [ "Lombax", "_Pieboy" ], [ "Sam", "pai" ], [ "Gel", "ly" ], [ "flying", "_ragey" ], [ "fri", "tt_" ], [ "Ricky", "Pipe" ], [ "yes", "oops" ], [ "E", "man1530" ], [ "Lenny", "verse" ], [ "Metra", "berryy" ], [ "legit", "knight39" ], [ "Mr.", " zebra" ], [ "ture", "cross" ], [ "k", "zix4_" ], [ "Cookiest", "Monster" ], [ "Deli", "tris" ], [ "Wobb", "ulz" ], [ "TheAlpha", "Moose" ], [ "Hoon", "Goons" ], [ "Norton", "Antivirus" ], [ "Over", " The Horizon" ], [ "Shoe", "SABA" ], [ "deep", " mind" ], [ "red", "wed6" ], [ "tas", "rhys" ], [ "Tai", "therZ" ], [ "Th3", "Re4l" ], [ "Kiwa", "mi" ], [ "Chris", " the Gamer" ], [ "in", "alone" ], [ "night", "carries" ], [ "Motor", "jam" ], [ "Uber", "Cat" ], [ "Toast", "brot" ], [ "Cave", "Spider" ], [ "elliots", "007" ], [ "Arcania", "CQ" ], [ "Fuzzy", " Cactus" ], [ "Lewwy", "Lemons" ], [ "Cow", "Hax" ], [ "Nor", "Xor" ], [ "Pola", "ra" ], [ "IStudySwag", "UStudyMath" ], [ "Mike Da", " Ike" ] ];
