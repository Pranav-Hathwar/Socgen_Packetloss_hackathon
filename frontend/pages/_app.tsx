import "../styles/globals.css";
import type { AppProps } from "next/app";
import { useEffect } from "react";
import { Toaster } from "react-hot-toast";
import { Inter } from "next/font/google";
import { Layout } from "../components/Layout";
import { AuthProvider } from "../contexts/AuthContext";
import { createContext, useContext, useState, useCallback } from "react";

// Single project-wide typeface: Inter everywhere.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans", display: "swap" });

interface RefreshContextValue {
  refreshKey: number;
  triggerRefresh: () => void;
}
const RefreshContext = createContext<RefreshContextValue>({ refreshKey: 0, triggerRefresh: () => {} });
export const useRefresh = () => useContext(RefreshContext);

export default function App({ Component, pageProps }: AppProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const triggerRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Apply the font to <html> so even Tremor/Headless popovers (portaled to
  // <body>) inherit Inter instead of falling back to a default/monospace face.
  useEffect(() => {
    const root = document.documentElement;
    inter.variable.split(" ").forEach((c) => c && root.classList.add(c));
    root.style.setProperty("--font-display", "var(--font-sans)");
    root.style.setProperty("--font-mono", "var(--font-sans)");
    root.style.fontFamily = inter.style.fontFamily;
  }, []);

  return (
    <div className={`${inter.variable} font-sans`}>
      <AuthProvider>
        <RefreshContext.Provider value={{ refreshKey, triggerRefresh }}>
          <Layout>
            <Component {...pageProps} />
          </Layout>
          <Toaster
            position="top-right"
            toastOptions={{
              style: { borderRadius: "10px", background: "#16203A", color: "#fff", fontSize: "13px", padding: "12px 16px" },
            }}
          />
        </RefreshContext.Provider>
      </AuthProvider>
    </div>
  );
}
