interface AdminSession {
    token: string;
    expiresAt: number;
}
export declare function createAdminSession(): AdminSession;
export declare function clearAdminSession(): void;
export declare function isValidAdminToken(token: string | null | undefined): boolean;
export {};
