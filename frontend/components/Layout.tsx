import Link from "next/link";
import { useRouter } from "next/router";
import { ReactNode, useEffect, useState } from "react";
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
  ADMIN:   "bg-red-100 text-red-700",
  ANALYST: "bg-blue-100 text-blue-700",
  AUDITOR: "bg-gray-100 text-gray-600",
};

const PUBLIC_PATHS = ["/login"];

export function Layout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isPublic = PUBLIC_PATHS.includes(router.pathname);

  useEffect(() => {
    if (!loading && !user && !isPublic) {
      router.replace("/login");
    }
  }, [loading, user, isPublic, router]);

  if (isPublic) return <>{children}</>;
  if (loading || !user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200 shrink-0">
        <div className="p-6 border-b border-slate-100">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-200">
              <span className="text-white font-bold text-sm">VL</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">VendorLens</h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-medium">Risk Management</p>
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
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  active
                    ? "bg-indigo-50 text-indigo-700 shadow-sm"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <item.icon className={`w-5 h-5 ${active ? "text-indigo-600" : "text-slate-400"}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-slate-100 space-y-3">
          <div className="px-3 py-2 bg-slate-50 rounded-xl flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-700 truncate">{user.email}</p>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ROLE_COLOR[user.role]}`}>
                {user.role}
              </span>
            </div>
            <button
              onClick={() => { logout(); router.replace("/login"); }}
              title="Log out"
              className="ml-2 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <ArrowRightOnRectangleIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="px-3 py-3 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl">
            <p className="text-xs font-semibold text-indigo-700">Société Générale</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Hackathon 2024</p>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center">
            <span className="text-white font-bold text-xs">VL</span>
          </div>
          <span className="text-base font-bold text-slate-900">VendorLens</span>
        </Link>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-lg hover:bg-slate-100"
        >
          {mobileOpen ? <XMarkIcon className="w-5 h-5" /> : <Bars3Icon className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Overlay Nav */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/30" onClick={() => setMobileOpen(false)}>
          <div
            className="absolute top-14 left-0 right-0 bg-white border-b border-slate-200 shadow-xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <nav className="p-4 space-y-1">
              {NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user.role)).map((item) => {
                const active = router.pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium ${
                      active
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </Link>
                );
              })}
              <button
                onClick={() => { logout(); router.replace("/login"); }}
                className="w-full flex items-center gap-3 px-3 py-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl"
              >
                <ArrowRightOnRectangleIcon className="w-5 h-5" />
                Log out
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto lg:pt-0 pt-14">
        <div className="animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
