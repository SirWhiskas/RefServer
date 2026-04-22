const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());

//cors to fix cors origin, body-parser to fix the post value on the server
// const cors = require('cors');
// const bodyParser = require('body-parser');
// app.use(cors());
// app.use(bodyParser.json());
const BASE_API_URL = process.env.BASE_API_URL || '/my/api/path';
const IMAGE_ROOT_PATH = process.env.IMAGE_ROOT_PATH || '/';

const PORT = 8000;
const ROOT_DIR = path.resolve(IMAGE_ROOT_PATH);

const CACHE_FILE = path.resolve("cache.json");
const CACHE_EXPIRATION = 1000 * 60 * 60; // 1 hour

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

// Load cache from file
function loadCacheFromFile() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
        }
    } catch (err) {
        console.error("Error reading cache file:", err);
    }
    return {}; // Return empty object if no cache exists
}

// Save cache to file
function saveCacheToFile(cache) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
}

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
                // If it's a directory, recurse into it
                results.push({
                    key: `${keyPrefix}${fileIndex}`, // Unique key for the tree
                    label: file,
                    data: `${file} folder`,
                    icon: 'pi pi-folder',
                    path: filePath.replace(ROOT_DIR, ""),
                    children: readDirectoryRecursive(filePath, `${keyPrefix}${fileIndex}-`, onlyFolders) // Recursively read the directory
                });
            } else if (!onlyFolders) {
                // If it's a file, add it to the result
                results.push({
                    key: `${keyPrefix}${fileIndex}`, // Unique key for the tree
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
    try{
        const folderPath = req.params[0] || ''; // Capture everything after /api/images/
        const dirPath = path.join(ROOT_DIR, folderPath);
        const resolvedRoot = path.resolve(ROOT_DIR);
        const resolvedDirPath = path.resolve(dirPath);

        const cacheKeyName = onlyFolders ? resolvedDirPath + '-onlyFolders' : resolvedDirPath;

        // Security check: Prevent access outside ROOT_DIR
        if (!resolvedDirPath.startsWith(resolvedRoot)) {
            return res.status(403).json({ error: 'Access Denied' });
        }

        // Attempt to laod from cache
        let cache = loadCacheFromFile();

        // Uncomment to enable cache expiration
        // if (cache[cacheKeyName] && Date.now() - cache[cacheKeyName].lastUpdated < CACHE_EXPIRATION)  {
            
        //     return res.json(cache[cacheKeyName].data);
        // }
        if (cache[cacheKeyName])  {
            
            return res.json(cache[cacheKeyName].data);
        }

        // Check that the folder exists
        fs.stat(resolvedDirPath, (err, stats) => {
            if (err || !stats) {
                return res.status(404).json({ error: 'Directory not found' });
            }

            if (!stats.isDirectory()) {
                const filePath = path.join(ROOT_DIR, req.params[0]);
                const resolvedRoot = path.resolve(ROOT_DIR);
                const resolvedPath = path.resolve(filePath);

                // Prevent access outside the ROOT_DIR
                if (!resolvedPath.startsWith(resolvedRoot)) {
                    return res.status(403).send('Access Denied');
                }

                fs.stat(resolvedPath, (err, stats) => {
                    if (err || !stats) {
                        return res.status(404).send('File not found');
                    }

                    // Determine MIME type
                    const ext = path.extname(resolvedPath).toLowerCase();
                    const mimeTypes = {
                        '.jpg': 'image/jpeg',
                        '.jpeg': 'image/jpeg',
                        '.png': 'image/png',
                        '.gif': 'image/gif',
                        '.webp': 'image/webp'
                    };
                    const contentType = mimeTypes[ext] || 'application/octet-stream';
                    res.setHeader('Content-Type', contentType);
                    fs.createReadStream(resolvedPath).pipe(res);
                });
            } else {
                fs.readdir(resolvedDirPath, (err, files) => {
                    if (err) {
                        return res.status(500).json({ error: 'Error reading directory' });
                    }

                    

                    // Not in cache or cache expired, read the directory and save to cache
                    const images = readDirectoryRecursive(resolvedDirPath, '', onlyFolders);
                    
                    cache[cacheKeyName] = {
                        lastUpdated: Date.now(),
                        data: images
                    };

                    saveCacheToFile(cache);

                    res.json(images);
                });
            }    
        });
    } catch (err) {
        console.error(`Error reading directory ${directory}:`, err);
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
    if (!filePath.startsWith(ROOT_DIR)) {
        return res.status(403).send('Access Denied');
    }

    req.filePath = filePath;
    next();
});

/**
 * Serve random set of images in a given folder
 */
app.get(`${BASE_API_URL}/random-images/*`, (req, res) => {
    const folderPath = req.params[0] || ''; // Capture directory path
    const dirPath = path.join(ROOT_DIR, folderPath);
    const resolvedRoot = path.resolve(ROOT_DIR);
    const resolvedDirPath = path.resolve(dirPath);

    // Security check: Prevent access outside ROOT_DIR
    if (!resolvedDirPath.startsWith(resolvedRoot)) {
        return res.status(403).json({ error: 'Access Denied' });
    }

    // Check that the folder exists
    fs.stat(resolvedDirPath, (err, stats) => {
        if (err || !stats || !stats.isDirectory()) {
            return res.status(404).json({ error: 'Directory not found' });
        }

        // Read the directory contents
        fs.readdir(resolvedDirPath, (err, files) => {
            if (err) {
                return res.status(500).json({ error: 'Error reading directory' });
            }

            // Filter only image files
            const imageFiles = files.filter(file => {
                const ext = path.extname(file).toLowerCase();
                return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
            });

            if (imageFiles.length === 0) {
                return res.status(404).json({ error: 'No images found' });
            }

            // Get the number of images requested (default to 5)
            const numImages = parseInt(req.query.num, 10) || 5;
            const shuffledImages = shuffleArray(imageFiles);
            const selectedImages = shuffledImages.slice(0, numImages);

            // Return image paths or serve images directly
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

/**
 * Fallback: Basic file browser in HTML
 */
app.get('*', (req, res) => {
    const requestedPath = decodeURIComponent(req.path);
    const filePath = req.filePath;

    fs.stat(filePath, (err, stats) => {
        if (err) {
            return res.status(404).send('File not found');
        }

        if (stats.isDirectory()) {
            // List directory contents
            fs.readdir(filePath, (err, files) => {
                if (err) {
                    return res.status(500).send('Error reading directory');
                }

                let html = `<html><body><h1>Image Browser</h1><ul>`;

                // Add a "Go Back" link if not in the root
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
        } else {
            // Serve image files
            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
            };

            const contentType = mimeTypes[ext] || 'application/octet-stream';
            res.setHeader('Content-Type', contentType);
            fs.createReadStream(filePath).pipe(res);
        }
    });
});

// Start server
// Make sure to run ipconfig to get correct IP
app.listen(PORT, () => {
  console.log(`Server running at http://${getLocalIP()}:${PORT}`)
});
