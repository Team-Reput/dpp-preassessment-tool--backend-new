const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Test the connection
pool.connect((err, client, release) => {
  if (err) {
    return console.error('❌ Database connection failed:', err.stack);
  }
  console.log('✅ Database connected successfully!');
  release(); // release the test connection back to the pool
});

module.exports = pool;

