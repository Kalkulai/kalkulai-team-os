import { HermesChatShell } from '@/components/hermes/HermesChatShell';

export const dynamic = 'force-dynamic';

export default function ChatPage() {
  return (
    <div className="chat-page glass">
      <HermesChatShell />
    </div>
  );
}
