/**
 * Bootstrap-time rule: every protocol id a layer tool is bound to must
 * be registered. A typo would otherwise bind silently to nothing — the tool
 * never appears on any node.
 */

/**
 * Asserts every bound protocol id is registered; throws naming all unknown
 * ids in one message, so a single run surfaces every typo.
 * @param boundIds - Protocol ids tools are bound to (both roles)
 * @param registered - Ids of the registered protocols
 */
export function assertKnownProtocols(
    boundIds: readonly string[],
    registered: ReadonlySet<string>,
): void {
    const unknown = boundIds.filter((id) => !registered.has(id));
    if (unknown.length > 0) {
        throw new Error(
            `Layer tools are bound to unregistered protocols: ${unknown
                .map((id) => `"${id}"`)
                .join(", ")}.`,
        );
    }
}
