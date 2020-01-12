/*/ Setup tables for fixing user stats
const usersFixedTable = sql.prepare("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='users_new'").get();
if (!usersFixedTable['count(*)']) {
    sql.prepare("CREATE TABLE users_new (user_id TEXT, game TEXT, category TEXT, races INTEGER, gold INTEGER, silver INTEGER, bronze INTEGER, ffs INTEGER, elo REAL, pb INTEGER);").run();
    sql.prepare("CREATE UNIQUE INDEX idx_users_fixed_id ON users_new (user_id, game, category);").run();
    sql.pragma("synchronous = 1");
    sql.pragma("journal_mode = wal");
}

client.getResultsByCategory = sql.prepare("SELECT * FROM results WHERE game = ? AND category = ? ORDER BY race_id, time ASC");

client.getAllCategories_fix = sql.prepare("SELECT game, category FROM results GROUP BY game, category");
client.getUserStatsForCategory_fix = sql.prepare("SELECT * FROM users_new WHERE user_id = ? AND game = ? AND category = ?");
client.addUserStat_fix = sql.prepare("INSERT OR REPLACE INTO users_new (user_id, game, category, races, gold, silver, bronze, ffs, elo, pb) "
                                    + "VALUES (@user_id, @game, @category, @races, @gold, @silver, @bronze, @ffs, @elo, @pb);");

*/

/*
class FixObj {
    constructor(userId, username, time) {
        this.userId = userId;
        this.username = username;
        this.time = time;
    }
}

fixElosCmd = (message) => {
    categoriesFix = client.getAllCategories_fix.all();
    for (categoryIndex = 0; categoryIndex < categoriesFix.length; categoryIndex++) {
        game = categoriesFix[categoryIndex].game;
        category = categoriesFix[categoryIndex].category;
        console.log(game + ", " + category);
        
        rows = client.getResultsByCategory.all(game, category);
        if (rows.length === 0) {
            console.log("No results found for " + game + ", " + category);
            return;
        }

        for (i = 0; i < rows.length;) {
            ds = [];
            dtimes = [];
            ffs = [];

            prevId = rows[i].race_id;
            while (i < rows.length && rows[i].race_id === prevId) {
                fix = new FixObj(rows[i].user_id, rows[i].user_name, rows[i].time);
                if (rows[i].ff) {
                    ffs.push(fix);
                } else {
                    ds.push(fix);
                    dtimes.push(rows[i].time);
                }
                prevId = rows[i].race_id;
                i++;
            }

            console.log("=== race " + prevId + "===");
            console.log(ds.length + ffs.length);

            // Update racers' stats
            playerStats = new Map();
            newElos = new Map();
            raceRankings = ds.concat(ffs);
            raceRankings.forEach((fixObj, j) => {
                statObj = client.getUserStatsForCategory_fix.get(fixObj.userId, game, category);
                if (!statObj) {
                    statObj = { user_id: `${fixObj.userId}`, game: `${game}`, category: `${category}`, races: 0, gold: 0, silver: 0, bronze: 0, ffs: 0, elo: 1200, pb: -1 };
                }
                newElos.set(fixObj.userId, statObj.elo);

                // Update simple stats while we're iterating through these; need all ELOs to calculate new ones though, so we'll do that in a bit
                statObj.races++;
                if (ffs.includes(fixObj)) {
                    statObj.ffs++;
                } else {
                    if (j === 0) {
                        statObj.gold++;
                    } else if (j === 1) {
                        statObj.silver++;
                    } else if (j === 2) {
                        statObj.bronze++;
                    }

                    if (category !== "Individual Levels") {
                        if (statObj.pb === -1 || dtimes[j] < statObj.pb) {
                            statObj.pb = dtimes[j];
                        }
                    }
                }
                playerStats.set(fixObj.userId, statObj);
            });

            // Calculate new ELOs by treating each pair of racers in the race as a 1v1 matchup.
            // See https://en.wikipedia.org/wiki/Elo_rating_system
            raceRankings.forEach((fixObj1, p1Place) => {
                actualScore = 0;
                expectedScore = 0;
                raceRankings.forEach((fixObj2, p2Place) => {
                    // Don't compare the player against themselves
                    if (fixObj1 === fixObj2) {
                        return;
                    }
                    
                    if (ffs.includes(fixObj1)) {
                        if (ffs.includes(fixObj2)) {
                            // If both players forfeited, count them as tied
                            actualScore += 0.5;
                        } else {
                            // Loss gives 0 points
                        }
                    } else if (p1Place < p2Place) {
                        // Ahead of opponent, count as win
                        actualScore += 1;
                    } else {
                        // Loss gives 0 points
                    }
                    expectedScore += 1.0 / (1 + Math.pow(10, (playerStats.get(fixObj2.userId).elo - playerStats.get(fixObj1.userId).elo) / 400));
                });

                newElos.set(fixObj1.userId, playerStats.get(fixObj1.userId).elo + 32 * (actualScore - expectedScore));
            });

            // Update/save stats with new ELOs
            playerStats.forEach((stat, id) => {
                stat.elo = newElos.get(id);
                client.addUserStat_fix.run(stat);
            });
        }
    }

    message.channel.send("Fixed Elos, I hope.")
}
*/