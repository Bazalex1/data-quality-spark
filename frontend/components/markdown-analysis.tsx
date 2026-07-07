'use client';

import { cn } from '@/lib/utils';

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function renderParagraph(text: string, key: string) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const lines = trimmed.split('\n');
  const isList = lines.every((line) => line.trim() === '' || line.trim().startsWith('- '));

  if (isList) {
    const items = lines
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).trim());

    if (items.length > 0) {
      return (
        <ul key={key} className="list-disc space-y-2 pl-5 text-foreground/90">
          {items.map((item, index) => (
            <li key={`${key}-${index}`} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
    }
  }

  return (
    <p key={key} className="leading-relaxed text-foreground/90">
      {renderInline(trimmed)}
    </p>
  );
}

export default function MarkdownAnalysis({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  const sections = normalized.split(/\n(?=## )/);

  return (
    <div className={cn('space-y-6', className)}>
      {sections.map((section, sectionIndex) => {
        const lines = section.split('\n');
        const headingLine = lines[0]?.startsWith('## ')
          ? lines[0].slice(3).trim()
          : null;
        const body = headingLine ? lines.slice(1).join('\n') : section;
        const blocks = body.split(/\n\n+/).filter(Boolean);

        return (
          <section
            key={sectionIndex}
            className="rounded-xl border border-border/70 bg-background/60 p-4 shadow-sm"
          >
            {headingLine && (
              <h3 className="mb-3 text-base font-semibold tracking-tight text-foreground">
                {headingLine}
              </h3>
            )}
            <div className="space-y-3">
              {blocks.map((block, blockIndex) =>
                renderParagraph(block, `${sectionIndex}-${blockIndex}`)
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}