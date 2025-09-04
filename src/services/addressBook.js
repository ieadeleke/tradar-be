const watched = new Set(); // lowercase addresses

export function addAddress(addr) { watched.add(addr.toLowerCase()); }
export function hasAddress(addr) { return watched.has(addr.toLowerCase()); }
export function addMany(addrs) { for (const a of addrs) watched.add(a.toLowerCase()); }
export function allAddresses() { return watched; }
