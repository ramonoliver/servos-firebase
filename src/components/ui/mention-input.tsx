"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/lib/firebase";
import { getInitials } from "@/lib/utils/helpers";

interface User {
  id: string;
  name: string;
  avatar_color?: string;
  photo_url?: string;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  disabled?: boolean;
  scheduleId: string;
  churchId: string;
  mode?: 'schedule' | 'department'; // schedule for schedule chat, department for department messages
}

export function MentionInput({
  value,
  onChange,
  onSend,
  placeholder = "Digite sua mensagem...",
  disabled = false,
  scheduleId,
  churchId,
  mode = 'schedule',
}: MentionInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState(-1);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load potential mentionable users
  const loadMentionableUsers = useCallback(async () => {
    try {
      let allUserIds: string[] = [];

      if (mode === 'schedule') {
        // Get schedule participants and leaders
        const [{ data: scheduleMembers }, { data: department }] = await Promise.all([
          supabase
            .from("schedule_members")
            .select("user_id")
            .eq("schedule_id", scheduleId),
          supabase
            .from("schedules")
            .select("department_id")
            .eq("id", scheduleId)
            .single()
        ]);

        const participantIds = scheduleMembers?.map(m => m.user_id) || [];

        // Get department leaders
        let leaderIds: string[] = [];
        if (department?.department_id) {
          const { data: dept } = await supabase
            .from("departments")
            .select("leader_ids, co_leader_ids")
            .eq("id", department.department_id)
            .single();

          leaderIds = [
            ...(dept?.leader_ids || []),
            ...(dept?.co_leader_ids || [])
          ];
        }

        allUserIds = [...new Set([...participantIds, ...leaderIds])];
      } else {
        // mode === 'department' - Get department members and leaders
        const [{ data: deptMembers }, { data: department }] = await Promise.all([
          supabase
            .from("department_members")
            .select("user_id")
            .eq("department_id", scheduleId), // scheduleId is used as departmentId in this mode
          supabase
            .from("departments")
            .select("leader_ids, co_leader_ids")
            .eq("id", scheduleId)
            .single()
        ]);

        const memberIds = deptMembers?.map(m => m.user_id) || [];
        const leaderIds = [
          ...(department?.leader_ids || []),
          ...(department?.co_leader_ids || [])
        ];
        allUserIds = [...new Set([...memberIds, ...leaderIds])];
      }

      // Get user details
      const { data: users } = await supabase
        .from("users")
        .select("id, name, avatar_color, photo_url")
        .eq("church_id", churchId)
        .in("id", allUserIds)
        .eq("active", true);

      setSuggestions(users || []);
    } catch (error) {
      console.error("Error loading mentionable users:", error);
      setSuggestions([]);
    }
  }, [scheduleId, churchId, mode]);

  useEffect(() => {
    loadMentionableUsers();
  }, [loadMentionableUsers]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newCursorPosition = e.target.selectionStart || 0;

    onChange(newValue);
    setCursorPosition(newCursorPosition);

    // Check for @ mention
    const textBeforeCursor = newValue.substring(0, newCursorPosition);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex !== -1 && atIndex === textBeforeCursor.length - 1) {
      // Just typed @
      setMentionStart(atIndex);
      setMentionQuery("");
      setShowSuggestions(true);
    } else if (atIndex !== -1 && newCursorPosition > atIndex + 1) {
      // Typing after @
      const query = textBeforeCursor.substring(atIndex + 1);
      if (!query.includes(' ')) {
        setMentionStart(atIndex);
        setMentionQuery(query);
        setShowSuggestions(true);
      } else {
        setShowSuggestions(false);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (showSuggestions && suggestions.length > 0) {
        // Select first suggestion
        selectSuggestion(suggestions[0]);
      } else {
        onSend();
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (user: User) => {
    if (mentionStart === -1) return;

    const beforeMention = value.substring(0, mentionStart);
    const afterMention = value.substring(cursorPosition);
    const mentionText = `@${user.name.replace(/\s+/g, '')}`;

    const newValue = beforeMention + mentionText + ' ' + afterMention;
    onChange(newValue);

    setShowSuggestions(false);
    setMentionStart(-1);
    setMentionQuery("");

    // Focus back to input and set cursor position
    setTimeout(() => {
      if (inputRef.current) {
        const newCursorPos = beforeMention.length + mentionText.length + 1;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const filteredSuggestions = suggestions.filter(user =>
    user.name.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  return (
    <div className="relative flex-1">
      <textarea
        ref={inputRef}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full h-12 px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-100 text-sm"
        rows={1}
      />

      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
          {filteredSuggestions.map((user) => (
            <button
              key={user.id}
              onClick={() => selectSuggestion(user)}
              className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2 first:rounded-t-lg last:rounded-b-lg"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                style={{ backgroundColor: user.avatar_color || '#3B82F6' }}
              >
                {user.photo_url ? (
                  <img
                    src={user.photo_url}
                    alt={user.name}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  getInitials(user.name)
                )}
              </div>
              <span className="text-sm">{user.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}