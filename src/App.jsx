import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import Hosts from "./pages/hosts";
import Keys from "./pages/keychain";
import SftpTab from "./pages/sftp-tab";
import AddHosts from "./pages/add-hosts";
import Logs from "./pages/logs";
import ExportData from "./pages/export-data";
import ImportData from "./pages/import-data";
import WipeData from "./pages/wipe-data";
import Settings from "./pages/settings";
import SupabasePassword from "./pages/supabase-password";
import MasterPassword from "./pages/master-password";
import Login from "./pages/login";
import KeychainUnlockScreen from "./components/keychain-unlock-screen";
import { SecurityProvider, useSecurity } from "./provider/security-provider";
import { TerminalProvider } from "./provider/terminal-provider";
import TerminalView from "./components/terminal-view";

function AuthGuard({ children }) {
  const { unlocked, needsSetup, keychainFailed } = useSecurity();

  if (needsSetup) {
    return <Navigate to="/dashboard/login" replace />;
  }

  if (keychainFailed || !unlocked) {
    return <KeychainUnlockScreen />;
  }

  return children;
}

function SetupGuard({ children }) {
  const { needsSetup } = useSecurity();

  if (!needsSetup) {
    return <Navigate to="/dashboard/hosts" replace />;
  }

  return children;
}

function DefaultRedirect() {
  const { needsSetup } = useSecurity();
  return (
    <Navigate
      to={needsSetup ? "/dashboard/login" : "/dashboard/hosts"}
      replace
    />
  );
}

export default function App() {
  return (
    <HashRouter>
      <SecurityProvider>
        <TerminalProvider>
          <Routes>
            <Route
              path="/dashboard/hosts"
              element={
                <AuthGuard>
                  <Hosts />
                </AuthGuard>
              }
            />
            <Route
              path="/dashboard/keys"
              element={
                <AuthGuard>
                  <Keys />
                </AuthGuard>
              }
            />
            <Route
              path="/dashboard/sftp"
              element={
                <AuthGuard>
                  <SftpTab />
                </AuthGuard>
              }
            />
            <Route
              path="/dashboard/add-hosts"
              element={
                <AuthGuard>
                  <AddHosts />
                </AuthGuard>
              }
            />
            <Route
              path="/dashboard/logs"
              element={
                <AuthGuard>
                  <Logs />
                </AuthGuard>
              }
            />
            <Route
              path="/dashboard/export-data"
              element={
                <AuthGuard>
                  <ExportData />
                </AuthGuard>
              }
            />
            <Route
              path="/dashboard/import-data"
              element={
                <AuthGuard>
                  <ImportData />
                </AuthGuard>
              }
            />
            <Route
              path="/dashboard/wipe-data"
              element={
                <AuthGuard>
                  <WipeData />
                </AuthGuard>
              }
            />
            <Route
              path="/dashboard/settings"
              element={
                <AuthGuard>
                  <Settings />
                </AuthGuard>
              }
            />
            <Route
              path="/dashboard/supabase-password"
              element={
                <AuthGuard>
                  <SupabasePassword />
                </AuthGuard>
              }
            />
            <Route
              path="/dashboard/master-password"
              element={
                <AuthGuard>
                  <MasterPassword />
                </AuthGuard>
              }
            />
            <Route
              path="/dashboard/login"
              element={
                <SetupGuard>
                  <Login />
                </SetupGuard>
              }
            />
            <Route path="*" element={<DefaultRedirect />} />
          </Routes>
          <TerminalView />
        </TerminalProvider>
      </SecurityProvider>
    </HashRouter>
  );
}
