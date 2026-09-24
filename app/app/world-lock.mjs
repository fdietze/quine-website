// WAITING FOR A WORLD ANOTHER TAB HOLDS. A world has one writer, and the
// writer's claim is a Web Lock its Worker holds for the world's whole life
// (crates/quine-browser/src/opfs.rs `WorldLock`, which names it
// `quine-world/<id>` - this name is that contract). The browser queues lock
// requests and grants them when the holder releases or dies, so the refused
// tab waits on the PLATFORM's own queue instead of polling. The lock is let go
// the moment it is granted: the Worker of the reopened view takes it for real.

/** Resolve once no other tab holds the world `worldId`. */
export async function waitUntilFree(worldId) {
  await navigator.locks.request(`quine-world/${worldId}`, () => {});
}
