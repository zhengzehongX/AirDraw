import styles from './Logo.module.css';

type LogoProps = { size?: number; className?: string };

/** AirDraw mark: a fingertip trail lifting off into air. */
export function Logo({ size = 44, className }: LogoProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="airdraw-stroke" x1="4" y1="40" x2="44" y2="8" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" />
          <stop offset="0.55" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      <path
        d="M6 38c6.5 1.6 10.2-2.1 9.8-6.6-.4-4.2-4-5.4-6.2-3.4-2.4 2.2-1.5 6.6 3.6 8.6 5.4 2.1 11.4-.4 15.6-5.6 3.3-4.1 5.6-9.1 7-14.6"
        stroke="url(#airdraw-stroke)"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <circle cx="38.4" cy="12.6" r="4.6" fill="url(#airdraw-stroke)" opacity="0.28" />
      <circle cx="38.4" cy="12.6" r="2.2" fill="#f8fafc" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`${styles.wordmark} ${className ?? ''}`}>
      Air<span className={styles.accent}>Draw</span>
    </span>
  );
}
