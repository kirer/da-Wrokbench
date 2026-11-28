    function DesignIcon({ name, size = 16, className = 'ic', ...rest }) {
      // 图标精灵按需注入：第一次真正渲染图标时才把 <symbol> 塞进 body，
      // 不再在样式装配阶段无条件注入，减少不需要时的首屏 DOM。
      ensureDesignIcons()
      return h('svg', { className, width: size, height: size, 'aria-hidden': 'true', focusable: 'false', ...rest },
        h('use', { href: `#i-${name}` }))
    }

    // 需求正文允许写 Markdown：标题、段落、列表、粗体、行内代码、链接、引用、
    // 代码块。只生成 React 节点、不拼 innerHTML，避免把需求文档当 HTML 执行。
    function markdownInline(text, keyPrefix) {
      const nodes = []
      const pattern = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|~~([^~]+)~~/g
      let last = 0
      let index = 0
      let match
      while ((match = pattern.exec(text)) !== null) {
        if (match.index > last) nodes.push(text.slice(last, match.index))
        if (match[1] !== undefined) nodes.push(h('strong', { key: `${keyPrefix}-s${index++}` }, match[1]))
        else if (match[2] !== undefined) nodes.push(h('code', { key: `${keyPrefix}-c${index++}` }, match[2]))
        else if (match[3] !== undefined) nodes.push(h('a', { key: `${keyPrefix}-a${index++}`, href: match[4], target: '_blank', rel: 'noreferrer noopener' }, match[3]))
        else nodes.push(h('del', { key: `${keyPrefix}-d${index++}` }, match[5]))
        last = pattern.lastIndex
      }
      if (last < text.length) nodes.push(text.slice(last))
      return nodes
    }

    function markdownBlocks(text) {
      const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
      const blocks = []
      let index = 0
      let key = 0
      while (index < lines.length) {
        const line = lines[index]
        if (/^\s*$/.test(line)) { index += 1; continue }
        // 表格：| a | b | 换行 | --- | --- | 换行若干数据行（产品文档常用）。
        const isTableRow = (value) => /^\s*\|.*\|\s*$/.test(value)
        const isTableSep = (value) => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(value)
        if (isTableRow(line) && index + 1 < lines.length && isTableSep(lines[index + 1])) {
          const splitRow = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
          const header = splitRow(line)
          index += 2
          const rows = []
          while (index < lines.length && isTableRow(lines[index])) {
            rows.push(splitRow(lines[index]))
            index += 1
          }
          const headerCells = header.map((cell, ci) => h('th', { key: `th-${ci}` }, ...markdownInline(cell, `th${key}-${ci}`)))
          const bodyRows = rows.map((cells, ri) => h('tr', { key: `tr-${ri}` },
            ...header.map((_, ci) => h('td', { key: `td-${ci}` }, ...markdownInline(cells[ci] ?? '', `td${key}-${ri}-${ci}`)))))
          blocks.push(h('table', { key: `md-${key++}`, className: 'dsh-wb-md-table' },
            h('thead', null, h('tr', null, ...headerCells)),
            h('tbody', null, ...bodyRows)))
          continue
        }
        if (/^\s*```/.test(line)) {
          const code = []
          index += 1
          while (index < lines.length && !/^\s*```/.test(lines[index])) { code.push(lines[index]); index += 1 }
          index += 1
          blocks.push(h('pre', { key: `md-${key++}`, className: 'dsh-wb-md-pre' }, h('code', null, code.join('\n'))))
          continue
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line)
        if (heading) {
          // 文档嵌在卡片里，标题降两级，避免 # 比卡片标题还大。
          const level = Math.min(6, heading[1].length + 2)
          blocks.push(h(`h${level}`, { key: `md-${key++}` }, markdownInline(heading[2].trim(), `h${key}`)))
          index += 1
          continue
        }
        if (/^\s*>\s?/.test(line)) {
          const quote = []
          while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
            quote.push(lines[index].replace(/^\s*>\s?/, ''))
            index += 1
          }
          blocks.push(h('blockquote', { key: `md-${key++}` }, markdownInline(quote.join(' '), `q${key}`)))
          continue
        }
        const ordered = /^\s*\d+[.)]\s+/.test(line)
        const unordered = /^\s*[-*+]\s+/.test(line)
        if (ordered || unordered) {
          const items = []
          const itemPattern = ordered ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/
          while (index < lines.length && itemPattern.test(lines[index])) {
            let itemText = lines[index].match(itemPattern)[1]
            let task = null
            if (unordered) {
              const checkbox = /^\[( |x|X)\]\s+(.*)$/.exec(itemText)
              if (checkbox) { task = checkbox[1].toLowerCase() === 'x'; itemText = checkbox[2] }
            }
            const inner = markdownInline(itemText, `li${key}`)
            if (task === null) {
              items.push(h('li', { key: `li-${key++}` }, ...inner))
            } else {
              items.push(h('li', { key: `li-${key++}`, className: 'dsh-wb-md-task' },
                h('span', { key: 'ck', className: `dsh-wb-md-check${task ? ' is-done' : ''}`, 'aria-hidden': 'true' }, task ? '✓' : '○'),
                h('span', { key: 'tx' }, ...inner)))
            }
            index += 1
          }
          blocks.push(h(ordered ? 'ol' : 'ul', { key: `md-${key++}` }, ...items))
          continue
        }
        const paragraph = []
        while (index < lines.length
          && !/^\s*$/.test(lines[index])
          && !/^(#{1,6})\s+/.test(lines[index])
          && !/^\s*```/.test(lines[index])
          && !/^\s*>\s?/.test(lines[index])
          && !/^\s*\d+[.)]\s+/.test(lines[index])
          && !/^\s*[-*+]\s+/.test(lines[index])) {
          paragraph.push(lines[index].trim())
          index += 1
        }
        const children = []
        paragraph.forEach((part, order) => {
          if (order > 0) children.push(h('br', { key: `br-${key++}` }))
          children.push(...markdownInline(part, `p${key}-${order}`))
        })
        blocks.push(h('p', { key: `md-${key++}` }, ...children))
      }
      return blocks
    }

    function MarkdownText({ text, className = '' }) {
      if (String(text ?? '').trim() === '') return null
      return h('div', { className: `dsh-wb-md ${className}`.trim() }, markdownBlocks(text))
    }

    function ensureDesignIcons() {
      if (typeof document === 'undefined') return
      if (document.querySelector('div[data-dsh-workbench-icons]') !== null) return
      const host = document.createElement('div')
      host.dataset.dshWorkbenchIcons = '1'
      host.setAttribute('aria-hidden', 'true')
      host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none'
      host.innerHTML = DESIGN_ICONS
      document.body.appendChild(host)
    }
