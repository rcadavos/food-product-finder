import { titleCase } from '@/lib/format';
import { Chip } from './ui';

interface TagListProps {
  label: string;
  tags: string[];
  emptyText?: string;
}

export function TagList({ label, tags, emptyText }: TagListProps) {
  if (tags.length === 0 && emptyText === undefined) return null;

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{label}</h3>
      {tags.length > 0 ? (
        <ul role="list" className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag}>
              <Chip>{titleCase(tag)}</Chip>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{emptyText}</p>
      )}
    </section>
  );
}
