import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

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
      <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-border bg-muted text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id}>
          <Card className="rounded-xl p-4 shadow-md backdrop-blur">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{item.author}</span>
            {Number.isNaN(Date.parse(item.timestamp)) ? (
              <span>{item.timestamp}</span>
            ) : (
              <time dateTime={item.timestamp}>{item.timestamp}</time>
            )}
          </div>
          <div className="mt-2 text-sm text-foreground">{item.content}</div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
