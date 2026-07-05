// Module-level data handoff between camera and processing screens.
// Not React state — no Fabric commits, no event loop impact.
// Camera screen writes here then navigates; processing screen reads and clears.

export type PendingScan =
  | { type: 'barcode'; value: string }
  | { type: 'visual'; photoUri: string }
  | null;

let _pending: PendingScan = null;

export function setPendingScan(scan: PendingScan): void {
  _pending = scan;
}

export function takePendingScan(): PendingScan {
  const scan = _pending;
  _pending = null;
  return scan;
}
