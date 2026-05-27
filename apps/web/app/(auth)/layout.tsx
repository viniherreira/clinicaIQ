export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="main-content"
      className="flex min-h-screen items-center justify-center bg-background"
    >
      {children}
    </main>
  );
}
