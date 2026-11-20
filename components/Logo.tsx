// Calvessa mark: a dusk crescent cradling an ember dot (the evening reach window). Same paths in docs/index.html.
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Calvessa">
      <rect width="32" height="32" rx="9" fill="#2A2060" />
      <path d="M20.5 7.2a9.6 9.6 0 1 0 4.3 16.9 8 8 0 1 1-4.3-16.9Z" fill="#B9AEFA" />
      <circle cx="21.6" cy="13.4" r="3.1" fill="#F29A62" />
    </svg>
  );
}
