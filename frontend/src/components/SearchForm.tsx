'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button, Field, Form, Input } from './ui';

const MIN_LENGTH = 2;
const MAX_LENGTH = 100;

interface SearchFormProps {
  initialTerm: string;
  pending: boolean;
  onSubmit: (term: string) => void;
}

export function SearchForm({ initialTerm, pending, onSubmit }: SearchFormProps) {
  const t = useTranslations('search');
  const [term, setTerm] = useState(initialTerm);
  const [errorKey, setErrorKey] = useState<'minLength' | 'tooLong' | null>(null);

  // The page owns the q parameter, so a shared link or a language switch wins over local state.
  useEffect(() => {
    setTerm(initialTerm);
  }, [initialTerm]);

  function handleSubmit() {
    const trimmed = term.trim();
    if (trimmed.length < MIN_LENGTH) {
      setErrorKey('minLength');
      return;
    }
    if (trimmed.length > MAX_LENGTH) {
      setErrorKey('tooLong');
      return;
    }
    setErrorKey(null);
    onSubmit(trimmed);
  }

  return (
    <Form role="search" onSubmit={handleSubmit} className="w-full">
      <Field label={t('label')} labelHidden error={errorKey === null ? undefined : t(errorKey)}>
        {(controlProps) => (
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 fill-neutral-400"
              >
                <path d="M8.5 3a5.5 5.5 0 1 0 3.23 9.95l3.32 3.32a1 1 0 0 0 1.42-1.42l-3.32-3.32A5.5 5.5 0 0 0 8.5 3Zm0 2a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z" />
              </svg>
              <Input
                {...controlProps}
                name="q"
                type="search"
                value={term}
                autoComplete="off"
                enterKeyHint="search"
                placeholder={t('placeholder')}
                invalid={errorKey !== null}
                onChange={(event) => {
                  setTerm(event.target.value);
                  if (errorKey !== null) setErrorKey(null);
                }}
                className="py-2.5 pl-9 pr-3 shadow-sm transition"
              />
            </div>
            <Button type="submit" loading={pending} className="py-2.5">
              {pending ? t('searching') : t('submit')}
            </Button>
          </div>
        )}
      </Field>
    </Form>
  );
}
