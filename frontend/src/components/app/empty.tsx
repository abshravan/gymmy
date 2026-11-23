import type { FC } from "react";
import { SearchLg } from "@untitledui/icons";
import { EmptyState } from "@/components/application/empty-state/empty-state";

export function Empty({ icon = SearchLg, title, description, children, size = "sm" }: {
  icon?: FC<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className="animate-rise px-4 py-10 md:py-12">
      <EmptyState size={size}>
        <EmptyState.Header pattern="circle" patternSize="sm">
          <EmptyState.FeaturedIcon icon={icon} color="gray" theme="modern" />
        </EmptyState.Header>
        <EmptyState.Content>
          <EmptyState.Title>{title}</EmptyState.Title>
          {description && <EmptyState.Description>{description}</EmptyState.Description>}
        </EmptyState.Content>
        {children && <EmptyState.Footer>{children}</EmptyState.Footer>}
      </EmptyState>
    </div>
  );
}
