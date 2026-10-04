// Urna estilizada: caixa com fenda e um voto (check) entrando.
export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label="Apura26">
      <rect width="40" height="40" rx="8" fill="var(--primary)" />
      <path
        d="M13 9.5h14v9H13z"
        fill="var(--primary-foreground)"
        className="origin-center animate-[logo-drop_3s_ease-in-out_infinite]"
      />
      <path
        d="M16.2 13.8l2.3 2.3 5-4.6"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="animate-[logo-drop_3s_ease-in-out_infinite]"
      />
      <rect
        x="8"
        y="19"
        width="24"
        height="13"
        rx="2"
        fill="var(--primary-foreground)"
        opacity="0.95"
      />
      <rect x="13" y="18" width="14" height="2.4" rx="1.2" fill="var(--primary)" />
      <text
        x="20"
        y="29.5"
        textAnchor="middle"
        fontSize="8.5"
        fontWeight="900"
        fill="var(--primary)"
        fontFamily="system-ui, sans-serif"
      >
        26
      </text>
    </svg>
  );
}
