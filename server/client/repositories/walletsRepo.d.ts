export declare function setWalletsDataDir(dir: string): void;
export declare function getWalletsDataDir(): string;
export interface WalletRow {
    id: string;
    label: string;
    address: string;
    chains: string[];
}
export declare function listWalletRows(): WalletRow[];
export declare function insertWallet(id: string, label: string, address: string, chains: string[]): void;
export declare function updateWalletLabel(id: string, label: string): boolean;
export declare function deleteWallet(id: string): boolean;
