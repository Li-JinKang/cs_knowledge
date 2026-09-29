import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { docsMap } from './docsMap.js';

// Strip the YAML frontmatter before handing markdown to the renderer -- it would
// otherwise show up as a stray `---` block and raw key/value lines.
function stripFrontmatter(text) {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

// Resolve a relative markdown link against the current document's directory so
// `references/x.md` inside `SKILL.md` points at the right route.
function resolveDocPath(current, href) {
  if (!href.endsWith('.md')) return null;
  if (href.startsWith('/')) return href.slice(1);
  const parts = current.split('/').slice(0, -1).concat(href.split('/'));
  const out = [];
  for (const seg of parts) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}

export default function Doc() {
  const params = useParams();
  const path = params['*'] || '';
  const [text, setText] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | missing | error

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setText(null);

    const loader = docsMap[path];
    if (!loader) {
      setState('missing');
      return () => { cancelled = true; };
    }

    loader()
      .then((raw) => {
        if (cancelled) return;
        setText(stripFrontmatter(raw));
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });

    return () => { cancelled = true; };
  }, [path]);

  if (state === 'missing' || state === 'error') {
    return (
      <div className="docs">
        <p className="crumb">
          <Link to="/docs">← 文档</Link>
        </p>
        <h1>找不到这篇文档</h1>
        <p style={{ color: 'var(--muted)' }}>
          <code>src/docs/{path}</code> 不存在。可能是链接写错了，
          或者该文件还没被复制到站点目录。
        </p>
      </div>
    );
  }

  if (state === 'loading') {
    return <div className="docs"><p style={{ color: 'var(--muted)' }}>加载中…</p></div>;
  }

  return (
    <div className="docs">
      <p className="crumb">
        <Link to="/docs">← 文档</Link>
      </p>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href = '', children, ...rest }) {
            const target = resolveDocPath(path, href);
            if (target && docsMap[target]) {
              return <Link to={`/docs/${target}`}>{children}</Link>;
            }
            // Anchor links stay in-page; everything else opens in a new tab
            // because leaving the SPA for a raw file is rarely what you want.
            if (href.startsWith('#')) return <a href={href} {...rest}>{children}</a>;
            return (
              <a href={href} target="_blank" rel="noreferrer noopener" {...rest}>
                {children}
              </a>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
