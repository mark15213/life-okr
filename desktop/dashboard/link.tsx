import type { AnchorHTMLAttributes } from 'react';

// Existing Next pages keep their links. The desktop renderer uses local hash
// routes so navigation never loads remote code or needs a Next server.
export default function Link({ href = '/', ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} href={href.startsWith('/') ? `#${href}` : href} />;
}
