const STYLES: Record<string, string> = {
  completed: "bg-green/10 text-green",
  succeeded: "bg-green/10 text-green",
  funded: "bg-green/10 text-green",
  pending: "bg-orange/10 text-orange",
  processing: "bg-accent/10 text-accent",
  signing: "bg-accent/10 text-accent",
  failed: "bg-red/10 text-red",
  expired: "bg-tertiary/10 text-tertiary",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? "bg-tertiary/10 text-tertiary";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {status}
    </span>
  );
}
