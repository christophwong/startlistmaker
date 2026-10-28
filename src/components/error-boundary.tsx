import { Component, type ReactNode } from "react";
import { APP_VERSION, contactUrl } from "~/app-info";
import { LogoMark } from "~/components/shell";
import { Button, ButtonLink } from "~/components/ui";
import { clearStorage, downloadProject, loadState } from "~/state/persist";

/**
 * Catches an error while drawing the page, so the user sees a way out instead
 * of a blank page. Work is saved to storage after every change that drew
 * fine, so a reload usually comes back to just before the error.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <CrashScreen error={error} />;
  }
}

function CrashScreen({ error }: { error: Error }) {
  const saved = loadState();
  const startOver = () => {
    if (!confirm("Clear all data and start over? Save the project first if you want to keep it.")) return;
    clearStorage();
    location.reload();
  };
  return (
    <div className="min-h-screen bg-page px-4 py-10 text-ink">
      <div role="alert" className="mx-auto max-w-lg space-y-4">
        <LogoMark />
        <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
        <p className="text-ink-2">
          The page hit an error. Your work up to your last change is usually kept: reloading should bring it back.
          {saved && " To be safe, save it as a project file first."}
        </p>
        <div className="flex flex-wrap gap-2">
          {saved && <Button onClick={() => downloadProject(saved)}>Save project</Button>}
          <Button variant="secondary" onClick={() => location.reload()}>
            Reload
          </Button>
          <ButtonLink variant="secondary" href={contactUrl("Start List Maker: something went wrong", `Error: ${error.message}`)}>
            Report this problem
          </ButtonLink>
        </div>
        <p className="text-sm text-ink-2">
          If it happens again after reloading,{" "}
          <button type="button" className="font-medium text-err-fg underline" onClick={startOver}>
            clear all data and start over
          </button>
          .
        </p>
        <details className="text-xs text-muted">
          <summary>Details</summary>
          <p className="mt-1 break-words">{error.message}</p>
          <p>Version {APP_VERSION}</p>
        </details>
      </div>
    </div>
  );
}
