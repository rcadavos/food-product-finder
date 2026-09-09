import type { AnchorHTMLAttributes, Ref } from 'react';
import { Link } from '@/i18n/navigation';
import { buttonClasses, type ButtonSize, type ButtonVariant } from './Button';

export interface ButtonLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  ref?: Ref<HTMLAnchorElement>;
}

/**
 * A navigation that looks like a button. It stays a real link — locale-aware, openable in a
 * new tab — rather than a `<button>` that calls `router.push`.
 */
export function ButtonLink({
  href,
  variant,
  size,
  fullWidth,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link href={href} className={buttonClasses({ variant, size, fullWidth, className })} {...rest}>
      {children}
    </Link>
  );
}
