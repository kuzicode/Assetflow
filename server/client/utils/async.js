export async function mapWithConcurrency(items, limit, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;
    const worker = async () => {
        while (true) {
            const current = nextIndex;
            nextIndex += 1;
            if (current >= items.length)
                return;
            results[current] = await mapper(items[current], current);
        }
    };
    const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, () => worker());
    await Promise.all(workers);
    return results;
}
