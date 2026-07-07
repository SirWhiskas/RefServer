export interface TreeNode {
    key: string,
    label: string,
    data?: string,
    path: string,
    icon: string,
    children?: TreeNode[]
}

export interface CacheEntry<T = unknown> {
    lastUpdated: number,
    data: T
}

export interface DataStats {
    totalImages: number,
    totalFolders: number,
    totalSizeMB: number,
    compressedImages: number,
    pendingCompression: number
}


export type CacheStore<T = unknown> = Record<string, CacheEntry<T>>

declare global {
    namespace Express {
        interface Request {
            filePath?: string
        }
    }
}