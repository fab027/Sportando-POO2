import { Outlet, Navigate } from "react-router-dom";
import { useState } from "react";
import AppSidebar from "./AppSidebar";
import { useSport } from "@/contexts/SportContext";
import { useAuth } from "@/contexts/AuthContext";
import BrandLogo from "./BrandLogo";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Loader2, Menu } from "lucide-react";

const AppLayout = () => {
  const { sportClass } = useSport();
  const { isAuthenticated, loading } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
    <div className={`${sportClass} flex h-[100svh] overflow-hidden bg-background`}>
      <AppSidebar className="hidden md:flex" />
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          className="w-[min(20rem,calc(100vw-2rem))] border-r border-white/10 bg-sidebar p-0 text-sidebar-foreground [&>button]:text-white"
        >
          <AppSidebar className="!w-full border-r-0" onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-3 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <BrandLogo className="h-8 w-8 rounded-lg" />
            <span className="font-display text-base font-bold text-foreground">Sportando</span>
          </div>
          <div className="h-10 w-10" aria-hidden="true" />
        </header>
        <div className="mx-auto max-w-7xl px-3 py-4 animate-fade-in sm:px-4 sm:py-5 lg:px-6 lg:py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
