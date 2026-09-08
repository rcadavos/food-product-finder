import { useTranslations } from 'next-intl';
import { cn } from './ui';

/** The official Nutri-Score ramp; foregrounds are picked for contrast on each swatch. */
const GRADE_STYLES: Record<string, string> = {
  a: 'bg-[#038141] text-white',
  b: 'bg-[#85bb2f] text-neutral-900',
  c: 'bg-[#fecb02] text-neutral-900',
  d: 'bg-[#ee8100] text-neutral-900',
  e: 'bg-[#e63e11] text-white',
};

interface NutriScoreBadgeProps {
  grade: string | null;
  size?: 'sm' | 'md';
}

/** Not a `Badge`: the A–E ramp is data, not one of the four status tones. */
export function NutriScoreBadge({ grade, size = 'sm' }: NutriScoreBadgeProps) {
  const t = useTranslations('product');
  const normalized = (grade ?? '').trim().toLowerCase();
  const swatch = GRADE_STYLES[normalized];

  if (!swatch) return null;

  const letter = normalized.toUpperCase();
  const label = t('nutriscoreValue', { grade: letter });

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-md font-bold uppercase leading-none ring-1 ring-black/10',
        swatch,
        size === 'md' ? 'h-10 w-10 text-lg' : 'h-7 w-7 text-xs',
      )}
    >
      {letter}
    </span>
  );
}
