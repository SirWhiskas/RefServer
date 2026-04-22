const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());

const BASE_API_URL = process.env.BASE_API_URL || '/my/api/path';
const IMAGE_ROOT_PATH = process.env.IMAGE_ROOT_PATH || '/';

const PORT = process.env.PORT || 8000;
const ROOT_DIR = path.resolve(IMAGE_ROOT_PATH);
const DIST_DIR = path.join(__dirname, 'dist');

const CACHE_FILE = path.resolve("cache.json");
const CACHE_EXPIRATION = 1000 * 60 * 60; // 1 hour

const IMAGE_EXTENSIONS = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
};

// Get the local network IP
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (let iface of Object.values(interfaces)) {
        for (let config of iface) {
            if (config.family === 'IPv4' && !config.internal) {
                return config.address;
            }
        }
    }
    return 'localhost';
}

function isSafePath(p) {
    return path.resolve(p).startsWith(ROOT_DIR);
}

// Load cache from file
function loadCacheFromFile() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
        }
    } catch (err) {
        console.error("Error reading cache file:", err);
    }
    return {};
}

// Save cache to file
function saveCacheToFile(cache) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
}

let cache = loadCacheFromFile();

// Utility function to shuffle an array
function shuffleArray(array) {
    return array
        .map(value => ({ value, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value);
}

// Read the directory recursively and return a tree structure
function readDirectoryRecursive(directory, keyPrefix = '', onlyFolders = false) {
    let results = [];

    try {
        const files = fs.readdirSync(directory);

        let fileIndex = 0;
        for (const file of files) {
            const filePath = path.join(directory, file);
            const stats = fs.statSync(filePath);

            if (stats.isDirectory()) {
                results.push({
                    key: `${keyPrefix}${fileIndex}`,
                    label: file,
                    data: `${file} folder`,
                    icon: 'pi pi-folder',
                    path: filePath.replace(ROOT_DIR, ""),
                    children: readDirectoryRecursive(filePath, `${keyPrefix}${fileIndex}-`, onlyFolders)
                });
            } else if (!onlyFolders) {
                results.push({
                    key: `${keyPrefix}${fileIndex}`,
                    label: file,
                    data: `${file} image`,
                    icon: 'pi pi-image',
                    path: filePath.replace(ROOT_DIR, "")
                });
            }

            fileIndex++;
        }
    } catch (err) {
        console.error(`Error reading directory ${directory}:`, err);
    }

    return results;
}

function imageApiHandler(req, res, onlyFolders = false) {
    try {
        const folderPath = req.params[0] || '';
        const dirPath = path.join(ROOT_DIR, folderPath);
        const resolvedDirPath = path.resolve(dirPath);

        const cacheKeyName = onlyFolders ? resolvedDirPath + '-onlyFolders' : resolvedDirPath;

        // Security check: Prevent access outside ROOT_DIR
        if (!isSafePath(dirPath)) {
            return res.status(403).json({ error: 'Access Denied' });
        }

        // Attempt to load from cache
        if (cache[cacheKeyName] && Date.now() - cache[cacheKeyName].lastUpdated < CACHE_EXPIRATION) {
            return res.json(cache[cacheKeyName].data);
        }

        fs.stat(resolvedDirPath, (err, stats) => {
            if (err || !stats) {
                return res.status(404).json({ error: 'Directory not found' });
            }

            if (!stats.isDirectory()) {
                const ext = path.extname(resolvedDirPath).toLowerCase();
                const contentType = IMAGE_EXTENSIONS[ext] || 'application/octet-stream';
                res.setHeader('Content-Type', contentType);
                fs.createReadStream(resolvedDirPath).pipe(res);
            } else {
                const images = readDirectoryRecursive(resolvedDirPath, '', onlyFolders);

                cache[cacheKeyName] = {
                    lastUpdated: Date.now(),
                    data: images
                };

                saveCacheToFile(cache);

                res.json(images);
            }
        });
    } catch (err) {
        console.error(`Error in imageApiHandler:`, err);
    }
}

/**
 * Middleware to prevent access outside the ROOT_DIR
 */
app.use((req, res, next) => {
    if (req.path === BASE_API_URL) {
        req.filePath = ROOT_DIR;
        return next();
    }
    const requestedPath = decodeURIComponent(req.path);
    const filePath = path.join(ROOT_DIR, requestedPath);

    // Prevent directory traversal attacks
    if (!isSafePath(filePath)) {
        return res.status(403).send('Access Denied');
    }

    req.filePath = filePath;
    next();
});

/**
 * Serve random set of images in a given folder
 */
app.get(`${BASE_API_URL}/random-images/*`, (req, res) => {
    const folderPath = req.params[0] || '';
    const dirPath = path.join(ROOT_DIR, folderPath);
    const resolvedDirPath = path.resolve(dirPath);

    // Security check: Prevent access outside ROOT_DIR
    if (!isSafePath(dirPath)) {
        return res.status(403).json({ error: 'Access Denied' });
    }

    fs.stat(resolvedDirPath, (err, stats) => {
        if (err || !stats || !stats.isDirectory()) {
            return res.status(404).json({ error: 'Directory not found' });
        }

        fs.readdir(resolvedDirPath, (err, files) => {
            if (err) {
                return res.status(500).json({ error: 'Error reading directory' });
            }

            const imageFiles = files.filter(file => {
                const ext = path.extname(file).toLowerCase();
                return ext in IMAGE_EXTENSIONS;
            });

            if (imageFiles.length === 0) {
                return res.status(404).json({ error: 'No images found' });
            }

            const numImages = parseInt(req.query.num, 10) || 5;
            const shuffledImages = shuffleArray(imageFiles);
            const selectedImages = shuffledImages.slice(0, numImages);

            const imagePaths = selectedImages.map(file => path.join(folderPath, file));
            res.json({ images: imagePaths });
        });
    });
});

/**
 * API Route: Return just the folders from a given directory
 */
app.get(`${BASE_API_URL}/folders`, (req, res) => imageApiHandler(req, res, true));
app.get(`${BASE_API_URL}/folders/*`, (req, res) => imageApiHandler(req, res, true));

/**
 * API Route: Return images in a given folder
 * Example: GET /api/images/Sketching/Poses
 */
app.get(`${BASE_API_URL}/images`, (req, res) => imageApiHandler(req, res, false));
app.get(`${BASE_API_URL}/images/*`, (req, res) => imageApiHandler(req, res, false));

// Serve the bundled Vue app (JS, CSS, index.html)
if (fs.existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR));
}

