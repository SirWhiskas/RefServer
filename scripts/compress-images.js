require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const IMAGE_ROOT = path.resolve(process.env.IMAGE_ROOT_PATH || '/');
const COMPRESSED_ROOT = path.resolve(process.env.COMPRESSED_ROOT_PATH || IMAGE_ROOT + '_Compressed');
const MAX_DIMENSION = 1200;
const QUALITY = 82;
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif']);

let processed = 0;
let skipped = 0;
let errors = 0;

async function processDirectory(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            await processDirectory(srcPath);
        } else {
            const ext = path.extname(entry.name).toLowerCase();
            if (!IMAGE_EXTENSIONS.has(ext)) continue;

            const relativePath = path.relative(IMAGE_ROOT, srcPath);
            const destPath = path.join(COMPRESSED_ROOT, relativePath.replace(/\.[^.]+$/, '.webp'));

            if (fs.existsSync(destPath)) {
                skipped++;
                continue;
            }

            fs.mkdirSync(path.dirname(destPath), { recursive: true });

            try {
                await sharp(srcPath)
                    .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
                    .webp({ quality: QUALITY })
                    .toFile(destPath);
                processed++;
                console.log(`[${processed}] ${relativePath}`);
            } catch (err) {
                errors++;
                console.error(`Error: ${relativePath} — ${err.message}`);
            }
        }
    }
}

async function main() {
    console.log(`Source:  ${IMAGE_ROOT}`);
    console.log(`Output:  ${COMPRESSED_ROOT}`);
    console.log(`Starting compression...\n`);

    fs.mkdirSync(COMPRESSED_ROOT, { recursive: true });
    await processDirectory(IMAGE_ROOT);

    console.log(`\nDone. Processed: ${processed}  Skipped: ${skipped}  Errors: ${errors}`);
}

main().catch(console.error);
