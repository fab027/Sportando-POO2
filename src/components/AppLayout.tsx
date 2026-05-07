import { Outlet, Navigate } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import { useSport } from "@/contexts/SportContext";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

const AppLayout = () => {
  const { sportClass } = useSport();
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className={`${sportClass} flex h-screen overflow-hidden bg-background`}>
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-6 py-6 animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