// Serve image files with ETags, Range support, and cache headers
app.use(express.static(ROOT_DIR));

/**
 * Fallback: serve Vue's index.html for any unmatched route (SPA routing).
 * Falls back to the plain file browser when no dist build is present (dev mode).
 */
app.get('*', (req, res) => {
    const indexPath = path.join(DIST_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
        return res.send(fs.readFileSync(indexPath, 'utf8'));
    }

    // Dev fallback: basic directory browser
    const requestedPath = decodeURIComponent(req.path);
    const filePath = req.filePath;

    fs.readdir(filePath, (err, files) => {
        if (err) {
            return res.status(404).send('Not found');
        }

        let html = `<html><body><h1>Image Browser</h1><ul>`;

        if (requestedPath !== '/') {
            const parentDir = path.dirname(requestedPath);
            html += `<li><a href="${parentDir === '.' ? '/' : parentDir}">⬆️ Go Back</a></li>`;
        }

        files.forEach(file => {
            const fileUrl = path.join(requestedPath, file).replace(/\\/g, '/');
            const fullPath = path.join(filePath, file);
            const isDirectory = fs.statSync(fullPath).isDirectory();
            html += `<li><a href="${fileUrl}">${isDirectory ? '📁 ' : '🖼️ '}${file}</a></li>`;
        });

        html += `</ul></body></html>`;
        res.send(html);
    });
});

// Start server
app.listen(PORT, () => {
    const localUrl = `http://localhost:${PORT}`;
    const networkUrl = `http://${getLocalIP()}:${PORT}`;
    console.log(`Server running at ${localUrl} (network: ${networkUrl})`);

    // Auto-open the browser when the dist build is present (i.e. running as packaged app)
    if (fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
        exec(`start "" "${localUrl}"`, (err) => {
            if (err) console.log(`Open your browser to: ${localUrl}`);
        });
    }
});
