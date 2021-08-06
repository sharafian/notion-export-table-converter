#!/usr/bin/env node

const AdmZip = require('adm-zip')
const marked = require('marked')
const Papa = require('papaparse')
const fs = require('fs')

function isRootMdFile (entry) {
  return !entry.entryName.includes('/') &&
    entry.entryName.endsWith('.md') &&
    !entry.isDirectory
}

function loadZip (filename) {
  const zip = new AdmZip(filename)
  const entries = zip.getEntries()

  const rootMarkdown = entries.find(entry => {
    return isRootMdFile(entry)
  })

  return {
    rootMarkdown,
    zip
  }
}

function isUrl (str) {
  try {
    _ = new URL(str)
    return true
  } catch (_) {
    return false
  }
}

function processMarkdownLink (zip, node) {
  if (isUrl(node.href) || !node.href.endsWith('.csv')) {
    return node
  }

  const csvFile = decodeURIComponent(node.href)
  const csvFileContent = zip.getEntry(csvFile).getData().toString('utf8')
  const parsed = Papa.parse(csvFileContent, { header: false })
  parsed.data.splice(1, 0, new Array(parsed.data[0].length).fill(':--'))

  // matching the exact format isn't super important because we're converting back ourselves
  return {
    type: "table",
    raw: `#### ${node.text}\n\n` + parsed.data.map(row => {
      return `|${row.join('|')}|`
    }).join('\n')
  }
}

function processMarkdownNode (zip, node) {
  if (node.type === 'link') {
    return processMarkdownLink(zip, node)
  }

  // Cannot embed a table under a table so this logic is mutually exclusive
  else {
    return {
      ...node,
      tokens: Array.isArray(node.tokens)
        ? node.tokens.map(processMarkdownNode.bind(null, zip))
        : node.tokens
    }
  }
}

function sanitizeHTML (str) {
  // sanitize angle brackets only outside codeblocks. This is probably not perfect
  return str.split('`').map((e, i) => {
    if (i % 2 === 0) {
      return e.replace(/`[^`]\</g, '&lt;').replace(/\>/g, '&gt;')
    } else {
      return e
    }
  }).join('`')
}

function serializeLexedMarkdown (lexed) {
  return lexed.map(node => {
    if (node.type === 'paragraph') {
      return serializeLexedMarkdown(node.tokens)
    } else if (node.type === 'code') {
      return node.raw
    } else {
      return sanitizeHTML(node.raw)
    }
  }).join('')
}

function processRootMarkdown ({ rootMarkdown, zip }) {
  const mdContent = rootMarkdown.getData().toString('utf8')
  const lexedMd = marked.lexer(mdContent)

  return lexedMd.map(processMarkdownNode.bind(null, zip))
}

if (!process.argv[2] || !fs.existsSync(process.argv[2])) {
  console.error('Fatal: must provide a file as argument')
  process.exit(1)
}

console.log(serializeLexedMarkdown(processRootMarkdown(loadZip(process.argv[2]))))
