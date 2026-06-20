import MobileMenuButton from "@/components/MobileMenuButton";

export default function ChatHome() {
  return (
    <div className="flex flex-col h-full">
      <header className="md:hidden flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <MobileMenuButton />
        <span className="font-display font-semibold">PriChat</span>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <div className="h-12 w-12 rounded-full bg-accentMuted flex items-center justify-center mb-4">
          <span className="text-accent text-xl font-display">#</span>
        </div>
        <h2 className="font-display text-xl font-semibold mb-1">Pick a room to start talking</h2>
        <p className="text-textSecondary text-sm max-w-xs">
          Choose a room from the sidebar, or create a new one to get the conversation going.
        </p>
      </div>
    </div>
  );
}
