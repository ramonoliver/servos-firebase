"use client";

interface SplitViewProps {
  list: React.ReactNode;
  detail: React.ReactNode | null;
  listWidth?: number;
  placeholder?: React.ReactNode;
}

export function SplitView({ list, detail, listWidth = 260, placeholder }: SplitViewProps) {
  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-[24px] border border-white/60 bg-white/55 shadow-sm backdrop-blur-md lg:flex-row"
      style={{ "--list-width": `${listWidth}px` } as React.CSSProperties}
    >
      <div
        className="flex max-h-[42dvh] w-full flex-shrink-0 flex-col overflow-hidden border-b border-white/50 lg:max-h-none lg:w-[var(--list-width)] lg:border-b-0 lg:border-r"
      >
        {list}
      </div>
      <div className="flex-1 overflow-hidden flex flex-col">
        {detail ?? placeholder}
      </div>
    </div>
  );
}
