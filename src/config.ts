import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const BASE_API_URL = process.env.BASE_API_URL || '/my/api/path';
export const IMAGE_ROOT_PATH = process.env.IMAGE_ROOT_PATH || '/';

export const PORT = process.env.PORT || 8000;
export const ROOT_DIR = path.resolve(IMAGE_ROOT_PATH);
export const COMPRESSED_ROOT_PATH = process.env.COMPRESSED_ROOT_PATH;
export const COMPRESSED_DIR = COMPRESSED_ROOT_PATH ? path.resolve(COMPRESSED_ROOT_PATH) : null;
export const SERVE_DIR = COMPRESSED_DIR || ROOT_DIR;
export const DIST_DIR = path.join(__dirname, '..', 'dist');

export const CACHE_FILE = path.resolve("cache.json");
export const CACHE_EXPIRATION = 1000 * 60 * 60; // 1 hour

export const IMAGE_EXTENSIONS: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
};

export const API_TOKEN = process.env.API_TOKEN;