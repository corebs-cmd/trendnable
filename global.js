// Stub browser globals so Metro's HMR client doesn't crash on boot
if (typeof window !== 'undefined') {
  if (!window.location) {
    window.location = {
      protocol: 'http:',
      host: 'localhost:8081',
      hostname: 'localhost',
      port: '8081',
      pathname: '/',
      search: '',
      hash: '',
      href: 'http://localhost:8081/',
      origin: 'http://localhost:8081',
    };
  }
}

if (typeof document === 'undefined') {
  global.document = {
    currentScript: null,
    createElement: () => ({}),
    head: { appendChild: () => {} },
  };
}
