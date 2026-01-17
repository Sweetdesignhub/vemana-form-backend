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
        latitude FLOAT,
        longitude FLOAT,
        location_accuracy FLOAT,
        city NVARCHAR(100),
        state NVARCHAR(100),
        country NVARCHAR(100),
        country_code NVARCHAR(10),
        full_address NVARCHAR(MAX),
        location_timestamp DATETIME,
        certificate_path NVARCHAR(500),
        certificate_sent BIT DEFAULT 0,
        certificate_sent_at DATETIME,
        created_at DATETIME DEFAULT GETDATE()
      )
    `;

    await pool.request().query(createTableQuery);
    console.log("Database table initialized successfully");

    // Add new columns if they don't exist (for existing databases)
    const alterTableQuery = `
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'submissions' AND COLUMN_NAME = 'certificate_path')
      ALTER TABLE submissions ADD certificate_path NVARCHAR(500);

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'submissions' AND COLUMN_NAME = 'certificate_sent')
      ALTER TABLE submissions ADD certificate_sent BIT DEFAULT 0;

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'submissions' AND COLUMN_NAME = 'certificate_sent_at')
      ALTER TABLE submissions ADD certificate_sent_at DATETIME;

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'submissions' AND COLUMN_NAME = 'latitude')
      ALTER TABLE submissions ADD latitude FLOAT;

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'submissions' AND COLUMN_NAME = 'longitude')
      ALTER TABLE submissions ADD longitude FLOAT;

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'submissions' AND COLUMN_NAME = 'location_accuracy')
      ALTER TABLE submissions ADD location_accuracy FLOAT;

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'submissions' AND COLUMN_NAME = 'city')
      ALTER TABLE submissions ADD city NVARCHAR(100);

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'submissions' AND COLUMN_NAME = 'state')
      ALTER TABLE submissions ADD state NVARCHAR(100);

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'submissions' AND COLUMN_NAME = 'country')
      ALTER TABLE submissions ADD country NVARCHAR(100);

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'submissions' AND COLUMN_NAME = 'country_code')
      ALTER TABLE submissions ADD country_code NVARCHAR(10);

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'submissions' AND COLUMN_NAME = 'full_address')
      ALTER TABLE submissions ADD full_address NVARCHAR(MAX);

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'submissions' AND COLUMN_NAME = 'location_timestamp')
      ALTER TABLE submissions ADD location_timestamp DATETIME;
    `;

    await pool.request().query(alterTableQuery);
    console.log("Database schema updated successfully");
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
