import React, { useEffect, useState } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import InboxList from './components/InboxList'
import MessageView from './components/MessageView'
import ComposeModal from './components/ComposeModal'

export default function App(){
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [composeOpen, setComposeOpen] = useState(false);

  useEffect(()=>{
    // TODO: 替换为项目后端 API 调用（这是占位 fetch）
    async function load(){
      try {
        const res = await fetch('/api/blocks'); // 如果后端路由不同，请替换
        if(res.ok){
          const data = await res.json();
          const list = Array.isArray(data) ? data : data.blocks || [];
          setMessages(list);
          if(list.length && !selected) setSelected(list[0]);
        }
      } catch(e){
        console.warn('无法加载消息（placeholder）', e);
      }
    }
    load();
  },[]);

  function handleSend(newMsg){
    // TODO: POST 到后端；这里先本地插入
    setMessages(prev => [newMsg, ...prev]);
    setSelected(newMsg);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-slate-100">
      <Header onCompose={()=>setComposeOpen(true)} />
      <div className="max-w-7xl mx-auto p-4 grid grid-cols-[260px_1fr] gap-6">
        <Sidebar />
        <div className="grid grid-cols-[360px_1fr] gap-6">
          <div className="card-glass rounded-2xl p-4 shadow-card overflow-hidden">
            <InboxList messages={messages} selectedId={selected?.id} onSelect={setSelected} />
          </div>
          <div className="card-glass rounded-2xl p-6 shadow-card overflow-auto">
            <MessageView message={selected} />
          </div>
        </div>
      </div>

      {composeOpen && <ComposeModal onClose={()=>setComposeOpen(false)} onSend={(m)=>{ handleSend(m); setComposeOpen(false); }} />}
    </div>
  )
}
