import { HermesFrame } from '@/components/hermes/HermesFrame';

export const dynamic = 'force-dynamic';

export default function ChatPage() {
  return (
    <div className="chat-page">
      <HermesFrame className="chat-page-frame" />
    </div>
  );
}
