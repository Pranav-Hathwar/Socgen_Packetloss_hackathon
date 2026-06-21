import "../styles/globals.css";
import type { AppProps } from "next/app";
import { CSSProperties } from "react";
import { Toaster } from "react-hot-toast";
import { Inter } from "next/font/google";
import { Layout } from "../components/Layout";
import { AuthProvider } from "../contexts/AuthContext";
import { createContext, useContext, useState, useCallback } from "react";

// Single project-wide typeface: Inter for every surface (headings, body, tables, inputs).
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans", display: "swap" });

interface RefreshContextValue {
  refreshKey: number;
  triggerRefresh: () => void;
}
const RefreshContext = createContext<RefreshContextValue>({ refreshKey: 0, triggerRefresh: () => {} });
export const useRefresh = () => useContext(RefreshContext);

const fontVars: CSSProperties = {
  ["--font-display" as string]: "var(--font-sans)",
  ["--font-mono" as string]: "var(--font-sans)",
};

export default function App({ Component, pageProps }: AppProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const triggerRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div className={`${inter.variable} font-sans`} style={fontVars}>
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
