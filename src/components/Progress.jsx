function formatBytes(size) {
  if (!size || isNaN(size)) return "0B";
  const i = size === 0 ? 0 : Math.floor(Math.log(size) / Math.log(1024));
  return (
    +(size / Math.pow(1024, i)).toFixed(2) * 1 +
    ["B", "kB", "MB", "GB", "TB"][i]
  );
}

export default function Progress({ file, progress, total }) {
  // Ensure percentage is always a valid number before calling .toFixed()
  const percentage = typeof progress === 'number' ? progress : 0;

  return (
    <div className="w-full bg-neutral-800 h-6 rounded-md overflow-hidden mb-2 relative">
      <div 
        className="bg-indigo-600 h-full transition-all duration-300" 
        style={{ width: `${percentage}%` }} 
      />
      <span className="absolute inset-0 flex items-center px-3 text-[10px] font-mono uppercase text-white truncate">
        {file} {percentage.toFixed(0)}% {total ? ` of ${formatBytes(total)}` : ''}
      </span>
    </div>
  );
}