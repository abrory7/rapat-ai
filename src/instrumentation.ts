export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { recoverInterruptedSessions } = await import(
    './lib/orchestrator/recovery'
  );
  await recoverInterruptedSessions();
}
