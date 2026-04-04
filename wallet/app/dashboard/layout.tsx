import { BottomNav } from "@/components/BottomNav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col flex-1">
      <div className="flex-1 safe-bottom">{children}</div>
      <BottomNav />
    </div>
  );
}
