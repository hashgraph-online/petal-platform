import type { ReactNode } from "react";

type TopicMessage = {
  id: string;
  author: string;
  content: ReactNode;
  timestamp: string;
};

type TopicMessageListProps = {
  items: TopicMessage[];
  emptyLabel?: string;
};

export function TopicMessageList({ items, emptyLabel = "No messages yet." }: TopicMessageListProps) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-holNavy/30 bg-[rgba(26,34,70,0.6)] text-sm text-holNavy/50">
        {emptyLabel}
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li
          key={item.id}
          className="rounded-xl border border-holNavy/25 bg-[rgba(18,24,54,0.9)] p-4 shadow-md backdrop-blur"
        >
          <div className="flex items-center justify-between text-xs text-holNavy/60">
            <span className="font-medium text-[var(--text-primary)]">{item.author}</span>
            {Number.isNaN(Date.parse(item.timestamp)) ? (
              <span>{item.timestamp}</span>
            ) : (
              <time dateTime={item.timestamp}>{item.timestamp}</time>
            )}
          </div>
          <div className="mt-2 text-sm text-[var(--text-primary)]">{item.content}</div>
        </li>
      ))}
    </ul>
  );
}
