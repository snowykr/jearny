// Test-only ambient types. The app runs in the browser and deliberately does not
// install @types/node; the art/collision test reads the exported PNG from disk.
declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}

declare module 'pngjs' {
  export class PNG {
    static sync: {
      read(buffer: Uint8Array): { width: number; height: number; data: Uint8Array };
    };
  }
}
