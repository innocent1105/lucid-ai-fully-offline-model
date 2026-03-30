import { useEffect, useState, useRef } from "react";
import { db } from "./db";
import { useLiveQuery } from "dexie-react-hooks";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, Plus, FileCode, X, Copy, Cpu, Square, ArrowRight, Terminal, Download } from "lucide-react";

// Syntax Highlighter
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

import Chat from "./components/Chat";
import Progress from "./components/Progress";

const IS_WEBGPU_AVAILABLE = !!navigator.gpu;
const EXAMPLES = [
  "Give me some tips to improve my time management skills.",
  "What is the difference between AI and ML?",
  "Write python code to compute the nth fibonacci number.",
];

function App() {
  const worker = useRef(null);
  const textareaRef = useRef(null);
  const chatContainerRef = useRef(null);

  // UI State
  const [status, setStatus] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [progressItems, setProgressItems] = useState([]);
  const [isRunning, setIsRunning] = useState(false);

  // Canvas State
  const [files, setFiles] = useState([]); 
  const [activeFileId, setActiveFileId] = useState(null);

  // Chat Data
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [tps, setTps] = useState(null);

  const history = useLiveQuery(() => 
    db.conversations.orderBy('timestamp').reverse().toArray()
  ) || [];



useEffect(() => {
  const initStorage = async () => {
    // 1. Request Notification permission first
    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      // 2. Now request persistence
      if (navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persist();
        console.log(`Persisted storage granted: ${isPersisted}`);
      }
    }
  };

  initStorage();
}, []);
  // --- Handlers ---

  const downloadFile = (file) => {
    const blob = new Blob([file.code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 1. Reload Function
  const reloadApp = () => {
    // Note: It's actually location.reload(), navigator doesn't have a reload method
    window.location.reload(); 
  };

  // 2. Copy Snippet Function
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("Snippet copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy: ", err);
    }
  };

  const deleteChat = async (e, id) => {
    e.stopPropagation();
    await db.conversations.delete(id);
    if (currentChatId === id) createNewChat();
  };

  const smoothScrollToBottom = () => {
    const chatContainer = document.getElementById('chat-box');
    chatContainer.scrollTo({
      top: chatContainer.scrollHeight,
      behavior: 'smooth'
    });
  };

  const createNewChat = () => {
    setMessages([]);
    setCurrentChatId(null);
    setFiles([]);
    setActiveFileId(null);
    smoothScrollToBottom();
    if (status !== "loading") setStatus("ready");
  };

  const loadChat = async (id) => {
    const chat = await db.conversations.get(id);
    if (chat) {
      setMessages(chat.messages);
      setCurrentChatId(id);
      setStatus("ready");
      syncFilesFromHistory(chat.messages, true); // Force focus on last file when loading
    }
  };

  const syncFilesFromHistory = (msgs, forceFocus = false) => {
    const allBlocks = [];
    msgs.forEach((msg, msgIdx) => {
      if (msg.role === 'assistant') {
        const blocks = msg.content.match(/```[\s\S]*?```/g) || [];
        blocks.forEach((block, blockIdx) => {
          const match = block.match(/```(\w+)?\n([\s\S]*?)```/);
          const lang = match ? (match[1] || 'js') : 'js';
          const code = match ? match[2].trim() : block.replace(/```/g, "").trim();
          const fileId = `${msgIdx}-${blockIdx}`;
          allBlocks.push({
            id: fileId,
            name: `snippet_${allBlocks.length + 1}.${lang === 'python' ? 'py' : lang === 'javascript' ? 'js' : lang}`,
            lang,
            code
          });
        });
      }
    });

    // AUTO-FOCUS LOGIC: If a new file was added, focus it
    if (allBlocks.length > files.length || forceFocus) {
      const lastFile = allBlocks[allBlocks.length - 1];
      if (lastFile) setActiveFileId(lastFile.id);
    }

    setFiles(allBlocks);
  };

  async function onEnter(message) {
    if (!message.trim() || isRunning) return;
    const userMsg = { role: "user", content: message };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsRunning(true);
    setInput("");

    smoothScrollToBottom();

    if (!currentChatId) {
      const id = await db.conversations.add({
        title: message.substring(0, 35) + (message.length > 35 ? "..." : ""),
        timestamp: Date.now(),
        messages: newMessages
      });
      setCurrentChatId(id);
    } else {
      await db.conversations.update(currentChatId, { messages: newMessages, timestamp: Date.now() });
    }
  }

  // --- Effects ---

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  useEffect(() => {
    if (!worker.current) {
      worker.current = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    }

    const onMessageReceived = (e) => {
      switch (e.data.status) {
        case "loading": setStatus("loading"); setLoadingMessage(e.data.data); break;
        case "initiate": setProgressItems((prev) => [...prev, e.data]); break;
        case "progress":
          setProgressItems((prev) => prev.map((item) => item.file === e.data.file ? { ...item, ...e.data } : item));
          break;
        case "done": setProgressItems((prev) => prev.filter((item) => item.file !== e.data.file)); break;
        case "ready": setStatus("ready"); break;
        case "start": setMessages((prev) => [...prev, { role: "assistant", content: "" }]); break;
        case "update":
          setTps(e.data.tps);
          setMessages((prev) => {
            const cloned = [...prev];
            const last = cloned[cloned.length - 1];
            cloned[cloned.length - 1] = { ...last, content: last.content + e.data.output };
            return cloned;
          });
          break;
        case "complete": setIsRunning(false); break;
      }
    };

    worker.current.addEventListener("message", onMessageReceived);
    return () => worker.current.removeEventListener("message", onMessageReceived);
  }, []);

  useEffect(() => {
    if (messages.length === 0 || messages.at(-1).role === "assistant") return;
    worker.current.postMessage({ type: "generate", data: messages });
    smoothScrollToBottom();

  }, [messages]);

  // Sync files when generation completes
  useEffect(() => {
    if (!isRunning) syncFilesFromHistory(messages);
  }, [isRunning, messages]);

  const activeFile = files.find(f => f.id === activeFileId);

  





  
  return (
    <div className="flex h-screen bg-[#0A0A0A] text-neutral-200 overflow-hidden font-sans">
      
      {/* SIDEBAR */}
      <aside className="w-[22%] border-r border-neutral-800 flex flex-col p-4 bg-[#0F0F0F] shrink-0">
        <div className=" flex w-full gap-2 justify-between ">
          <div className="flex items-center gap-2 mb-8 px-2 font-bold text-xl tracking-tighter text-white">
           Lucid AI
          </div>
          <div className="top-controls">
            <button onclick={() => location.reload()} class="btn-reload text-xs text-gray-400 "> Reload</button>
          </div>
        
        </div>
        
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={createNewChat} 
          className="mb-6 py-2.5 w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600/10 border border-indigo-500/20 hover:bg-indigo-600/20 transition text-sm font-semibold text-indigo-400"
        >
          <Plus size={18} /> New Chat
        </motion.button>

        <div className="flex-1 overflow-y-auto no-scrollbar space-y-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-600 mb-4 px-2 font-bold">History</p>
          <AnimatePresence mode="popLayout">
            {history.map((chat) => (
              <motion.div 
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                key={chat.id} 
                onClick={() => {
                  if(isRunning) return;
                  worker.current.postMessage({ type: "interrupt" })
                  loadChat(chat.id);
                }} 
                className={`group relative px-3 py-2.5 text-sm rounded-xl cursor-pointer truncate transition-all ${
                  currentChatId === chat.id ? 'bg-white/5 text-white border border-white/10' : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-300'
                }`}
              >
                {chat.title}
                <button 
                  onClick={(e) => deleteChat(e, chat.id)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 rounded-lg transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </aside>

      {/* MAIN VIEWPORT */}
      <main className="flex-1 flex flex-col relative h-full items-center min-w-0">
        <div id="chat-box" ref={chatContainerRef} className="w-full flex-1 overflow-y-auto no-scrollbar p-6">
          <AnimatePresence>
            {messages.length === 0 && status !== "loading" && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="h-full flex flex-col items-center justify-center text-center"
              >
                <h1 className="text-6xl font-bold mb-4 tracking-tighter text-white">Hello, I'm <span className="text-indigo-500">Lucid.</span></h1>
                <p className="text-neutral-500 mb-4text-sm font-medium">An Offline Language Model.</p>
                
                {status === null ? (
                  <>
                    <p className="text-neutral-500 mt-0 mb-8 text-sm font-medium">
                      Load the model to chat with Lucid and ask it anything.<br></br> This will download the model weights (~350MB) and run everything locally.
                    </p>
                    <button onClick={() => { worker.current.postMessage({ type: "load" }); setStatus("loading"); }} className="px-8 py-3 bg-indigo-600 rounded-2xl hover:bg-indigo-500 transition shadow-xl shadow-indigo-500/20 font-bold text-white">Load AI Model</button>
                  </>
                ) : (
                  <div className="flex flex-wrap justify-center mt-4 gap-3 max-w-2xl">
                    {EXAMPLES.map((ex, i) => (
                      <button key={i} onClick={() => onEnter(ex)} className="px-4 py-2 bg-white/5 border border-white/5 rounded-full text-xs hover:border-white/20 transition text-neutral-400">{ex}</button>
                    ))}
                  </div>
                )}

              </motion.div>
            )}
          </AnimatePresence>

          {status === "loading" && (
            <div className="h-full flex flex-col items-center justify-center w-full max-w-md mx-auto">
              <p className="mb-6 text-xs uppercase tracking-widest text-neutral-500">{loadingMessage}</p>
              {progressItems.map((item, i) => <Progress key={i} {...item} />)}
            </div>
          )}

          {messages.length > 0 && <Chat messages={messages} />}
        </div>

        {/* INPUT AREA */}
        <div className="w-full max-w-3xl px-6 pb-8">
          <div className={`bg-[#141414]  border border-white/5 rounded-[28px] p-4 shadow-2xl focus-within:border-white/10 transition-all ${isRunning ? 'glowing-container border-0' : 'ring-0'}`}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onEnter(input); } }}
              placeholder="Ask Lucid anything..."
              className="w-full outline-none bg-transparent border-none focus:ring-0 resize-none text-base placeholder-neutral-700 no-scrollbar"
              rows={1}
            />
            <div className="flex items-center justify-between mt-4">
               <div className="flex gap-2">
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 text-[10px] text-neutral-500 font-bold uppercase tracking-widest border border-white/5">
                    <Cpu size={10} /> Offline
                  </span>
                  {tps && <span className="text-[10px] text-neutral-600 font-mono flex items-center">{tps.toFixed(1)} t/s</span>}
               </div>
               {isRunning ? (
                 <button onClick={() => worker.current.postMessage({ type: "interrupt" })} className="bg-white/10 p-2 rounded-full text-white"><Square size={18} fill="currentColor" /></button>
               ) : (
                <button onClick={() => onEnter(input)} 
                  className="bg-white text-black p-2 rounded-full active:scale-95 transition ">
                  <ArrowRight size={18} strokeWidth={3} />
                </button>
               )}
            </div>
          </div>
        </div>
      </main>

      {/* CODE CANVAS */}
      <AnimatePresence>
        {activeFileId && files.length > 0 && (
          <motion.aside 
            initial={{ x: 600 }}
            animate={{ x: 0 }}
            exit={{ x: 600 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="hidden lg:flex w-[550px] border-l border-neutral-800 bg-[#0A0A0A] flex-col shrink-0"
          >
            <div className="flex bg-[#0F0F0F] border-b border-white/5 overflow-x-auto no-scrollbar">
              {files.map((file) => (
                <button
                  key={file.id}
                  onClick={() => setActiveFileId(file.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-[11px] font-mono border-r border-white/5 transition min-w-[150px] ${
                    activeFileId === file.id ? 'bg-[#0A0A0A] text-indigo-400 border-b border-b-indigo-500' : 'text-neutral-600 hover:text-neutral-300'
                  }`}
                >
                  <FileCode size={14} /> {file.name}
                </button>
              ))}
              <button onClick={() => setActiveFileId(null)} className="ml-auto px-4 text-neutral-600 hover:text-white transition"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-auto bg-[#050505]">
              <SyntaxHighlighter
                language={activeFile?.lang || 'js'}
                style={vscDarkPlus}
                customStyle={{ margin: 0, padding: '32px', backgroundColor: 'transparent', fontSize: '13px', lineHeight: '1.8' }}
              >
                {activeFile?.code || ""}
              </SyntaxHighlighter>
            </div>

            <div className="p-4 bg-[#0F0F0F] border-t border-white/5 flex gap-3">
              <button 
                onClick={() => navigator.clipboard.writeText(activeFile?.code)}
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2"
              >
                <Copy size={14} /> Copy
              </button>
              <button 
                onClick={() => downloadFile(activeFile)}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
              >
                <Download size={14} /> Download
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;