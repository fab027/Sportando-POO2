import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SportProvider } from "@/contexts/SportContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { FavoritesProvider } from "@/contexts/FavoritesContext";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import TeamsPage from "@/pages/TeamsPage";
import AthletesPage from "@/pages/AthletesPage";
import MatchesPage from "@/pages/MatchesPage";
import PredictionsPage from "@/pages/PredictionsPage";
import FavoritesPage from "@/pages/FavoritesPage";
import DataAggregatorPage from "@/pages/DataAggregatorPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <SportProvider>
            <FavoritesProvider>
              <Toaster />
              <Sonner />
              <Routes>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/equipes" element={<TeamsPage />} />
                  <Route path="/atletas" element={<AthletesPage />} />
                  <Route path="/partidas" element={<MatchesPage />} />
                  <Route path="/previsoes" element={<PredictionsPage />} />
                  <Route path="/favoritos" element={<FavoritesPage />} />
                  <Route path="/agregador" element={<DataAggregatorPage />} />
                </Route>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/registro" element={<RegisterPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </FavoritesProvider>
          </SportProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
