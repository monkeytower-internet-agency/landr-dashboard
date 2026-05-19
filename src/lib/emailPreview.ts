/**
 * Wrap a raw email-body HTML fragment in a full HTML document with a forced
 * light surface. Without this, an iframe rendering the fragment inherits the
 * OS `prefers-color-scheme` (dark on most dev machines), producing dark-on-dark
 * contrast even though email bodies assume a white inbox surface.
 *
 * See bd ticket landr-i88.
 */
export function buildPreviewSrcDoc(bodyHtml: string): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="color-scheme" content="light only">',
    '<style>',
    ':root { color-scheme: light; }',
    'html, body { background: #ffffff; color: #111111; }',
    'body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; ',
    'padding: 16px; margin: 0; }',
    '</style>',
    '</head>',
    '<body>',
    bodyHtml,
    '</body>',
    '</html>',
  ].join('')
}
