import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';

interface FormattedTextProps {
  text: string;
  className?: string;
}

const FormattedText: React.FC<FormattedTextProps> = ({ text, className = "" }) => {
  if (!text) return null;

  return (
    <div className={`formatted-text ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
        components={{
          h1: ({node, ...props}) => <h1 className="text-2xl font-bold text-indigo-900 mt-6 mb-4 border-b border-indigo-100 pb-2" {...props} />,
          h2: ({node, ...props}) => <h2 className="text-xl font-bold text-slate-800 mt-5 mb-3" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-lg font-semibold text-slate-700 mt-4 mb-2" {...props} />,
          
          // Enhanced paragraph handling
          p: ({node, children, ...props}) => {
             // With rehype-raw, <svg> tags might be rendered directly as nodes, 
             // but if they come through as text or weird structures, we keep the fallback.
             return <p className="mb-3 leading-relaxed text-slate-700" {...props}>{children}</p>;
          },
          
          ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4 space-y-1 text-slate-700" {...props} />,
          ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-4 space-y-1 text-slate-700" {...props} />,
          li: ({node, ...props}) => <li className="pl-1" {...props} />,
          blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-indigo-200 pl-4 italic my-4 text-slate-600 bg-slate-50 py-2 rounded-r" {...props} />,
          
          // Table Styling
          table: ({node, ...props}) => <div className="overflow-x-auto my-4"><table className="w-full border-collapse border border-slate-300 text-sm" {...props} /></div>,
          thead: ({node, ...props}) => <thead className="bg-slate-100" {...props} />,
          tbody: ({node, ...props}) => <tbody {...props} />,
          tr: ({node, ...props}) => <tr className="border-b border-slate-200" {...props} />,
          th: ({node, ...props}) => <th className="border border-slate-300 px-4 py-2 text-left font-bold text-slate-700" {...props} />,
          td: ({node, ...props}) => <td className="border border-slate-300 px-4 py-2 text-slate-700 align-top" {...props} />,
          strong: ({node, ...props}) => <strong className="font-bold text-slate-900" {...props} />,
          
          // Explicitly handle SVG tags if rehype-raw passes them as custom components (unlikely in basic setup but good practice)
          // or if they are embedded. Note: react-markdown+rehype-raw converts HTML to React elements.
          // We wrap them in a container for styling if possible.
          div: ({node, className, ...props}: any) => {
             // This captures divs that might be wrapping SVGs if AI generates them
             return <div className={className} {...props} />;
          }
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
};

export default FormattedText;