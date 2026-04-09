export declare function setManualAssetsDataDir(dir: string): void;
export declare function getManualAssetsDataDir(): string;
export interface ManualAssetRow {
    id: string;
    label: string;
    baseToken: string;
    amount: number;
    source: string;
    platform: string;
    updatedAt: string;
}
export declare function listManualAssetRows(): ManualAssetRow[];
export declare function upsertManualAsset(input: ManualAssetRow): void;
export declare function deleteManualAsset(id: string): boolean;
