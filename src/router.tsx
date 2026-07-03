import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { ErrorState, classifyError } from "@/components/status/ErrorState";
import { useRouter } from "@tanstack/react-router";

function DefaultError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <ErrorState
      fullscreen
      kind={classifyError(error)}
      onRetry={() => {
        router.invalidate();
        reset();
      }}
    />
  );
}

function DefaultNotFound() {
  return <ErrorState fullscreen kind="notfound" />;
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          // Don't retry auth/permission/validation errors.
          const kind = classifyError(error);
          if (kind === "forbidden" || kind === "session" || kind === "notfound") return false;
          return failureCount < 2;
        },
        staleTime: 30_000,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultError,
    defaultNotFoundComponent: DefaultNotFound,
  });

  return router;
};
