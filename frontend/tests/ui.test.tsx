import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  Chip,
  Field,
  Form,
  Input,
  Select,
  Skeleton,
  Spinner,
  VisuallyHidden,
  cn,
} from '@/components/ui';

/**
 * The primitives exist to delete duplicated Tailwind strings, not to change what the
 * browser or a screen reader sees. So these tests pin the rendered element and its
 * accessibility semantics — the things the rest of the suite queries by — rather than
 * the class strings, which stay free to be restyled.
 */

describe('cn', () => {
  it('drops falsy parts and joins the rest with single spaces', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
    expect(cn('  a  b ', 'c')).toBe('a b c');
    expect(cn()).toBe('');
  });

  it('keeps the caller className last so it wins in source order', () => {
    expect(cn('base', 'variant', 'mt-4')).toBe('base variant mt-4');
  });
});

describe('Button', () => {
  it('renders a real button named by its children', () => {
    render(<Button>Subscribe</Button>);

    const button = screen.getByRole('button', { name: 'Subscribe' });
    expect(button.tagName).toBe('BUTTON');
  });

  it('defaults to type="button" but keeps an explicit submit', () => {
    const { rerender } = render(<Button>Subscribe</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');

    rerender(<Button type="submit">Search</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('disables and marks itself busy while loading, without losing its name', () => {
    render(<Button loading>Subscribe</Button>);

    // The label has to outlive the spinner, or the control goes anonymous mid-flight.
    const button = screen.getByRole('button', { name: 'Subscribe' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('is not busy when it is not loading', () => {
    render(<Button>Subscribe</Button>);

    const button = screen.getByRole('button', { name: 'Subscribe' });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('does not fire onClick while loading', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Subscribe
      </Button>,
    );

    await user.click(screen.getByRole('button', { name: 'Subscribe' }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('composes variant and size without dropping the caller className', () => {
    render(
      <Button variant="secondary" size="sm" fullWidth className="mt-2">
        Manage
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Manage' });
    expect(button).toHaveClass('inline-flex', 'border', 'px-3', 'py-1.5', 'text-xs', 'w-full', 'mt-2');
    expect(button.className.endsWith('mt-2')).toBe(true);
  });

  it('forwards native props and its ref to the underlying button', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(
      <Button ref={ref} name="plan" value="pro" aria-label="Choose the pro plan">
        Pro
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Choose the pro plan' });
    expect(button).toHaveAttribute('name', 'plan');
    expect(button).toHaveAttribute('value', 'pro');
    expect(ref.current).toBe(button);
  });
});

describe('ButtonLink', () => {
  it('stays a link while wearing the button styling', () => {
    render(<ButtonLink href="/">Back to search</ButtonLink>);

    const link = screen.getByRole('link', { name: 'Back to search' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/');
    expect(link).toHaveClass('inline-flex', 'rounded-lg');
  });
});

describe('Field', () => {
  it('wires the label to the control it wraps', () => {
    render(<Field label="Search term">{(control) => <Input {...control} placeholder="Nutella" />}</Field>);

    const input = screen.getByLabelText('Search term');
    expect(input.tagName).toBe('INPUT');
    expect(input.id).not.toBe('');
    expect(screen.getByText('Search term').closest('label')).toHaveAttribute('for', input.id);
  });

  it('describes the control with the hint and the error together', () => {
    render(
      <Field label="Search term" hint="At least two characters" error="Search term is too short">
        {(control) => <Input {...control} />}
      </Field>,
    );

    const input = screen.getByLabelText('Search term');
    const describedBy = (input.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);

    expect(describedBy).toHaveLength(2);
    expect(screen.getByText('At least two characters').id).toBe(describedBy[0]);
    expect(screen.getByText('Search term is too short').id).toBe(describedBy[1]);
    expect(input).toHaveAccessibleDescription('At least two characters Search term is too short');
  });

  it('announces the error and marks the control invalid only when there is one', () => {
    const { rerender } = render(<Field label="Search term">{(control) => <Input {...control} />}</Field>);

    const input = screen.getByLabelText('Search term');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('alert')).toBeNull();

    rerender(
      <Field label="Search term" error="Search term is too short">
        {(control) => <Input {...control} />}
      </Field>,
    );

    expect(screen.getByLabelText('Search term')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Search term is too short');
  });

  it('marks the control required only when the field is', () => {
    const { rerender } = render(<Field label="Search term">{(control) => <Input {...control} />}</Field>);
    expect(screen.getByLabelText('Search term')).not.toBeRequired();

    rerender(
      <Field label="Search term" required>
        {(control) => <Input {...control} />}
      </Field>,
    );
    expect(screen.getByLabelText('Search term')).toBeRequired();
  });

  it('hides the label visually while keeping it in the accessibility tree', () => {
    render(
      <Field label="Search term" labelHidden>
        {(control) => <Input {...control} placeholder="Nutella" />}
      </Field>,
    );

    // A placeholder is not a label, so the name has to survive the visual hiding.
    expect(screen.getByLabelText('Search term')).toBeInTheDocument();
    expect(screen.getByText('Search term').closest('.sr-only')).not.toBeNull();
  });
});

describe('Select', () => {
  it('renders a native select named by the Field label and reports changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <Field label="Language" labelHidden>
        {(control) => (
          <Select {...control} defaultValue="en" onChange={onChange}>
            <option value="en">English</option>
            <option value="nl">Nederlands</option>
          </Select>
        )}
      </Field>,
    );

    const select = screen.getByRole('combobox', { name: 'Language' });
    // Native, not a custom listbox: keyboard, screen-reader and mobile behaviour come free.
    expect(select.tagName).toBe('SELECT');

    await user.selectOptions(select, 'nl');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(select).toHaveValue('nl');
  });
});

describe('Form', () => {
  it('renders a form that forwards role and cancels the native submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <Form role="search" onSubmit={onSubmit}>
        <Button type="submit">Search</Button>
      </Form>,
    );

    const form = screen.getByRole('search');
    expect(form.tagName).toBe('FORM');
    expect(form).toHaveAttribute('novalidate');

    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('Alert', () => {
  it('interrupts for error and warning', () => {
    const { rerender } = render(<Alert tone="error">Something broke</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Something broke');

    rerender(<Alert tone="warning">Payment is past due</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Payment is past due');
  });

  it('only updates for info and success', () => {
    const { rerender } = render(<Alert tone="info">Still checking</Alert>);
    expect(screen.getByRole('status')).toHaveTextContent('Still checking');
    expect(screen.queryByRole('alert')).toBeNull();

    rerender(<Alert tone="success">You are subscribed</Alert>);
    expect(screen.getByRole('status')).toHaveTextContent('You are subscribed');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('defaults to the error tone and renders its title and action', () => {
    render(
      <Alert title="Request failed" action={<Button size="sm">Retry</Button>}>
        The network is unavailable
      </Alert>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Request failed');
    expect(alert).toHaveTextContent('The network is unavailable');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('presentational primitives', () => {
  it('Card renders the requested element and drops its padding on demand', () => {
    const { container } = render(
      <Card as="article" padding="none" className="overflow-hidden">
        Body
      </Card>,
    );

    const card = container.firstElementChild;
    expect(card?.tagName).toBe('ARTICLE');
    expect(card).toHaveClass('overflow-hidden', 'shadow-card');
    expect(card).not.toHaveClass('p-5');
  });

  it('Badge and Chip are plain spans, so neither claims to be a control', () => {
    render(
      <>
        <Badge tone="success">Active</Badge>
        <Chip>Dairy</Chip>
      </>,
    );

    expect(screen.getByText('Active').tagName).toBe('SPAN');
    expect(screen.getByText('Dairy').tagName).toBe('SPAN');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('Skeleton and a bare Spinner stay out of the accessibility tree', () => {
    const { container } = render(
      <>
        <Skeleton className="h-4 w-20" />
        <Spinner />
      </>,
    );

    for (const node of Array.from(container.children)) {
      expect(node).toHaveAttribute('aria-hidden', 'true');
    }
    expect(container.textContent).toBe('');
  });

  it('Spinner announces only when it is given a standalone label', () => {
    render(<Spinner label="Loading" />);

    expect(screen.getByText('Loading')).toHaveClass('sr-only');
  });

  it('VisuallyHidden keeps its text readable to a screen reader', () => {
    render(<VisuallyHidden as="div">Subscription status</VisuallyHidden>);

    const hidden = screen.getByText('Subscription status');
    expect(hidden.tagName).toBe('DIV');
    expect(hidden).toHaveClass('sr-only');
  });
});
