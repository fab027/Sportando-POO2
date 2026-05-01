import React from "react";
import { useAuth } from "@/contexts/AuthContext";

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: ("analista" | "apostador" | "administrador")[];
}

const RoleGuard: React.FC<RoleGuardProps> = ({ children, allowedRoles }) => {
  const { profile } = useAuth();

  if (!profile || !allowedRoles.includes(profile.role)) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Acesso negado. Você não tem permissão para acessar esta página.
      </div>
    );
  }

  return <>{children}</>;
};

export default RoleGuard;
