import { cn } from './ui';

/**
 * Flags for the countries Open Food Facts actually returns often, drawn inline.
 *
 * Regional-indicator emoji are not an option: Windows renders them as bare letter
 * pairs. Shipping all ~250 flags as SVG is not one either, so this covers the
 * geometrically simple ones — bands and Nordic crosses reach most of Europe — and
 * anything else falls back to the ISO code in a chip. A missing flag therefore
 * costs a little polish, never the information itself.
 */
type FlagSpec =
  | { kind: 'vertical'; colors: readonly [string, string, string] }
  | { kind: 'horizontal'; colors: readonly string[] }
  | { kind: 'nordic'; field: string; cross: string; inner?: string }
  | { kind: 'swiss' }
  | { kind: 'union' }
  | { kind: 'stars-and-stripes' };

const FLAGS: Readonly<Record<string, FlagSpec>> = {
  AT: { kind: 'horizontal', colors: ['#ed2939', '#fff', '#ed2939'] },
  BE: { kind: 'vertical', colors: ['#000', '#fdda24', '#ef3340'] },
  BG: { kind: 'horizontal', colors: ['#fff', '#00966e', '#d62612'] },
  CH: { kind: 'swiss' },
  DE: { kind: 'horizontal', colors: ['#000', '#dd0000', '#ffce00'] },
  DK: { kind: 'nordic', field: '#c8102e', cross: '#fff' },
  EE: { kind: 'horizontal', colors: ['#0072ce', '#000', '#fff'] },
  ES: { kind: 'horizontal', colors: ['#aa151b', '#f1bf00', '#aa151b'] },
  FI: { kind: 'nordic', field: '#fff', cross: '#003580' },
  FR: { kind: 'vertical', colors: ['#002395', '#fff', '#ed2939'] },
  GB: { kind: 'union' },
  HU: { kind: 'horizontal', colors: ['#cd2a3e', '#fff', '#436f4d'] },
  IE: { kind: 'vertical', colors: ['#169b62', '#fff', '#ff883e'] },
  IS: { kind: 'nordic', field: '#02529c', cross: '#fff', inner: '#dc1e35' },
  IT: { kind: 'vertical', colors: ['#008c45', '#f4f5f0', '#cd212a'] },
  LT: { kind: 'horizontal', colors: ['#fdb913', '#006a44', '#c1272d'] },
  LU: { kind: 'horizontal', colors: ['#ed2939', '#fff', '#00a1de'] },
  NL: { kind: 'horizontal', colors: ['#ae1c28', '#fff', '#21468b'] },
  NO: { kind: 'nordic', field: '#ba0c2f', cross: '#fff', inner: '#00205b' },
  PL: { kind: 'horizontal', colors: ['#fff', '#dc143c'] },
  RO: { kind: 'vertical', colors: ['#002b7f', '#fcd116', '#ce1126'] },
  RU: { kind: 'horizontal', colors: ['#fff', '#0039a6', '#d52b1e'] },
  SE: { kind: 'nordic', field: '#006aa7', cross: '#fecc00' },
  UA: { kind: 'horizontal', colors: ['#0057b7', '#ffd700'] },
  US: { kind: 'stars-and-stripes' },
};

const BOX = 'shrink-0 rounded-[2px] ring-1 ring-black/10 dark:ring-white/20';

function FlagShape({ spec }: { spec: FlagSpec }) {
  switch (spec.kind) {
    case 'vertical':
      return (
        <>
          {spec.colors.map((color, index) => (
            <rect key={color + String(index)} x={index * 8} width="8" height="16" fill={color} />
          ))}
        </>
      );
    case 'horizontal': {
      const band = 16 / spec.colors.length;
      return (
        <>
          {spec.colors.map((color, index) => (
            <rect key={color + String(index)} y={index * band} width="24" height={band} fill={color} />
          ))}
        </>
      );
    }
    case 'nordic':
      return (
        <>
          <rect width="24" height="16" fill={spec.field} />
          <path d="M9 0V16M0 8H24" stroke={spec.cross} strokeWidth="4" />
          {spec.inner ? <path d="M9 0V16M0 8H24" stroke={spec.inner} strokeWidth="1.8" /> : null}
        </>
      );
    case 'swiss':
      return (
        <>
          <rect width="24" height="16" fill="#d52b1e" />
          <path d="M12 4.5V11.5M8.5 8H15.5" stroke="#fff" strokeWidth="2.4" />
        </>
      );
    case 'union':
      return (
        <>
          <rect width="24" height="16" fill="#012169" />
          <path d="M0 0 24 16M24 0 0 16" stroke="#fff" strokeWidth="3.2" />
          <path d="M0 0 24 16M24 0 0 16" stroke="#c8102e" strokeWidth="1.8" />
          <path d="M12 0V16M0 8H24" stroke="#fff" strokeWidth="5.4" />
          <path d="M12 0V16M0 8H24" stroke="#c8102e" strokeWidth="3.2" />
        </>
      );
    case 'stars-and-stripes':
      return (
        <>
          <rect width="24" height="16" fill="#fff" />
          {/* Seven red stripes; the stars are dropped, they would be mud at this size. */}
          {[0, 1, 2, 3, 4, 5, 6].map((index) => (
            <rect key={index} y={index * 2.46} width="24" height="1.23" fill="#b31942" />
          ))}
          <rect width="10" height="8.6" fill="#0a3161" />
        </>
      );
    default:
      return null;
  }
}

export interface CountryFlagProps {
  /** ISO 3166-1 alpha-2, or null when the API could not resolve one. */
  code: string | null;
  className?: string;
}

export function CountryFlag({ code, className }: CountryFlagProps) {
  const spec = code === null ? undefined : FLAGS[code.toUpperCase()];

  if (spec === undefined) {
    // No drawing for this country: the code itself is the mark.
    return code === null ? null : (
      <span
        aria-hidden="true"
        className={cn(
          BOX,
          'grid h-3.5 min-w-5 place-items-center bg-neutral-100 px-1 text-[0.5rem] font-bold leading-none text-neutral-600 dark:bg-neutral-700 dark:text-neutral-200',
          className,
        )}
      >
        {code.toUpperCase()}
      </span>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 16" className={cn(BOX, 'h-3.5 w-5', className)}>
      <FlagShape spec={spec} />
    </svg>
  );
}
