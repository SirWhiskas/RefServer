import fs from 'fs';
import path from 'path';

import { exec } from 'child_process';
import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';

import { getCache, getCacheEntry, setCacheEntry, deleteCacheEntry, clearCache } from './cache.js';
import { shuffleArray, getLocalIP } from './utils.js';
import { isSafePath, collectStats, readDirectoryRecursive } from './fsTree.js';
import { SERVE_DIR, IMAGE_EXTENSIONS, BASE_API_URL, API_TOKEN, ROOT_DIR, DIST_DIR, PORT } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(cors());

function imageApiHandler(req: Request, res: Response, onlyFolders = false) {
    try {
        const folderPath = req.params[0] || '';
        const dirPath = path.join(SERVE_DIR, folderPath);
        const resolvedDirPath = path.resolve(dirPath);
        console.log(resolvedDirPath);
        const cacheKeyName = onlyFolders ? resolvedDirPath + '-onlyFolders' : resolvedDirPath;

        // Security check: Prevent access outside ROOT_DIR
        if (!isSafePath(dirPath)) {
            return res.status(403).json({ error: 'Access Denied' });
        }

        const cacheEntry = getCacheEntry(cacheKeyName);
        if (cacheEntry) {
            return res.json(cacheEntry.data);
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

                setCacheEntry(cacheKeyName, images);

                res.json(images);
            }
        });
    } catch (err) {
        console.error(`Error in imageApiHandler:`, err);
    }
}

app.use((req, res, next) => {
    if (!API_TOKEN) return next();
    if (req.headers['x-api-key'] === API_TOKEN || req.query['api_key'] === API_TOKEN) return next();
    return res.status(401).json({ error: 'Unauthorized' });
});

/**
 * Middleware to prevent access outside the ROOT_DIR
 */
app.use((req, res, next) => {
    if (req.path === BASE_API_URL) {
        req.filePath = SERVE_DIR;
        return next();
    }
    const requestedPath = decodeURIComponent(req.path);
    const filePath = path.join(SERVE_DIR, requestedPath);

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
app.get(`${BASE_API_URL}/random-images/*`, (req: Request, res: Response) => {
    const folderPath = req.params[0] || '';
    const dirPath = path.join(SERVE_DIR, folderPath);
    const resolvedDirPath = path.resolve(dirPath);

    const numberOfImagesRequested = req.query.num as string;

    // Security check: Prevent access outside SERVE_DIR
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

            

            const numImages = parseInt(numberOfImagesRequested, 10) || 5;
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

/**
 * API Route: Return aggregate stats about the image library
 */
app.get(`${BASE_API_URL}/admin/stats`, (req, res) => {
    try {
        res.json(collectStats());
    } catch (err) {
        console.error('Error computing stats:', err);
        res.status(500).json({ error: 'Failed to compute stats' });
    }
});

app.get(`${BASE_API_URL}/admin/cache`, (req, res) => {
    try {
        // Display current cache
        res.json(getCache());
    } catch (err) {
        console.error('Error reading cache:', err);
        res.status(500).json({ error: 'Failed to read cache' });
    }
});

app.delete(`${BASE_API_URL}/admin/cache`, (req, res) => {
    try {
        clearCache();
        res.json({ success: true });
    } catch (err) {
        console.error('Error clearing cache:', err);
        res.status(500).json({ error: 'Failed to clear cache' });
    }
});

app.delete(`${BASE_API_URL}/admin/cache/*`, (req: Request, res: Response) => {
    try {
        const encodedKey = req.params[0] as string;
        const key = decodeURIComponent(encodedKey);
        if (!getCacheEntry(key)) {
            return res.status(404).json({ error: 'Cache entry not found' });
        }
        deleteCacheEntry(key);
        res.json({ success: true });
    } catch (err) {
        console.error('Error clearing cache entry:', err);
        res.status(500).json({ error: 'Failed to clear cache entry' });
    }
});

// Serve originals at /originals for full-res access
app.use('/originals', express.static(ROOT_DIR));

// Serve the bundled Vue app (JS, CSS, index.html)
if (fs.existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR));
}

// Serve image files (compressed if available, otherwise originals)
app.use(express.static(SERVE_DIR));

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

    if (!filePath) return res.status(500);

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
