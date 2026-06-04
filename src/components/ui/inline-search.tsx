"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/firebase";
import type { User } from "@/types";

interface InlineSearchProps {
  churchId: string;
  excludeIds: string[];
  onSelect: (user: User) => void;
  onCancel: () => void;
  placeholder?: string;
}

export function InlineSearch({
  churchId,
  excludeIds,
  onSelect,
  onCancel,
  placeholder = "Buscar membro...",
}: InlineSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query.trim().length < 1) { setResults([]); return; }
    supabase
      .from("users")
      .select("*")
      .eq("church_id", churchId)
      .eq("active", true)
      .ilike("name", `%${query}%`)
      .limit(8)
      .then(({ data }) => {
        const filtered = (data ?? []).filter((u: User) => !excludeIds.includes(u.id));
        setResults(filtered);
      });
  }, [query, churchId, excludeIds]);

  return (
    <div className="border border-brand/30 rounded-md bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-soft">
        <svg className="w-3.5 h-3.5 text-ink-faint flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="flex-1 text-sm outline-none bg-transparent text-ink placeholder:text-ink-faint"
        />
        <button onClick={onCancel} className="text-ink-faint hover:text-ink text-xs transition-colors">
          Cancelar
        </button>
      </div>
      {results.length > 0 && (
        <ul>
          {results.map((u) => (
            <li key={u.id}>
              <button
                onClick={() => onSelect(u)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-surface-alt transition-colors text-sm text-ink"
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                  style={{ background: u.avatar_color }}
                >
                  {u.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <span className="flex-1 truncate">{u.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.length > 0 && results.length === 0 && (
        <p className="px-3 py-3 text-xs text-ink-faint">Nenhum resultado para &ldquo;{query}&rdquo;</p>
      )}
    </div>
  );
}
