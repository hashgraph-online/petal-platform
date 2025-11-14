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
      <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/50 text-sm text-slate-500">
        {emptyLabel}
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li
          key={item.id}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-medium text-slate-700">{item.author}</span>
            {Number.isNaN(Date.parse(item.timestamp)) ? (
              <span>{item.timestamp}</span>
            ) : (
              <time dateTime={item.timestamp}>{item.timestamp}</time>
            )}
          </div>
          <div className="mt-2 text-sm text-slate-700">{item.content}</div>
        </li>
      ))}
    </ul>
  );
}
