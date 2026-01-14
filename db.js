const sql = require("mssql");
require("dotenv").config();

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || "1433"),
  options: {
    encrypt: true,
    trustServerCertificate: false,
    enableArithAbort: true,
    connectTimeout: 30000,
    requestTimeout: 30000,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool = null;

async function getConnection() {
  try {
    if (pool) {
      return pool;
    }

    pool = await sql.connect(config);
    console.log("Connected to Azure SQL Database");
    return pool;
  } catch (err) {
    console.error("Database connection error:", err);
    throw err;
  }
}

async function initializeDatabase() {
  try {
    const pool = await getConnection();

    const createTableQuery = `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='submissions' AND xtype='U')
      CREATE TABLE submissions (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(255) NOT NULL,
        email NVARCHAR(255) NOT NULL,
        phone NVARCHAR(50) NOT NULL,
        message NVARCHAR(MAX) NOT NULL,
        created_at DATETIME DEFAULT GETDATE()
      )
    `;

    await pool.request().query(createTableQuery);
    console.log("Database table initialized successfully");
  } catch (err) {
    console.error("Database initialization error:", err);
    throw err;
  }
}

async function closeConnection() {
  try {
    if (pool) {
      await pool.close();
      pool = null;
      console.log("Database connection closed");
    }
  } catch (err) {
    console.error("Error closing database connection:", err);
  }
}

module.exports = {
  getConnection,
  initializeDatabase,
  closeConnection,
  sql,
};
