const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} = require("@azure/storage-blob");
require("dotenv").config();

// Azure Storage configuration
/**
 * Initialize Azure Blob Storage
 */
const AZURE_STORAGE_CONNECTION_STRING =
  process.env.AZURE_STORAGE_CONNECTION_STRING;
const AZURE_STORAGE_ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const AZURE_STORAGE_ACCOUNT_KEY = process.env.AZURE_STORAGE_ACCOUNT_KEY;
const CONTAINER_NAME = "certificates";

let blobServiceClient;
let containerClient;

async function initializeBlobStorage() {
  try {
    if (!AZURE_STORAGE_CONNECTION_STRING) {
      throw new Error("Azure Storage connection string is not configured");
    }

    blobServiceClient = BlobServiceClient.fromConnectionString(
      AZURE_STORAGE_CONNECTION_STRING
    );
    containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

    const containerExists = await containerClient.exists();
    if (!containerExists) {
      await containerClient.create(); // private by default
      console.log(`✓ Container "${CONTAINER_NAME}" created (private access)`);
    } else {
      console.log(`✓ Container "${CONTAINER_NAME}" already exists`);
    }

    return containerClient;
  } catch (error) {
    console.error("Error initializing Azure Blob Storage:", error.message);
    throw error;
  }
}

function generateBlobSASUrl(blobName, expiresInHours = 1) {
  if (!AZURE_STORAGE_ACCOUNT_NAME || !AZURE_STORAGE_ACCOUNT_KEY) {
    throw new Error("Azure Storage account name or key not configured");
  }

  const sharedKeyCredential = new StorageSharedKeyCredential(
    AZURE_STORAGE_ACCOUNT_NAME,
    AZURE_STORAGE_ACCOUNT_KEY
  );

  const blobClient = containerClient.getBlockBlobClient(blobName);

  const sasToken = generateBlobSASQueryParameters(
    {
      containerName: CONTAINER_NAME,
      blobName: blobName,
      permissions: BlobSASPermissions.parse("r"), // read-only
      expiresOn: new Date(new Date().valueOf() + expiresInHours * 3600 * 1000),
    },
    sharedKeyCredential
  ).toString();

  return `${blobClient.url}?${sasToken}`;
}

/**
 * Upload a file to Azure Blob Storage
 * @param {string} blobName - Name of the blob (file name)
 * @param {Buffer|string} content - File content
 * @param {string} contentType - MIME type
 * @returns {Promise<string>} - Public URL of the uploaded blob
 */
async function uploadToBlob(
  blobName,
  content,
  contentType = "application/pdf"
) {
  try {
    if (!containerClient) {
      await initializeBlobStorage();
    }

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Upload content
    await blockBlobClient.upload(content, content.length, {
      blobHTTPHeaders: { blobContentType: contentType },
    });

    // Generate secure SAS URL (valid for 1 hour by default)
    const secureUrl = generateBlobSASUrl(blobName, 1);

    console.log(`✓ File uploaded successfully: ${blobName}`);
    return secureUrl;
  } catch (error) {
    console.error("Error uploading to Azure Blob Storage:", error.message);
    throw error;
  }
}

/**
 * Delete a file from Azure Blob Storage
 * @param {string} blobName - Name of the blob to delete
 * @returns {Promise<boolean>}
 */
async function deleteFromBlob(blobName) {
  try {
    if (!containerClient) {
      await initializeBlobStorage();
    }

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const deleteResponse = await blockBlobClient.deleteIfExists();

    if (deleteResponse.succeeded) {
      console.log(`✓ File deleted successfully: ${blobName}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error deleting from Azure Blob Storage:", error.message);
    throw error;
  }
}

/**
 * Check if a blob exists
 * @param {string} blobName - Name of the blob
 * @returns {Promise<boolean>}
 */
async function blobExists(blobName) {
  try {
    if (!containerClient) {
      await initializeBlobStorage();
    }

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    return await blockBlobClient.exists();
  } catch (error) {
    console.error("Error checking blob existence:", error.message);
    return false;
  }
}

/**
 * Get the public URL for a blob
 * @param {string} blobName - Name of the blob
 * @returns {string} - Public URL
 */
function getBlobUrl(blobName) {
  if (!containerClient) {
    throw new Error("Blob storage not initialized");
  }
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  return blockBlobClient.url;
}

module.exports = {
  initializeBlobStorage,
  uploadToBlob,
  deleteFromBlob,
  blobExists,
  getBlobUrl,
};
