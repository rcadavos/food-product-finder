import type { FormHTMLAttributes, Ref } from 'react';

export interface FormProps extends Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> {
  onSubmit: () => void;
  ref?: Ref<HTMLFormElement>;
}

/**
 * Every form in the app validates in React, so the browser's own bubbles are off and the
 * default page reload is cancelled here instead of in each handler.
 */
export function Form({ onSubmit, children, ...rest }: FormProps) {
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      {...rest}
    >
      {children}
    </form>
  );
}
