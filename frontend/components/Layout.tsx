import Link from "next/link";
import { useRouter } from "next/router";
import { ReactNode, useState } from "react";
import { useEffect } from "react";
import {
  HomeIcon,
  BellAlertIcon,
  DocumentChartBarIcon,
  ChatBubbleLeftRightIcon,
  Bars3Icon,
  XMarkIcon,
  ArrowRightOnRectangleIcon,
  Cog6ToothIcon,
  UserPlusIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "../contexts/AuthContext";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: HomeIcon, roles: null },
  { label: "Alerts", href: "/alerts", icon: BellAlertIcon, roles: null },
  { label: "Report", href: "/report", icon: DocumentChartBarIcon, roles: null },
  { label: "Audit Chat", href: "/chat", icon: ChatBubbleLeftRightIcon, roles: null },
  { label: "Admin Panel", href: "/admin", icon: Cog6ToothIcon, roles: ["ADMIN"] },
  { label: "Create User", href: "/register", icon: UserPlusIcon, roles: ["ADMIN"] },
];

const ROLE_COLOR: Record<string, string> = {
  ADMIN: "bg-rag-red/15 text-rag-red",
  ANALYST: "bg-teal-100 text-teal-700",
  AUDITOR: "bg-slate-200 text-slate-600",
};

const PUBLIC_PATHS = ["/login"];

export function Layout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isPublic = PUBLIC_PATHS.includes(router.pathname);

  useEffect(() => {
    if (!loading && !user && !isPublic) router.replace("/login");
  }, [loading, user, isPublic, router]);

  if (isPublic) return <>{children}</>;
  if (loading || !user) return null;

  const isAuditor = user.role === "AUDITOR";

  return (
    <div className="app-shell flex h-screen overflow-hidden bg-paper">
      {/* Desktop Sidebar — ink ledger spine */}
      <aside className="hidden lg:flex flex-col w-64 bg-ink border-r border-ink shrink-0 print-hide">
        <div className="p-6 border-b border-white/10">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal flex items-center justify-center ring-1 ring-brass/40">
              <span className="text-white font-display font-bold text-sm">VL</span>
            </div>
            <div>
              <h1 className="text-lg font-display font-bold text-white tracking-tight">VendorLens</h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-medium">Risk Ledger</p>
            </div>
          </Link>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-1">
          {NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user.role)).map((item) => {
            const active = router.pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  active
                    ? "bg-teal/15 text-white shadow-sm ring-1 ring-teal/30"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <item.icon className={`w-5 h-5 ${active ? "text-teal-100" : "text-slate-400"}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-white/10 space-y-3">
          <div className="px-3 py-2 bg-white/5 rounded-lg flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-200 truncate">{user.email}</p>
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-0.5 ${ROLE_COLOR[user.role]}`}>
                {isAuditor && <EyeIcon className="w-2.5 h-2.5" />}
                {user.role}{isAuditor ? " · READ-ONLY" : ""}
              </span>
            </div>
            <button
              onClick={() => { logout(); router.replace("/login"); }}
              title="Log out"
              className="btn-liquid ml-2 p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <ArrowRightOnRectangleIcon className="w-4 h-4" />
            </button>
          </div>
          

        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-ink px-4 py-3 flex items-center justify-between print-hide">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal flex items-center justify-center">
            <span className="text-white font-display font-bold text-xs">VL</span>
          </div>
          <span className="text-base font-display font-bold text-white">VendorLens</span>
        </Link>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="btn-liquid p-2 rounded-lg hover:bg-white/10 text-white">
          {mobileOpen ? <XMarkIcon className="w-5 h-5" /> : <Bars3Icon className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Overlay Nav */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/40" onClick={() => setMobileOpen(false)}>
          <div className="absolute top-14 left-0 right-0 bg-ink shadow-xl animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <nav className="p-4 space-y-1">
              {NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user.role)).map((item) => {
                const active = router.pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`btn-liquid flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium ${
                      active ? "bg-teal/15 text-white" : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </Link>
                );
              })}
              <button
                onClick={() => { logout(); router.replace("/login"); }}
                className="btn-liquid w-full flex items-center gap-3 px-3 py-3 text-sm font-medium text-rag-red hover:bg-rag-red/10 rounded-lg"
              >
                <ArrowRightOnRectangleIcon className="w-5 h-5" />
                Log out
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="app-main flex-1 overflow-y-auto lg:pt-0 pt-14">
        <div className="app-content">{children}</div>
      </main>
    </div>
  );
}
