export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-bold text-[var(--foreground)]">
        You are offline
      </h1>
      <p className="text-[var(--text-muted)]">
        LockIn Weather cannot reach the network right now. Reconnect and retry.
      </p>
    </main>
  );
}
