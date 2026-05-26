const { Pool } = require('pg');
require('dotenv').config();

async function seed() {
  const pgConfig = {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'finance'
  };

  const pool = new Pool(pgConfig);
  try {
    // Try connection
    await pool.query('SELECT 1');
    await pool.query(
      "INSERT INTO vendors (id, name, email, rating, performance_score, payment_terms) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING",
      ['V-1', 'Acme Corp', 'billing@acme.com', 'A', 98.5, 'Net 30']
    );
    await pool.query(
      "INSERT INTO vendors (id, name, email, rating, performance_score, payment_terms) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING",
      ['V-2', 'Global Tech', 'finance@globaltech.com', 'B', 85.0, 'Net 15']
    );
    console.log('PostgreSQL database seeded successfully.');
    await pool.end();
  } catch (err) {
    console.warn('PostgreSQL seeding failed (' + err.message + '). Falling back to SQLite seeding...');
    await pool.end();
    
    // SQLite seeding
    const sqlite3 = require('sqlite3').verbose();
    const sqliteDb = new sqlite3.Database('./finance.db');
    sqliteDb.serialize(() => {
      sqliteDb.run("INSERT OR IGNORE INTO vendors (id, name, email, rating, performance_score, payment_terms) VALUES ('V-1', 'Acme Corp', 'billing@acme.com', 'A', 98.5, 'Net 30')");
      sqliteDb.run("INSERT OR IGNORE INTO vendors (id, name, email, rating, performance_score, payment_terms) VALUES ('V-2', 'Global Tech', 'finance@globaltech.com', 'B', 85.0, 'Net 15')");
      console.log('SQLite fallback database seeded successfully.');
    });
    sqliteDb.close();
  }
}

seed();
