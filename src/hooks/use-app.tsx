"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase, auth } from "@/lib/firebase";
import { signInWithCustomToken, signOut } from "firebase/auth";
import { getSession, clearSession, updateSession } from "@/lib/auth/session";
// supabase client retained for notifications polling below
import { can, type Action } from "@/lib/auth/permissions";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import type { User, Church, Department, Session } from "@/types";

interface AppContextType {
  user: User;
  session: Session;
  church: Church;
  departments: Department[];
  userDeptIds: string[];
  unreadNotifications: number;
  setUnreadNotifications: (n: number) => void;
  pushPermission: NotificationPermission | "unsupported";
  pushEnabled: boolean;
  registeringPush: boolean;
  enablePushNotifications: () => Promise<boolean>;
  retryPushNotifications: () => Promise<boolean>;
  toast: (msg: string) => void;
  canDo: (action: Action, deptId?: string) => boolean;
  refresh: () => void;
  logout: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSessionState] = useState<Session | null>(null);
  const [church, setChurch] = useState<Church | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [userDeptIds, setUserDeptIds] = useState<string[]>([]);
  const [toastMsg, setToastMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const unreadNotificationCountRef = useRef<number | null>(null);
  const lastUnreadNotificationIdRef = useRef<string | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3200);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const localSession = getSession();

      if (!localSession) {
        router.replace("/login");
        return;
      }

      const authHeaders = localSession.token ? { "x-servos-auth": localSession.token } : {};

      // Validate session and fetch all app data in one server-side call
      const [sessionRes, appRes] = await Promise.all([
        fetch("/api/auth/session", { method: "GET", credentials: "include", headers: authHeaders }),
        fetch("/api/app/load", { method: "GET", credentials: "include", headers: authHeaders }),
      ]);

      const sessionPayload = await sessionRes.json().catch(() => null);

      if (!sessionRes.ok || !sessionPayload?.authenticated || !sessionPayload?.session) {
        clearSession();
        router.replace("/login");
        return;
      }

      const s = {
        ...localSession,
        ...sessionPayload.session,
        token: sessionPayload.token || localSession.token,
      } as Session;

      updateSession({ ...sessionPayload.session, token: sessionPayload.token || localSession.token });

      if (sessionPayload.firebaseToken) {
        await signInWithCustomToken(auth, sessionPayload.firebaseToken);
      }

      if (!appRes.ok) {
        console.error("Erro ao carregar dados do app:", appRes.status);
        return;
      }

      const appData = await appRes.json().catch(() => null);
      if (!appData?.user || !appData?.church) {
        clearSession();
        router.replace("/login");
        return;
      }

      const u = appData.user;
      const depts: Department[] = appData.departments || [];
      const departmentLinks: Array<{ department_id: string }> = appData.departmentLinks || [];

      const leadDeptIds = depts
        .filter((d) => (d.leader_ids || []).includes(u.id) || (d.co_leader_ids || []).includes(u.id))
        .map((d) => d.id);

      const memberDeptIds = departmentLinks.map((l) => l.department_id);

      // Um líder vê os ministérios que LIDERA e também os que PARTICIPA (é
      // membro/escalado). Antes via só os que liderava, então ministérios em
      // que era apenas membro (ex.: Produção) sumiam da lista, do início e das
      // escalas.
      const visibleDepartments =
        u.role === "admin"
          ? depts
          : u.role === "leader"
          ? depts.filter((d) => leadDeptIds.includes(d.id) || memberDeptIds.includes(d.id))
          : depts.filter((d) => memberDeptIds.includes(d.id));

      const permissionDeptIds =
        u.role === "admin" ? depts.map((d) => d.id) : u.role === "leader" ? leadDeptIds : memberDeptIds;

      setUser(u as User);
      setSessionState(s);
      setChurch(appData.church);
      setDepartments(visibleDepartments);
      setUserDeptIds(permissionDeptIds);
    } catch (err) {
      console.error("Erro ao carregar sessão:", err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  const logout = useCallback(() => {
    clearSession();
    void signOut(auth).catch((err) => console.error("Erro ao deslogar do Firebase:", err));
    router.replace("/login");
  }, [router]);

  const canDo = useCallback((action: Action, deptId?: string) => {
    if (!user) return false;
    return can(user.role, action, {
      departmentId: deptId,
      userDepartmentIds: userDeptIds,
    });
  }, [user, userDeptIds]);

  const {
    permission: pushPermission,
    pushEnabled,
    registering: registeringPush,
    requestPermissionAndEnable: enablePushNotifications,
    retryPushRegistration: retryPushNotifications,
  } = usePushNotifications(user?.id || null, toast);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function checkUnreadNotifications() {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, type, read, created_at")
        .eq("user_id", user.id)
        .eq("read", false)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) {
        console.error("Erro ao verificar novas notificações:", error);
        return;
      }

      if (cancelled) return;

      const unread = data || [];
      const unreadCount = unread.length;
      const latestUnread = unread[0] as { id: string; title: string; type: string } | undefined;
      setUnreadNotifications(unreadCount);

      if (unreadNotificationCountRef.current === null) {
        unreadNotificationCountRef.current = unreadCount;
        lastUnreadNotificationIdRef.current = latestUnread?.id || null;
        return;
      }

      const hasNewUnread =
        unreadCount > unreadNotificationCountRef.current &&
        latestUnread?.id &&
        latestUnread.id !== lastUnreadNotificationIdRef.current;

      unreadNotificationCountRef.current = unreadCount;
      lastUnreadNotificationIdRef.current = latestUnread?.id || null;

      if (hasNewUnread && latestUnread) {
        if (latestUnread.type === "info") {
          toast(`Nova mensagem: ${latestUnread.title}`);
        } else {
          toast(`Novo alerta: ${latestUnread.title}`);
        }
      }
    }

    void checkUnreadNotifications();
    interval = setInterval(() => {
      void checkUnreadNotifications();
    }, 10000);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [user, toast]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand to-brand-deep animate-pulse" />
          <span className="font-display text-lg text-ink-muted">Carregando...</span>
        </div>
      </div>
    );
  }

  if (!user || !session || !church) return null;

  return (
    <AppContext.Provider
      value={{
        user,
        session,
        church,
        departments,
        userDeptIds,
        unreadNotifications,
        setUnreadNotifications,
        pushPermission,
        pushEnabled,
        registeringPush,
        enablePushNotifications,
        retryPushNotifications,
        toast,
        canDo,
        refresh,
        logout,
      }}
    >
      {children}

      {/* Toast */}
      <div
        className="fixed bottom-7 left-1/2 z-50 pointer-events-none"
        style={{
          transform: `translateX(-50%) translateY(${toastMsg ? 0 : 80}px)`,
          opacity: toastMsg ? 1 : 0,
          transition: "all 0.4s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        <div className="bg-ink text-white px-6 py-3 rounded-full text-sm font-semibold shadow-lg whitespace-nowrap flex items-center gap-2">
          {toastMsg}
        </div>
      </div>
    </AppContext.Provider>
  );
}
