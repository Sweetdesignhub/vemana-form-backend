const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { imageSize } = require("image-size");
const sharp = require("sharp");

// Cache directory for optimized images
const CACHE_DIR = path.join(__dirname, "certificates", ".image-cache");

/**
 * Optimize and resize image for PDF embedding
 * Returns path to optimized image
 */
async function optimizeImage(imagePath, maxWidth = 1200) {
  // Create cache directory if it doesn't exist
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  const fileName = path.basename(imagePath);
  const cachedPath = path.join(CACHE_DIR, `optimized_${fileName}`);

  // Return cached version if it exists
  if (fs.existsSync(cachedPath)) {
    return cachedPath;
  }

  // Optimize the image
  try {
    await sharp(imagePath)
      .resize(maxWidth, null, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 }) // Convert to JPEG with 85% quality
      .toFile(cachedPath);

    console.log(`  → Optimized: ${fileName} (cached)`);
    return cachedPath;
  } catch (error) {
    console.warn(`  → Could not optimize ${fileName}, using original`);
    return imagePath;
  }
}

/**
 * Draw background image to cover the entire page
 */
async function drawBackgroundCover(doc, imagePath, pageWidth, pageHeight) {
  if (!fs.existsSync(imagePath)) {
    console.warn(`Background image not found at: ${imagePath}`);
    return;
  }

  try {
    // Optimize image first
    const optimizedPath = await optimizeImage(imagePath, 1200);

    // Read optimized file into buffer
    const buffer = fs.readFileSync(optimizedPath);
    const imgDimensions = imageSize(buffer);
    const imgWidth = imgDimensions.width;
    const imgHeight = imgDimensions.height;

    const scale = Math.max(pageWidth / imgWidth, pageHeight / imgHeight);
    const drawWidth = imgWidth * scale;
    const drawHeight = imgHeight * scale;

    const x = (pageWidth - drawWidth) / 2;
    const y = (pageHeight - drawHeight) / 2;

    // Draw optimized image
    doc.image(optimizedPath, x, y, {
      width: drawWidth,
      height: drawHeight,
    });

    console.log(
      `✓ Background image loaded: ${path.basename(
        imagePath
      )} (${imgWidth}x${imgHeight})`
    );
  } catch (error) {
    console.error("✗ Error loading background image:", error.message);
  }
}

/**
 * Draw logo with fixed height, centered horizontally
 */
async function drawLogoFixedHeight(doc, imagePath, xCenter, topY, fixedHeight) {
  if (!fs.existsSync(imagePath)) {
    console.warn(`✗ Logo not found at: ${imagePath}`);
    return;
  }

  try {
    // Optimize logo (smaller max width since logos are smaller)
    const optimizedPath = await optimizeImage(imagePath, 400);

    // Read optimized file into buffer
    const buffer = fs.readFileSync(optimizedPath);
    const imgDimensions = imageSize(buffer);
    const imgWidth = imgDimensions.width;
    const imgHeight = imgDimensions.height;

    const scale = fixedHeight / imgHeight;
    const drawWidth = imgWidth * scale;

    const xPos = xCenter - drawWidth / 2;

    // Draw optimized logo
    doc.image(optimizedPath, xPos, topY, {
      width: drawWidth,
      height: fixedHeight,
    });

    console.log(
      `✓ Logo loaded: ${path.basename(imagePath)} at x=${xPos.toFixed(
        2
      )}, y=${topY}`
    );
  } catch (error) {
    console.error("✗ Error loading logo:", error.message);
  }
}

/**
 * Generate a certificate PDF for a participant
 * @param {Object} participant - The participant data
 * @param {string} outputPath - Where to save the PDF
 * @returns {Promise<string>} - Path to the generated certificate
 */
