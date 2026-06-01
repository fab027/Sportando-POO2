import React from "react";

type AppErrorBoundaryState = {
  error: Error | null;
};

class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[app] render error", error);
  }

  private reload = () => {
    window.location.reload();
  };

  private clearCacheAndReload = () => {
    Object.keys(localStorage)
      .filter((key) => key.startsWith("sportando.cache."))
      .forEach((key) => localStorage.removeItem(key));
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
          <p className="text-sm font-bold text-foreground">Nao foi possivel carregar o Sportando</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Um dado local ou modulo da pagina falhou durante a renderizacao. Recarregue a pagina ou limpe apenas o cache de dados do app.
          </p>
          <p className="mt-3 rounded-lg bg-secondary p-2 text-xs text-muted-foreground">
            {this.state.error.message}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={this.reload}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              Recarregar
            </button>
            <button
              type="button"
              onClick={this.clearCacheAndReload}
              className="rounded-lg bg-sport px-3 py-2 text-sm font-medium text-sport-foreground transition-opacity hover:opacity-90"
            >
              Limpar cache e recarregar
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
