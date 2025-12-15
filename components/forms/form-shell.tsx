import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type FormShellProps = {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
};

export function FormShell({ title, description, children, actions }: FormShellProps) {
  return (
    <Card className="space-y-6 rounded-2xl p-6 shadow-lg backdrop-blur">
      <CardHeader className="space-y-1 p-0">
        <CardTitle className="text-lg">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4 p-0">{children}</CardContent>
      {actions ? (
        <CardFooter className="flex justify-end gap-3 p-0">{actions}</CardFooter>
      ) : null}
    </Card>
  );
}
