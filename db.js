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
      BEGIN
        CREATE TABLE submissions (
          id INT IDENTITY(1,1) PRIMARY KEY,
          name NVARCHAR(255) NOT NULL,
          email NVARCHAR(255) NULL,
          phone NVARCHAR(50) NULL,
          message NVARCHAR(MAX) NULL,

          latitude FLOAT NULL,
          longitude FLOAT NULL,
          location_accuracy FLOAT NULL,
          city NVARCHAR(100) NULL,
          state NVARCHAR(100) NULL,
          country NVARCHAR(100) NULL,
          country_code NVARCHAR(10) NULL,
          full_address NVARCHAR(MAX) NULL,
          location_timestamp DATETIME NULL,

          certificate_path NVARCHAR(500) NULL,
          certificate_url NVARCHAR(1000) NULL,
          certificate_sent BIT DEFAULT 0,
          certificate_sent_at DATETIME NULL,

          send_method NVARCHAR(20) NULL,
          created_at DATETIME DEFAULT GETDATE()
        );

        CREATE INDEX idx_submissions_created_at ON submissions(created_at DESC);
      END
    `;

    await pool.request().query(createTableQuery);
    console.log("✓ Database table initialized");

    // Add missing columns safely for existing DB
    const alterTableQuery = `
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='submissions' AND COLUMN_NAME='certificate_url')
        ALTER TABLE submissions ADD certificate_url NVARCHAR(1000);

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='submissions' AND COLUMN_NAME='send_method')
        ALTER TABLE submissions ADD send_method NVARCHAR(20);
    `;

    await pool.request().query(alterTableQuery);
    console.log("✓ Database schema verified");
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
