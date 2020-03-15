var exports = module.exports = {};

exports.funCmds = (lowerMessage, message) => {
    // Fun commands (available anywhere)
    if (lowerMessage.startsWith("!nr") || lowerMessage.startsWith("!newrunner"))
        newRunnerCmd(message);
}

// !nr/!newrunner
const runnerPrefixes = ["KaDi", "Rbd",      "Liam",  "Violin", "Gen",  "Thug",       "Krosso", "The",      "pringles", "Mon", "Caramba", "p-p", "Dbp",    "Fire",   "fri", "Gentleman", "jc0", "KILLI",  "legit",    "Lombax",  "OgThe",  "Mar", "Loud",   "pb",    "King", "Sky", "Retro"];
const runnerSuffixes = ["Wa",   "Jellfish", "12221", "Gamer",  "rist", "Soldier420", "TV",     "Glitcher", "_fan",     "tra", "zmg",     "-j",  "Gaming", "Thieff", "tt",  "Tom",       "4tu", "TEROUS", "knight39", "_Pieboy", "Enigma", "se",  "Orange", "gamer", "sadd", "lab", "gamer1246"];

newRunnerCmd = (message) => {
    message.channel.send(runnerPrefixes[Math.floor(Math.random() * runnerPrefixes.length)] + runnerSuffixes[Math.floor(Math.random() * runnerSuffixes.length)]);
}