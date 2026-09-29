import { Link } from 'react-router-dom';
import { docsMap, listDocs } from './docsMap.js';

export default function DocsIndex() {
  const entries = listDocs();
  const groups = entries.reduce((acc, e) => {
    (acc[e.group] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className="docs">
      <h1>文档</h1>
      <p style={{ color: 'var(--muted)' }}>
        这些页面在构建时从站点的 <code>src/docs/</code> 目录收集而来。
        新增一个 <code>.md</code> 文件并重新构建，它就会出现在这里。
      </p>

      {Object.entries(groups).map(([group, items]) => (
        <section key={group}>
          <h2>{group}</h2>
          <ul className="docs-index">
            {items.map((e) => (
              <li key={e.path}>
                <Link to={`/docs/${e.path}`}>{e.title}</Link>
                {e.blurb && <p>{e.blurb}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
