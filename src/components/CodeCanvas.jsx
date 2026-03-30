export default function CodeCanvas({ code, onClose }) {
  return (
    <div className="flex flex-col h-full bg-[#0D0D0D]">
      <div className="flex items-center gap-2 p-4 border-b border-white/5">
        <div className="w-3 h-3 rounded-full bg-red-500/20" />
        <div className="w-3 h-3 rounded-full bg-yellow-500/20" />
        <div className="w-3 h-3 rounded-full bg-green-500/20" />
        <span className="ml-4 text-[10px] text-neutral-500 font-mono tracking-tighter">PREVIEW.PY</span>
      </div>
      <div className="flex-1 p-8 overflow-auto">
        <div className="relative group">
           <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
           <pre className="relative bg-[#050505] p-6 rounded-lg border border-white/5 font-mono text-indigo-100/90 leading-7">
             <code>{code}</code>
           </pre>
        </div>
      </div>
    </div>
  );
}