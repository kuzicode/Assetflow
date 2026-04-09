export declare function setSettingsDataDir(dir: string): void;
export declare function getSettingsDataDir(): string;
export declare function getSettingsMap(): Record<string, string>;
export declare function getSetting(key: string): string | undefined;
export declare function upsertSettings(updates: Record<string, string>): void;
