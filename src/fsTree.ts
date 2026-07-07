import fs from 'fs';
import path from 'path';

import type { TreeNode, DataStats } from './types.js';

import { SERVE_DIR, ROOT_DIR, COMPRESSED_DIR, IMAGE_EXTENSIONS } from './config.js';

export function isSafePath(p: string): boolean {
    return path.resolve(p).startsWith(SERVE_DIR);
}

export function readDirectoryRecursive(directory: string, keyPrefix: string = '', onlyFolders: boolean = false): TreeNode[] {
    let results: TreeNode[] = [];

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
                    path: filePath.replace(SERVE_DIR, ""),
                    children: readDirectoryRecursive(filePath, `${keyPrefix}${fileIndex}-`, onlyFolders)
                });
            } else if (!onlyFolders) {
                results.push({
                    key: `${keyPrefix}${fileIndex}`,
                    label: file,
                    data: `${file} image`,
                    icon: 'pi pi-image',
                    path: filePath.replace(SERVE_DIR, "")
                });
            }

            fileIndex++;
        }
    } catch (err) {
        console.error(`Error reading directory ${directory}:`, err);
    }

    return results;
}

export function collectStats(): DataStats {
    let totalImages = 0;
    let totalFolders = 0;
    let totalSizeBytes = 0;
    let compressedImages = 0;

    function walk(currentDir: string) {
        let files;
        try {
            files = fs.readdirSync(currentDir);
        } catch {
            return;
        }

        for (const file of files) {
            const filePath = path.join(currentDir, file);
            let stats;
            try {
                stats = fs.statSync(filePath);
            } catch {
                continue;
            }

            if (stats.isDirectory()) {
                totalFolders++;
                walk(filePath);
            } else if (path.extname(file).toLowerCase() in IMAGE_EXTENSIONS) {
                totalImages++;
                totalSizeBytes += stats.size;

                if (COMPRESSED_DIR) {
                    const relativePath = path.relative(ROOT_DIR, filePath).replace(/\.[^.]+$/, '.webp');
                    if (fs.existsSync(path.join(COMPRESSED_DIR, relativePath))) {
                        compressedImages++;
                    }
                }
            }
        }
    }

    walk(ROOT_DIR);

    return {
        totalImages,
        totalFolders,
        totalSizeMB: Math.round((totalSizeBytes / (1024 * 1024)) * 10) / 10,
        compressedImages: COMPRESSED_DIR ? compressedImages : 0,
        pendingCompression: COMPRESSED_DIR ? totalImages - compressedImages : totalImages
    } as DataStats;
}