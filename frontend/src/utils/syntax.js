/* ══════════════════════════════════════════════════════════════
   CollabCode Syntax Highlighter  –  24 languages
   ══════════════════════════════════════════════════════════════ */

const ESC = s => String(s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* ── Keyword sets ────────────────────────────────────────────── */
const KW = {
  python:     /^(False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield|print|len|range|type|super|self|input|open|int|str|float|list|dict|set|tuple|bool)\b/,
  javascript: /^(async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|false|finally|for|from|function|if|import|in|instanceof|let|new|null|of|return|static|super|switch|this|throw|true|try|typeof|undefined|var|void|while|yield|console|require|module|Promise|Array|Object|String|Number|Boolean|Symbol)\b/,
  typescript: /^(abstract|as|async|await|break|case|catch|class|const|constructor|continue|debugger|declare|default|delete|do|else|enum|export|extends|false|finally|for|from|function|if|implements|import|in|instanceof|interface|is|keyof|let|namespace|never|new|null|of|override|private|protected|public|readonly|return|satisfies|static|super|switch|this|throw|true|try|type|typeof|undefined|var|void|while|yield|any|string|number|boolean|never|unknown|object|Record|Partial|Required|Pick|Omit|Exclude|Extract)\b/,
  jsx:        /^(async|await|break|case|catch|class|const|continue|default|delete|do|else|export|extends|false|finally|for|from|function|if|import|in|instanceof|let|new|null|of|return|static|super|switch|this|throw|true|try|typeof|undefined|var|void|while|yield|console|require)\b/,
  tsx:        /^(abstract|async|await|break|case|catch|class|const|continue|declare|default|delete|do|else|enum|export|extends|false|finally|for|from|function|if|implements|import|in|instanceof|interface|let|namespace|new|null|of|override|private|protected|public|readonly|return|static|super|switch|this|throw|true|try|type|typeof|undefined|var|void|while|yield)\b/,
  java:       /^(abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|native|new|null|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|true|try|void|volatile|while|false|String|System|Override|SuppressWarnings|Deprecated)\b/,
  c:          /^(auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|restrict|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|NULL|true|false|printf|scanf|malloc|free|include|define|ifdef|ifndef|endif|pragma)\b/,
  cpp:        /^(alignas|alignof|and|and_eq|asm|auto|bitand|bitor|bool|break|case|catch|char|char8_t|char16_t|char32_t|class|compl|concept|const|consteval|constexpr|constinit|const_cast|continue|co_await|co_return|co_yield|decltype|default|delete|do|double|dynamic_cast|else|enum|explicit|export|extern|false|float|for|friend|goto|if|inline|int|long|mutable|namespace|new|noexcept|not|not_eq|nullptr|operator|or|or_eq|private|protected|public|register|reinterpret_cast|requires|return|short|signed|sizeof|static|static_assert|static_cast|struct|switch|template|this|thread_local|throw|true|try|typedef|typeid|typename|union|unsigned|using|virtual|void|volatile|wchar_t|while|xor|xor_eq|include|define|NULL|cout|cin|endl|string|vector|map|set|pair)\b/,
  csharp:     /^(abstract|as|base|bool|break|byte|case|catch|char|checked|class|const|continue|decimal|default|delegate|do|double|else|enum|event|explicit|extern|false|finally|fixed|float|for|foreach|goto|if|implicit|in|int|interface|internal|is|lock|long|namespace|new|null|object|operator|out|override|params|private|protected|public|readonly|ref|return|sbyte|sealed|short|sizeof|stackalloc|static|string|struct|switch|this|throw|true|try|typeof|uint|ulong|unchecked|unsafe|ushort|using|virtual|void|volatile|while|async|await|dynamic|var|yield|get|set|value|add|remove|partial|when|record|init|with|nint|nuint|required|file)\b/,
  go:         /^(break|case|chan|const|continue|default|defer|else|fallthrough|for|func|go|goto|if|import|interface|map|package|range|return|select|struct|switch|type|var|nil|true|false|iota|make|len|cap|append|copy|delete|close|new|panic|recover|print|println|error|string|int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|complex64|complex128|bool|byte|rune|any)\b/,
  rust:       /^(abstract|as|async|await|become|box|break|const|continue|crate|do|dyn|else|enum|extern|false|final|fn|for|if|impl|in|let|loop|macro|match|mod|move|mut|override|priv|pub|ref|return|self|Self|static|struct|super|trait|true|try|type|typeof|union|unsafe|unsized|use|virtual|where|while|yield|String|Vec|Option|Result|Box|Rc|Arc|Cell|RefCell|HashMap|HashSet|BTreeMap|BTreeSet|Some|None|Ok|Err|i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize|f32|f64|bool|char|str)\b/,
  ruby:       /^(BEGIN|END|__ENCODING__|__END__|__FILE__|__LINE__|alias|and|begin|break|case|class|def|defined|do|else|elsif|end|ensure|false|for|if|in|module|next|nil|not|or|redo|rescue|retry|return|self|super|then|true|undef|unless|until|when|while|yield|puts|print|p|require|include|extend|raise|attr_reader|attr_writer|attr_accessor|initialize|respond_to|is_a|nil|lambda|proc)\b/,
  php:        /^(abstract|and|array|as|break|callable|case|catch|class|clone|const|continue|declare|default|die|do|echo|else|elseif|empty|enddeclare|endfor|endforeach|endif|endswitch|endwhile|eval|exit|extends|final|finally|fn|for|foreach|function|global|goto|if|implements|include|include_once|instanceof|insteadof|interface|isset|list|match|namespace|new|null|or|print|private|protected|public|require|require_once|return|static|switch|throw|trait|try|true|unset|use|var|while|xor|yield|false|TRUE|FALSE|NULL|string|int|float|bool|object|void|mixed|array)\b/,
  swift:      /^(any|as|associatedtype|break|case|catch|class|continue|default|defer|deinit|do|else|enum|extension|fallthrough|false|fileprivate|final|for|func|get|guard|if|import|in|indirect|infix|init|inout|internal|is|lazy|let|mutating|nil|nonisolated|nonmutating|open|operator|optional|override|postfix|precedencegroup|prefix|private|protocol|public|repeat|required|rethrows|return|self|Self|set|some|static|struct|subscript|super|switch|throw|throws|true|try|type|typealias|unowned|var|weak|where|while|Int|String|Bool|Double|Float|Array|Dictionary|Set|Optional|Result|Error|Void|Character|Data|URL|Date|UUID|Any|AnyObject|Never)\b/,
  kotlin:     /^(abstract|actual|annotation|as|break|by|catch|class|companion|const|constructor|continue|crossinline|data|do|dynamic|else|enum|expect|external|false|final|finally|for|fun|get|if|import|in|infix|init|inline|inner|interface|internal|is|lateinit|noinline|null|object|open|operator|out|override|package|private|protected|public|reified|return|sealed|set|super|suspend|tailrec|this|throw|true|try|typealias|typeof|val|var|vararg|when|where|while|String|Int|Long|Short|Byte|Double|Float|Boolean|Char|Array|List|Map|Set|Pair|Triple|Unit|Nothing|Any|lazy|also|apply|let|run|with|forEach|map|filter|reduce|fold)\b/,
  sql:        /^(ADD|ALL|ALTER|AND|AS|ASC|BETWEEN|BY|CASE|CHECK|COLUMN|COMMIT|CONSTRAINT|CREATE|CROSS|DATABASE|DEFAULT|DELETE|DESC|DISTINCT|DROP|ELSE|END|EXISTS|FOREIGN|FROM|FULL|GROUP|HAVING|IF|IN|INDEX|INNER|INSERT|INTO|IS|JOIN|KEY|LEFT|LIKE|LIMIT|MODIFY|NOT|NULL|OF|OFFSET|ON|OR|ORDER|OUTER|OVER|PARTITION|PRIMARY|REFERENCES|RETURNING|RIGHT|ROLLBACK|SELECT|SET|SHOW|SOME|TABLE|THEN|TOP|TRANSACTION|TRIGGER|UNION|UNIQUE|UPDATE|USE|VALUES|VIEW|WHEN|WHERE|WITH|COUNT|SUM|AVG|MIN|MAX|COALESCE|NULLIF|CAST|CONVERT|CONCAT|SUBSTRING|TRIM|LOWER|UPPER|NOW|GETDATE|DATEADD|DATEDIFF|ROW_NUMBER|RANK|DENSE_RANK|LAG|LEAD|FIRST_VALUE|LAST_VALUE)\b/i,
  bash:       /^(case|do|done|elif|else|esac|fi|for|function|if|in|select|then|time|until|while|break|continue|exit|return|export|local|readonly|unset|declare|typeset|alias|unalias|source|shift|eval|exec|trap|wait|set|shopt|echo|printf|read|test|true|false|cat|ls|cd|pwd|mkdir|rm|cp|mv|grep|sed|awk|find|xargs|sort|uniq|head|tail|wc|cut|tr|chmod|chown|kill|ps|top|df|du|tar|zip|curl|wget|git|docker|npm|pip|python3|node|bash|sh|ssh)\b/,
  shell:      /^(case|do|done|elif|else|esac|fi|for|function|if|in|select|then|until|while|break|continue|exit|return|export|local|readonly|unset|echo|printf|read|test|true|false)\b/,
};

/* ── Language file extension map ─────────────────────────────── */
export const LANG_META = {
  python:     { ext:['.py','.pyw','.pyi'],                  color:'#3b82f6', label:'Python'     },
  javascript: { ext:['.js','.mjs','.cjs'],                  color:'#f59e0b', label:'JavaScript' },
  typescript: { ext:['.ts','.mts','.cts'],                  color:'#38bdf8', label:'TypeScript' },
  jsx:        { ext:['.jsx'],                               color:'#61dafb', label:'JSX'        },
  tsx:        { ext:['.tsx'],                               color:'#61dafb', label:'TSX'        },
  java:       { ext:['.java'],                              color:'#ef4444', label:'Java'       },
  c:          { ext:['.c','.h'],                            color:'#6366f1', label:'C'          },
  cpp:        { ext:['.cpp','.cc','.cxx','.hpp','.hxx'],    color:'#8b5cf6', label:'C++'       },
  csharp:     { ext:['.cs','.csx'],                         color:'#a855f7', label:'C#'         },
  go:         { ext:['.go'],                                color:'#06b6d4', label:'Go'         },
  rust:       { ext:['.rs'],                                color:'#f97316', label:'Rust'       },
  ruby:       { ext:['.rb','.rake','.gemspec'],             color:'#e11d48', label:'Ruby'       },
  php:        { ext:['.php','.phtml','.php3','.php4'],      color:'#7c3aed', label:'PHP'        },
  swift:      { ext:['.swift'],                             color:'#f97316', label:'Swift'      },
  kotlin:     { ext:['.kt','.kts'],                         color:'#a855f7', label:'Kotlin'     },
  sql:        { ext:['.sql'],                               color:'#0891b2', label:'SQL'        },
  bash:       { ext:['.sh','.bash','.zsh','.fish'],         color:'#15803d', label:'Bash/Shell' },
  shell:      { ext:['.command','.tool'],                   color:'#166534', label:'Shell'      },
  html:       { ext:['.html','.htm','.xhtml'],              color:'#ea580c', label:'HTML'       },
  xml:        { ext:['.xml','.svg','.xsl','.xsd','.rss'],   color:'#65a30d', label:'XML'        },
  css:        { ext:['.css'],                               color:'#06b6d4', label:'CSS'        },
  scss:       { ext:['.scss','.sass'],                      color:'#db2777', label:'SCSS'       },
  json:       { ext:['.json','.jsonc','.json5'],            color:'#10b981', label:'JSON'       },
  yaml:       { ext:['.yml','.yaml'],                       color:'#d97706', label:'YAML'       },
  toml:       { ext:['.toml'],                              color:'#b45309', label:'TOML'       },
  markdown:   { ext:['.md','.mdx','.markdown'],             color:'#8b5cf6', label:'Markdown'   },
  dockerfile: { ext:['Dockerfile','.dockerfile'],           color:'#2563eb', label:'Dockerfile' },
  graphql:    { ext:['.graphql','.gql'],                    color:'#e10098', label:'GraphQL'    },
  lua:        { ext:['.lua'],                               color:'#1d4ed8', label:'Lua'        },
  r:          { ext:['.r','.R','.Rmd'],                     color:'#2563eb', label:'R'          },
  perl:       { ext:['.pl','.pm','.t'],                     color:'#4f46e5', label:'Perl'       },
  haskell:    { ext:['.hs','.lhs'],                         color:'#7c3aed', label:'Haskell'    },
  elixir:     { ext:['.ex','.exs'],                         color:'#7c3aed', label:'Elixir'     },
  erlang:     { ext:['.erl','.hrl'],                        color:'#b91c1c', label:'Erlang'     },
  dart:       { ext:['.dart'],                              color:'#0891b2', label:'Dart'       },
  text:       { ext:['.txt','.log','.ini','.conf'],         color:'#9aa3be', label:'Text'       },
};

export function detectLanguage(filename) {
  const lower = filename.toLowerCase();
  // Exact filename match first (e.g. Dockerfile)
  for (const [lang, meta] of Object.entries(LANG_META)) {
    if (meta.ext.includes(lower)) return lang;
  }
  // Extension match
  const dot = lower.lastIndexOf('.');
  if (dot >= 0) {
    const ext = lower.slice(dot);
    for (const [lang, meta] of Object.entries(LANG_META)) {
      if (meta.ext.includes(ext)) return lang;
    }
  }
  return 'text';
}

/* ── Token → class map ──────────────────────────────────────── */
const CLS = {
  keyword:'hl-keyword', string:'hl-string', comment:'hl-comment',
  number:'hl-number', func:'hl-func', type:'hl-type',
  decorator:'hl-decorator', operator:'hl-operator',
  key:'hl-key', tag:'hl-tag', attr:'hl-attr', variable:'hl-variable',
};

function wrap(type, text) {
  const c = CLS[type];
  return c ? `<span class="${c}">${ESC(text)}</span>` : ESC(text);
}

/* ── Generic tokenizer ──────────────────────────────────────── */
function tokenizeLine(line, lang) {
  const kw = KW[lang];
  const tokens = [];
  let i = 0;

  // Line-level comment chars
  const lc = {
    python:'//#', javascript:'//', typescript:'//', jsx:'//', tsx:'//',
    java:'//', c:'//', cpp:'//', csharp:'//', go:'//', rust:'//',
    ruby:'#', php:'//', swift:'//', kotlin:'//', sql:'--', bash:'#',
    shell:'#', yaml:'#', toml:'#', r:'#', perl:'#', elixir:'#',
    lua:'--', dockerfile:'#',
  }[lang];

  // Block comment pairs
  const bc = {
    javascript:['/*','*/'], typescript:['/*','*/'], jsx:['/*','*/'],
    tsx:['/*','*/'], java:['/*','*/'], c:['/*','*/'], cpp:['/*','*/'],
    csharp:['/*','*/'], go:['/*','*/'], rust:['/*','*/'], php:['/*','*/'],
    swift:['/*','*/'], kotlin:['/*','*/'], sql:['/*','*/'], css:['/*','*/'],
    scss:['/*','*/'],
  }[lang];

  // Possible string delimiters
  const strChars = {
    python:["'''","\"\"\"",'"',"'"],
    javascript:['`','"',"'"], typescript:['`','"',"'"],
    jsx:['`','"',"'"], tsx:['`','"',"'"],
    go:['`','"',"'"], kotlin:['"""','"'],
    bash:['"',"'","`"], shell:['"',"'"],
    sql:['"',"'"], r:['"',"'"], perl:['"',"'"],
    default:['"',"'"],
  }[lang] || ['"',"'"];

  while (i < line.length) {
    const rest = line.slice(i);

    // Block comment start
    if (bc && rest.startsWith(bc[0])) {
      const end = rest.indexOf(bc[1], bc[0].length);
      const chunk = end >= 0 ? rest.slice(0, end + bc[1].length) : rest;
      tokens.push(wrap('comment', chunk)); i += chunk.length; continue;
    }

    // Line comment
    if (lc) {
      for (const c of lc.split('')) {
        if (lc.startsWith('//') ? rest.startsWith('//') : rest[0] === lc[0]) {
          if (rest.startsWith(lc) || (lc.includes('#') && rest[0]==='#') || (lc.includes('--') && rest.startsWith('--'))) {
            tokens.push(wrap('comment', rest)); i = line.length; break;
          }
        }
      }
      if (i >= line.length) break;
      const rest2 = line.slice(i);
      if ((lc==='#'&&rest2[0]==='#')||(lc.includes('//')&&rest2.startsWith('//'))||(lc.includes('--')&&rest2.startsWith('--'))) {
        tokens.push(wrap('comment', rest2)); break;
      }
    }

    const r = line.slice(i);

    // HTML/XML/JSX tags
    if ((lang==='html'||lang==='xml'||lang==='jsx'||lang==='tsx') && r[0]==='<') {
      const end = r.indexOf('>');
      const tag = end >= 0 ? r.slice(0, end + 1) : r;
      const inner = tag.replace(/^<\/?/,'').replace(/>$/,'');
      const parts = inner.split(/(\s+)/);
      let out = r[1]==='/' ? '&lt;/' : '&lt;';
      if (parts[0]) out += `<span class="hl-tag">${ESC(parts[0])}</span>`;
      out += ESC(parts.slice(1).join(''))
        .replace(/(\w[\w\-]*)(?==)/g,'<span class="hl-attr">$1</span>')
        .replace(/"([^"]*)"/g,'"<span class="hl-string">$1</span>"');
      out += '&gt;';
      tokens.push(out); i += tag.length; continue;
    }

    // Decorator / annotation
    if (r[0]==='@') {
      const m = r.match(/^@[\w.]+/);
      if (m) { tokens.push(wrap('decorator', m[0])); i += m[0].length; continue; }
    }

    // PHP/shell variables
    if (r[0]==='$') {
      const m = r.match(/^\$[\w{}\[\]]+/);
      if (m) { tokens.push(wrap('variable', m[0])); i += m[0].length; continue; }
    }

    // Strings
    let foundStr = false;
    for (const q of strChars) {
      if (r.startsWith(q)) {
        let j = q.length;
        while (j < r.length) {
          if (r[j]==='\\') { j+=2; continue; }
          if (r.slice(j).startsWith(q)) { j += q.length; break; }
          j++;
        }
        tokens.push(wrap('string', r.slice(0, j))); i += j; foundStr = true; break;
      }
    }
    if (foundStr) continue;

    // Numbers
    const numM = r.match(/^0x[\da-fA-F]+|^0b[01]+|^-?\d+(\.\d+)?([eE][+-]?\d+)?/);
    if (numM) {
      tokens.push(wrap('number', numM[0])); i += numM[0].length; continue;
    }

    // Identifiers / keywords / types / functions
    const idM = r.match(/^[a-zA-Z_$][\w$]*/);
    if (idM) {
      const word = idM[0];
      const after = r.slice(word.length).trimStart();
      if (kw && kw.test(r)) {
        tokens.push(wrap('keyword', word));
      } else if (/^[A-Z]/.test(word) && word !== word.toUpperCase()) {
        tokens.push(wrap('type', word));
      } else if (after.startsWith('(')) {
        tokens.push(wrap('func', word));
      } else {
        tokens.push(ESC(word));
      }
      i += word.length; continue;
    }

    // Operators
    if (/[=<>!+\-*/%&|^~?:,;.]/.test(r[0])) {
      tokens.push(wrap('operator', r[0])); i++; continue;
    }

    tokens.push(ESC(r[0])); i++;
  }

  return tokens.join('');
}

