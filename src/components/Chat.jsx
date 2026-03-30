import { marked } from "marked";
import DOMPurify from "dompurify";
import { useEffect } from "react";

function render(text) {
  return DOMPurify.sanitize(marked.parse(text));
}

export default function Chat({ messages }) {
  useEffect(() => {
    if (window.MathJax) window.MathJax.typeset();
  }, [messages]);

  return (
    <div className="max-w-3xl mx-auto space-y-10 mb-20">
      {messages.map((msg, i) => (
        <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
          {msg.role === "user" ? (
            <div className="bg-[#1A1A1A] border border-neutral-800 rounded-2xl px-4 py-2 max-w-[85%] text-neutral-200">
              {msg.content}
            </div>
          ) : (
            <div className="w-full text-neutral-300 leading-relaxed text-[16px]">
              {msg.content.length > 0 ? (
                <div className="markdown" dangerouslySetInnerHTML={{ __html: render(msg.content) }} />
              ) : (
                <span className="flex gap-1 items-center py-2">
                  <span className="w-1.5 h-1.5 bg-neutral-600 rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-neutral-600 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-1.5 h-1.5 bg-neutral-600 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}