import "../styles/globals.css";
import type { AppProps } from "next/app";
import { Toaster } from "react-hot-toast";
import { Layout } from "../components/Layout";
import { AuthProvider } from "../contexts/AuthContext";
import { createContext, useContext, useState, useCallback } from "react";

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
    <AuthProvider>
      <RefreshContext.Provider value={{ refreshKey, triggerRefresh }}>
        <Layout>
          <Component {...pageProps} />
        </Layout>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              borderRadius: "12px",
              background: "#1e293b",
              color: "#fff",
              fontSize: "13px",
              padding: "12px 16px",
            },
          }}
        />
      </RefreshContext.Provider>
    </AuthProvider>
  );
}
