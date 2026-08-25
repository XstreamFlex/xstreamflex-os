const path = require('path');
const fs = require('fs');
require('dotenv').config();

const dbType = (process.env.DB_TYPE || 'sqlite').toLowerCase();
const dbFile = path.resolve(__dirname, '..', process.env.DB_FILE || 'database/xmail.sqlite');

function createSqliteAdapter() {
  const sqlite3 = require('sqlite3').verbose();
  const dbDir = path.dirname(dbFile);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new sqlite3.Database(dbFile);

  return {
    type: 'sqlite',
    query(sql, params = []) {
      return new Promise((resolve, reject) => {
        const trimmedSql = sql.trim().toUpperCase();
        if (trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('PRAGMA')) {
          db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
          });
        } else {
          db.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve({ lastID: this.lastID, changes: this.changes });
          });
        }
      });
    },
    async initSchema() {
      const schemaPath = path.join(__dirname, '../database/schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      const statements = schemaSql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      for (const statement of statements) {
        await this.query(statement).catch(() => {});
      }
      await runAutoMigrations((sql) => this.query(sql));
      console.log('✅ SQLite schema initialized at:', dbFile);
    }
  };
}

let dbAdapter = null;

if (dbType === 'mysql') {
  try {
    const mysql = require('mysql2/promise');
    const pool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306', 10),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    dbAdapter = {
      type: 'mysql',
      async query(sql, params = []) {
        try {
          const [rows] = await pool.execute(sql, params);
          return rows;
        } catch (err) {
          // If MySQL is down, fallback query execution to SQLite
          if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
            if (!this._sqliteFallback) {
              console.warn('⚠️ MySQL connection unavailable. Falling back to SQLite adapter.');
              this._sqliteFallback = createSqliteAdapter();
              await this._sqliteFallback.initSchema();
            }
            return this._sqliteFallback.query(sql, params);
          }
          throw err;
        }
      },
      async initSchema() {
        try {
          const schemaPath = path.join(__dirname, '../database/schema.sql');
          const schemaSql = fs.readFileSync(schemaPath, 'utf8');
          const statements = schemaSql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);
          
          for (const statement of statements) {
            await pool.execute(statement).catch(() => {});
          }
          await runAutoMigrations((sql) => pool.execute(sql));
          console.log('✅ MySQL schema initialized.');
        } catch (err) {
          console.warn('⚠️ Could not connect to MySQL server. Initializing SQLite fallback schema.');
          this._sqliteFallback = createSqliteAdapter();
          await this._sqliteFallback.initSchema();
        }
      }
    };
  } catch (e) {
    console.warn('⚠️ Failed to load MySQL module, falling back to SQLite.');
    dbAdapter = createSqliteAdapter();
  }
} else {
  dbAdapter = createSqliteAdapter();
}

async function runAutoMigrations(queryFn) {
  const migrations = [
    `ALTER TABLE sites ADD COLUMN ecosystem_id VARCHAR(128)`,
    `ALTER TABLE sites ADD COLUMN site_metadata_json TEXT`,
    `ALTER TABLE sites ADD COLUMN user_id VARCHAR(128)`,
    `ALTER TABLE connected_emails ADD COLUMN provider VARCHAR(50) DEFAULT 'custom'`,
    `ALTER TABLE connected_emails ADD COLUMN site_id VARCHAR(64)`,
    `ALTER TABLE connected_emails ADD COLUMN ecosystem_identity_json TEXT`,
    `ALTER TABLE connected_emails ADD COLUMN is_primary TINYINT DEFAULT 0`,
    `ALTER TABLE connected_emails ADD COLUMN user_id VARCHAR(128)`,
    `ALTER TABLE subscribers ADD COLUMN user_id VARCHAR(128)`,
    `ALTER TABLE campaigns ADD COLUMN user_id VARCHAR(128)`
  ];
  for (const sql of migrations) {
    try {
      await queryFn(sql);
    } catch (e) {
      // Column likely already exists
    }
  }
}

module.exports = dbAdapter;
