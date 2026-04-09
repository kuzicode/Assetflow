/**
 * Create a temporary directory with empty JSON files for all repos.
 * Provides test isolation for any combination of JSON-based repositories.
 */
export declare function createTestDataDir(): {
    dir: string;
    cleanup: () => void;
};
/**
 * @deprecated Use createTestDataDir instead.
 */
export declare function createTestPnlDir(): {
    dir: string;
    cleanup: () => void;
};
