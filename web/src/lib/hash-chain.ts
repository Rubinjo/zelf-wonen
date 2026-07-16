export function orderHashChain<
    T extends { previousHash: string | null; entryHash: string },
>(entries: T[]): T[] | null {
    if (entries.length === 0) return [];
    const byPrevious = new Map<string | null, T>();
    for (const entry of entries) {
        if (byPrevious.has(entry.previousHash)) return null;
        byPrevious.set(entry.previousHash, entry);
    }

    const ordered: T[] = [];
    const seen = new Set<string>();
    let previous: string | null = null;
    while (ordered.length < entries.length) {
        const entry = byPrevious.get(previous);
        if (!entry || seen.has(entry.entryHash)) return null;
        ordered.push(entry);
        seen.add(entry.entryHash);
        previous = entry.entryHash;
    }
    return ordered;
}
