'use client';

import { useState } from 'react';
import { Plus, Trash2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useHermes } from './HermesContext';
import { HermesMessageList } from './HermesMessageList';
import { HermesInput } from './HermesInput';

interface Props {
  embedded?: boolean; // true = inside modal (smaller paddings)
}

export function HermesChatShell({ embedded = false }: Props) {
  const { conversations, activeId, setActiveId, startNewConversation, deleteConversation, memberName } = useHermes();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className={`hermes-shell ${embedded ? 'is-embedded' : ''} ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <aside className="hermes-sidebar" aria-label="Konversationen">
        <div className="hermes-sidebar-head">
          <button type="button" className="hermes-sidebar-new" onClick={() => void startNewConversation()}>
            <Plus size={14} aria-hidden /> Neue Konversation
          </button>
        </div>
        <div className="hermes-sidebar-list">
          {conversations.length === 0 && <p className="hermes-sidebar-empty">Noch keine Konversationen.</p>}
          {conversations.map((c) => (
            <div key={c.id} className={`hermes-sidebar-row ${activeId === c.id ? 'is-active' : ''}`}>
              <button
                type="button"
                className="hermes-sidebar-item"
                onClick={() => setActiveId(c.id)}
                title={c.title}
              >
                {c.title}
              </button>
              <button
                type="button"
                className="hermes-sidebar-del"
                onClick={() => void deleteConversation(c.id)}
                aria-label="Löschen"
                title="Löschen"
              >
                <Trash2 size={12} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      </aside>
      <section className="hermes-main">
        <div className="hermes-main-head">
          <button
            type="button"
            className="hermes-sidebar-toggle"
            onClick={() => setSidebarOpen((s) => !s)}
            aria-label={sidebarOpen ? 'Sidebar einklappen' : 'Sidebar ausklappen'}
          >
            {sidebarOpen ? <PanelLeftClose size={15} aria-hidden /> : <PanelLeftOpen size={15} aria-hidden />}
          </button>
          <span className="hermes-main-title">
            Hermes <span className="hermes-main-as">{memberName ? `· als ${memberName}` : ''}</span>
          </span>
          <div className="hermes-main-spacer" />
        </div>
        <div className="hermes-main-body">
          <HermesMessageList />
        </div>
        <div className="hermes-main-foot">
          <HermesInput variant="shell" placeholder="Frag Hermes …" autoFocus={embedded} />
        </div>
      </section>
    </div>
  );
}