/* ── Specialised highlighters ────────────────────────────────── */
function highlightJSON(line) {
  const tokens = []; let i = 0;
  const r = () => line.slice(i);
  while (i < line.length) {
    const rest = r();
    if (rest[0]==='"') {
      let j = 1;
      while (j < rest.length && rest[j]!=='"') { if (rest[j]==='\\') j++; j++; }
      const s = rest.slice(0, j+1);
      const after = line.slice(i + s.length).trimStart();
      tokens.push(wrap(after.startsWith(':') ? 'key' : 'string', s));
      i += s.length; continue;
    }
    const numM = rest.match(/^-?\d+(\.\d+)?([eE][+-]?\d+)?/);
    if (numM) { tokens.push(wrap('number', numM[0])); i += numM[0].length; continue; }
    const kwM = rest.match(/^(true|false|null)/);
    if (kwM) { tokens.push(wrap('keyword', kwM[0])); i += kwM[0].length; continue; }
    tokens.push(ESC(rest[0])); i++;
  }
  return tokens.join('');
}

function highlightYAML(line) {
  if (/^#/.test(line.trim()))           return wrap('comment', line);
  if (/^---/.test(line.trim()))         return wrap('operator', line);
  if (/^!/.test(line.trim()))           return wrap('decorator', line);
  // key: value
  const m = line.match(/^(\s*)([\w\-]+)(\s*:\s*)(.*)/);
  if (m) {
    const val = m[4];
    const valHl = /^["']/.test(val) ? wrap('string', val)
                : /^-?\d/.test(val) ? wrap('number', val)
                : /^(true|false|null|~)$/.test(val) ? wrap('keyword', val)
                : ESC(val);
    return ESC(m[1]) + wrap('key', m[2]) + ESC(m[3]) + valHl;
  }
  if (/^\s*-\s/.test(line)) {
    return ESC(line.slice(0, line.indexOf('-')+1)) + wrap('operator','-') + ESC(line.slice(line.indexOf('-')+1));
  }
  return ESC(line);
}

function highlightMarkdown(line) {
  if (/^#{1,6}\s/.test(line))   return `<span class="hl-keyword">${ESC(line)}</span>`;
  if (/^>\s/.test(line))        return `<span class="hl-comment">${ESC(line)}</span>`;
  if (/^\s*[-*+]\s/.test(line)) return `<span class="hl-operator">•</span> ` + inlineMd(line.replace(/^\s*[-*+]\s/,''));
  if (/^\s*\d+\.\s/.test(line)) return `<span class="hl-operator">${ESC(line.match(/^\s*\d+\./)[0])}</span>` + inlineMd(line.slice(line.match(/^\s*\d+\./)[0].length));
  if (/^`{3}/.test(line))       return `<span class="hl-decorator">${ESC(line)}</span>`;
  if (/^---/.test(line))        return `<span class="hl-comment">${ESC(line)}</span>`;
  if (/^\|/.test(line))         return line.split('|').map(c=>`<span class="hl-type">${ESC(c)}</span>`).join('<span class="hl-operator">|</span>');
  return inlineMd(line);
}

function inlineMd(line) {
  return ESC(line)
    .replace(/\*\*\*(.+?)\*\*\*/g,'<span class="hl-keyword">***$1***</span>')
    .replace(/\*\*(.+?)\*\*/g,'<span class="hl-keyword">**$1**</span>')
    .replace(/\*(.+?)\*/g,'<span class="hl-string">*$1*</span>')
    .replace(/`(.+?)`/g,'<span class="hl-decorator">`$1`</span>')
    .replace(/\[(.+?)\]\((.+?)\)/g,'<span class="hl-func">[$1]</span><span class="hl-type">($2)</span>');
}

function highlightCSS(line) {
  if (/^\s*\/\*/.test(line)) return wrap('comment', line);
  if (/^\s*\/\//.test(line)) return wrap('comment', line);
  // property: value
  const m = line.match(/^(\s*)([\w\-]+)(\s*:\s*)(.*)(;?)$/);
  if (m) {
    const val = m[4];
    const valHl = val.replace(/(#[0-9a-fA-F]{3,8})/g, `<span class="hl-string">$1</span>`)
                     .replace(/(rgba?|hsl|var)\(/g, `<span class="hl-func">$1</span>(`)
                     .replace(/(-?\d+\.?\d*(?:px|em|rem|vh|vw|%|s|ms|deg)?)/g, `<span class="hl-number">$1</span>`);
    return ESC(m[1]) + wrap('key', m[2]) + ESC(m[3]) + valHl + ESC(m[5]);
  }
  // selector
  return ESC(line).replace(/([\w\-]+)(?=[{,\s]|$)/g, `<span class="hl-type">$1</span>`);
}

function highlightDockerfile(line) {
  const cmds = /^(FROM|RUN|CMD|LABEL|EXPOSE|ENV|ADD|COPY|ENTRYPOINT|VOLUME|USER|WORKDIR|ARG|ONBUILD|STOPSIGNAL|HEALTHCHECK|SHELL|MAINTAINER)\b/i;
  const m = line.match(cmds);
  if (m) return wrap('keyword', m[0]) + ESC(line.slice(m[0].length));
  if (/^#/.test(line.trim())) return wrap('comment', line);
  return ESC(line);
}

function highlightGraphQL(line) {
  const kws = /^(type|query|mutation|subscription|fragment|on|schema|scalar|enum|input|interface|union|extend|directive|implements|true|false|null)\b/;
  return tokenizeLine(line, 'typescript'); // close enough
}

/* ── Main export ─────────────────────────────────────────────── */
export function highlightLine(line, lang) {
  if (line === undefined || line === null || line === '') return '&nbsp;';

  switch (lang) {
    case 'json':       return highlightJSON(line);
    case 'yaml':
    case 'toml':       return highlightYAML(line);
    case 'markdown':   return highlightMarkdown(line);
    case 'css':
    case 'scss':       return highlightCSS(line);
    case 'html':
    case 'xml':        return tokenizeLine(line, lang);
    case 'dockerfile': return highlightDockerfile(line);
    case 'graphql':    return highlightGraphQL(line);
    default:           return tokenizeLine(line, lang);
  }
}
