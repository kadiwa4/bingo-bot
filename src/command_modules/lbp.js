import Command from "../Command.js";

export const id = "lbp";

/** @type {NodeJS.Dict<Command>} */
export const commands = {
    lbpLenny: {
        aliases: [ "lenny" ],
        guildDependent: false,
        onUse: function lbpLenny(onError, message) {
            message.channel.send("( ͡° ͜ʖ ͡°)");
        }
    },
    lbpNewRunner: {
        aliases: [ "newrunner", "nr" ],
        onUse: function lbpNewRunner(onError, message) {
            message.inlineReply(`${randomRunners[Math.floor(Math.random() * randomRunners.length)][0]}${randomRunners[Math.floor(Math.random() * randomRunners.length)][1]}`);
        }
    }
};

const randomRunners = [ ["KaDi", "Wa"], ["p-p", "-j"], ["Rbd", "Jellyfish"], ["Liam", "12221"], ["Wiigo", "cadee"], ["Slen", "ds"], ["Krosso", "TV"], ["Gen", "rist"], ["Loud", "Orange"], ["Darkened", "_Duck"], ["bross", "entia"], ["Fire", "Thieff"], ["Sean", "Vertigo"], ["Abstract", "Sadd"], ["Glit", "cher"], ["a50_Caliber", "_Camel"], ["Retro", "gamer1246"], ["Ted", "der"], ["A2on", "Craft"], ["xsHI", "MEsx"], ["Lombax", "_Pieboy"], ["Sam", "pai"], ["Gel", "ly"], ["flying", "_ragey"], ["fri", "tt_"], ["Ricky", "Pipe"], ["yes", "oops"], ["E", "man1530"], ["Lenny", "verse"], ["Mad", "brine"], ["legit", "knight39"], ["Mr.", " zebra"], ["ture", "cross"], ["k", "zix4_"], ["Cookiest", "Monster"], ["Deli", "tris"], ["Wobb", "ulz"], ["TheAlpha", "Moose"], ["cheeky", "chunk"], ["Hoon", "Goons"], ["Norton", "Antivirus"], ["Over The", " Horizon"], ["Shoe", "SABA"], ["deep", " mind"], ["O", "mar1"], ["red", "wed6"], ["tas", "rhys"], ["Tai", "therZ"], ["Th3", "Re4l"] ];
