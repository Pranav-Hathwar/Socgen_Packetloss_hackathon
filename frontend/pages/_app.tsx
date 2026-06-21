import "../styles/globals.css";
import type { AppProps } from "next/app";
import { Toaster } from "react-hot-toast";
import { Space_Grotesk, Inter, IBM_Plex_Mono } from "next/font/google";
import { Layout } from "../components/Layout";
import { AuthProvider } from "../contexts/AuthContext";
import { createContext, useContext, useState, useCallback } from "react";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display", display: "swap" });
const sans = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono", display: "swap" });

interface RefreshContextValue {
  refreshKey: number;
  triggerRefresh: () => void;
}
const RefreshContext = createContext<RefreshContextValue>({ refreshKey: 0, triggerRefresh: () => {} });
export const useRefresh = () => useContext(RefreshContext);

export default function App({ Component, pageProps }: AppProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const triggerRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div className={`${display.variable} ${sans.variable} ${mono.variable} font-sans`}>
      <AuthProvider>
        <RefreshContext.Provider value={{ refreshKey, triggerRefresh }}>
          <Layout>
            <Component {...pageProps} />
          </Layout>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                borderRadius: "10px",
                background: "#16203A",
                color: "#fff",
                fontSize: "13px",
                padding: "12px 16px",
              },
            }}
          />
        </RefreshContext.Provider>
      </AuthProvider>
    </div>
  );
}