async function generateCertificate(participant, outputPath) {
  // Create a new PDF document in landscape A4
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    compress: true, // Enable PDF compression
  });

  // Pipe to file
  const writeStream = fs.createWriteStream(outputPath);
  doc.pipe(writeStream);

  const width = doc.page.width; // 841.89
  const height = doc.page.height; // 595.28

  // 🌿 Heritage color palette (matching Python)
  const gold = "#B68A2E";
  const bark = "#2B2A1F";
  const olive = "#5A563E";
  const forest = "#2F6B3C";

  // ======================
  // Background
  // ======================
  let bgPath = path.join(__dirname, "images", "background_image.png");
  if (!fs.existsSync(bgPath)) {
    bgPath = path.join(process.cwd(), "images", "background_image.png");
  }
  if (!fs.existsSync(bgPath)) {
    bgPath = path.join(
      process.cwd(),
      "server",
      "images",
      "background_image.png"
    );
  }

  console.log("Background path being used:", bgPath);
  await drawBackgroundCover(doc, bgPath, width, height);

  // ======================
  // Logos
  // ======================
  const topY = 40;
  const logoHeight = 55;

  let logoLeftPath = path.join(__dirname, "images", "logo_left.png");
  if (!fs.existsSync(logoLeftPath)) {
    logoLeftPath = path.join(process.cwd(), "images", "logo_left.png");
  }
  if (!fs.existsSync(logoLeftPath)) {
    logoLeftPath = path.join(
      process.cwd(),
      "server",
      "images",
      "logo_left.png"
    );
  }

  let logoRightPath = path.join(__dirname, "images", "logo_right.png");
  if (!fs.existsSync(logoRightPath)) {
    logoRightPath = path.join(process.cwd(), "images", "logo_right.png");
  }
  if (!fs.existsSync(logoRightPath)) {
    logoRightPath = path.join(
      process.cwd(),
      "server",
      "images",
      "logo_right.png"
    );
  }

  console.log("Logo left path:", logoLeftPath);
  console.log("Logo right path:", logoRightPath);

  await drawLogoFixedHeight(doc, logoLeftPath, 120, topY, logoHeight);
  await drawLogoFixedHeight(doc, logoRightPath, width - 75, topY, logoHeight);

  // ======================
  // Branding
  // ======================
  const brandY = topY + logoHeight / 1.5;
  doc
    .fontSize(20)
    .font("Helvetica-Oblique")
    .fillColor(gold)
    .text("Kadiri Tourism", 0, brandY, {
      align: "center",
      width: width,
    });

  // ======================
  // Main Heading (UNDERLINED)
  // ======================
  const titleText = "CERTIFICATE OF PARTICIPATION";
  const titleY = brandY + 55;

  doc
    .fontSize(28)
    .font("Helvetica-Bold")
    .fillColor(bark)
    .text(titleText, 0, titleY, {
      align: "center",
      width: width,
    });

  const textWidth = doc.widthOfString(titleText, "Helvetica-Bold", 28);
  const underlineY = titleY + 22;

  doc
    .moveTo((width - textWidth) / 2, underlineY)
    .lineTo((width + textWidth) / 2, underlineY)
    .lineWidth(2)
    .strokeColor(gold)
    .stroke();

  // ======================
  // Sub-heading
  // ======================
  const lineY = titleY + 55;
  doc
    .fontSize(18)
    .font("Helvetica")
    .fillColor(bark)
    .text("This certificate is awarded to", 0, lineY, {
      align: "center",
      width: width,
    });

  // ======================
  // Participant Name
  // ======================
  doc
    .fontSize(38)
    .font("Helvetica-Bold")
    .fillColor(forest)
    .text(participant.name, 0, lineY + 60, {
      align: "center",
      width: width,
    });

  // ======================
  // Body Text
  // ======================
  doc
    .fontSize(20)
    .font("Helvetica")
    .fillColor(bark)
    .text(
      "in recognition of active participation and meaningful contribution to",
      0,
      lineY + 110,
      {
        align: "center",
        width: width,
      }
    );

  // ======================
  // Event Name
  // ======================
  doc
    .fontSize(26)
    .font("Helvetica-Bold")
    .fillColor(bark)
    .text("VEMANA VIGNANA YATRA", 0, lineY + 150, {
      align: "center",
      width: width,
    });

  // ======================
  // Tagline
  // ======================
  doc
    .fontSize(16)
    .font("Helvetica-Oblique")
    .fillColor(olive)
    .text(
      "Celebrating Kadiri's heritage through learning, dialogue, and innovation.",
      0,
      lineY + 200,
      {
        align: "center",
        width: width,
      }
    );

  // ======================
  // Organization Details
  // ======================
  doc
    .fontSize(14)
    .font("Helvetica")
    .fillColor(bark)
    .text(
      "An initiative organized by the Government of Andhra Pradesh",
      0,
      lineY + 235,
      {
        align: "center",
        width: width,
      }
    );

  doc
    .fontSize(14)
    .font("Helvetica")
    .fillColor(bark)
    .text(
      "on the occasion of Vemana Jayanti to promote knowledge, culture, and values.",
      0,
      lineY + 255,
      {
        align: "center",
        width: width,
      }
    );

  // ======================
  // Digital Certificate Note
  // ======================
  doc
    .fontSize(10)
    .font("Helvetica-Oblique")
    .fillColor(olive)
    .text(
      "This is a digitally generated certificate and does not require a physical signature.",
      0,
      height - 55,
      {
        align: "center",
        width: width,
      }
    );

  // ======================
  // Hashtags
  // ======================
  doc
    .fontSize(11)
    .font("Helvetica")
    .fillColor(forest)
    .text(
      "#STEM   #SkillNext   #STEMCulture   #KnowledgeContinuity   #KadiriTourism",
      0,
      height - 110,
      {
        align: "center",
        width: width,
      }
    );

  // ======================
  // Footer
  // ======================
  const issueDate = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  doc
    .fontSize(12)
    .font("Helvetica")
    .fillColor(bark)
    .text(`Issued on: ${issueDate}`, 90, height - 70, {
      align: "left",
    });

  doc
    .fontSize(12)
    .font("Helvetica")
    .fillColor(bark)
    .text(`Certificate ID: YV-${participant.id}-2026`, 0, height - 70, {
      align: "right",
      width: width - 90,
    });

  // Finalize PDF
  doc.end();

  return new Promise((resolve, reject) => {
    writeStream.on("finish", () => {
      resolve(outputPath);
    });

    writeStream.on("error", (error) => {
      reject(error);
    });
  });
}

module.exports = { generateCertificate };
