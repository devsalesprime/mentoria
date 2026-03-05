/**
 * Promisified wrappers around sqlite3's callback API.
 * Usage: const { dbGet, dbRun, dbAll } = require('./utils/db-helpers.cjs')(db);
 */

module.exports = function createDbHelpers(db) {
    /** db.get() → returns single row or undefined */
    function dbGet(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    /** db.run() → returns { lastID, changes } */
    function dbRun(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    /** db.all() → returns array of rows */
    function dbAll(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    return { dbGet, dbRun, dbAll };
};
