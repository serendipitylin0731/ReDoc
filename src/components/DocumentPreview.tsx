import type { ReactNode } from "react";
import katex from "katex";
import type { NoteBlock } from "@app/types";

export default function DocumentPreview({ blocks }: { blocks: NoteBlock[] }) {
  const content: ReactNode[] = [];
  let numbered = 0;
  for (const block of blocks) {
    if (block.type !== "numbered") numbered = 0;
    if (block.type === "heading1") content.push(<h1 key={block.id}>{block.text}</h1>);
    else if (block.type === "heading2") content.push(<h2 key={block.id}>{block.text}</h2>);
    else if (block.type === "heading3") content.push(<h3 key={block.id}>{block.text}</h3>);
    else if (block.type === "paragraph" || block.type === "excerpt") content.push(<p key={block.id}>{block.text}</p>);
    else if (block.type === "quote") content.push(<blockquote key={block.id}>{block.text}</blockquote>);
    else if (block.type === "bullet") content.push(<div className="conversion-list-item" key={block.id}><span>•</span><p>{block.text}</p></div>);
    else if (block.type === "numbered") { numbered += 1; content.push(<div className="conversion-list-item" key={block.id}><span>{numbered}.</span><p>{block.text}</p></div>); }
    else if (block.type === "code") content.push(<pre key={block.id}>{block.text}</pre>);
    else if (block.type === "math") content.push(<div className="conversion-math" key={block.id} dangerouslySetInnerHTML={{ __html: katex.renderToString(block.text, { displayMode: true, throwOnError: false }) }} />);
    else if (block.type === "table" && block.rows) content.push(<div className="conversion-table-wrap" key={block.id}><table><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => rowIndex === 0 ? <th key={cellIndex}>{cell}</th> : <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>);
    else if (block.type === "image" && block.src) content.push(<figure key={block.id}><img src={block.src} alt={block.text || "原始页面"} /><figcaption>{block.text}</figcaption></figure>);
  }
  return <article className="conversion-document-preview">{content}</article>;
}
