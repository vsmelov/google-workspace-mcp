// gworkspace-mcp — тонкий MCP-сервер для Google Docs и Slides через сервисный аккаунт.
// Авторизация: GOOGLE_APPLICATION_CREDENTIALS -> JSON-ключ сервисного аккаунта.
// Сервисный аккаунт видит только файлы, явно расшаренные на его email
// (или лежащие в расшаренной на него папке).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { google } from 'googleapis';

const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!keyFile) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS is not set');
  process.exit(1);
}

const auth = new google.auth.GoogleAuth({
  keyFile,
  scopes: [
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/presentations',
    'https://www.googleapis.com/auth/drive',
  ],
});
const docs = google.docs({ version: 'v1', auth });
const slides = google.slides({ version: 'v1', auth });

const server = new McpServer({ name: 'gworkspace', version: '1.0.0' });

const text = (data) => ({
  content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
});

function extractDocText(doc) {
  const out = [];
  for (const el of doc.body?.content ?? []) {
    for (const pe of el.paragraph?.elements ?? []) {
      if (pe.textRun?.content) out.push(pe.textRun.content);
    }
    if (el.table) {
      for (const row of el.table.tableRows ?? []) {
        const cells = (row.tableCells ?? []).map((c) =>
          (c.content ?? [])
            .flatMap((cc) => (cc.paragraph?.elements ?? []).map((pe) => pe.textRun?.content ?? ''))
            .join('')
            .trim(),
        );
        out.push(cells.join(' | ') + '\n');
      }
    }
  }
  return out.join('');
}

server.tool(
  'docs_read',
  'Read a Google Doc as plain text',
  { documentId: z.string() },
  async ({ documentId }) => {
    const { data } = await docs.documents.get({ documentId });
    return text(extractDocText(data));
  },
);

server.tool(
  'docs_append',
  'Append text to the end of a Google Doc',
  { documentId: z.string(), textToAppend: z.string() },
  async ({ documentId, textToAppend }) => {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [{ insertText: { endOfSegmentLocation: { segmentId: '' }, text: textToAppend } }],
      },
    });
    return text('OK');
  },
);

server.tool(
  'docs_replace_text',
  'Find and replace all occurrences of text in a Google Doc',
  {
    documentId: z.string(),
    find: z.string(),
    replace: z.string(),
    matchCase: z.boolean().optional(),
  },
  async ({ documentId, find, replace, matchCase }) => {
    const { data } = await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            replaceAllText: {
              containsText: { text: find, matchCase: matchCase ?? true },
              replaceText: replace,
            },
          },
        ],
      },
    });
    return text(data.replies?.[0]?.replaceAllText ?? { occurrencesChanged: 0 });
  },
);

server.tool(
  'docs_batch_update',
  'Apply raw Docs API batchUpdate requests (full API power: formatting, images, tables, etc). See https://developers.google.com/docs/api/reference/rest/v1/documents/batchUpdate',
  { documentId: z.string(), requests: z.array(z.record(z.any())) },
  async ({ documentId, requests }) => {
    const { data } = await docs.documents.batchUpdate({ documentId, requestBody: { requests } });
    return text(data.replies ?? []);
  },
);

function summarizeSlide(slide) {
  const elements = (slide.pageElements ?? []).map((el) => {
    const t = (el.shape?.text?.textElements ?? [])
      .map((te) => te.textRun?.content ?? '')
      .join('');
    return {
      objectId: el.objectId,
      type: el.shape?.placeholder?.type ?? (el.shape ? 'SHAPE' : el.table ? 'TABLE' : el.image ? 'IMAGE' : 'OTHER'),
      text: t || undefined,
    };
  });
  return { objectId: slide.objectId, elements };
}

server.tool(
  'slides_get',
  'Get a Google Slides presentation structure: slides with element ids and their text',
  { presentationId: z.string() },
  async ({ presentationId }) => {
    const { data } = await slides.presentations.get({ presentationId });
    return text({
      title: data.title,
      slideCount: (data.slides ?? []).length,
      slides: (data.slides ?? []).map(summarizeSlide),
    });
  },
);

server.tool(
  'slides_add_slide',
  'Append a new slide with optional title and body text. Layout defaults to TITLE_AND_BODY; use TITLE_ONLY, SECTION_HEADER, BLANK etc for others',
  {
    presentationId: z.string(),
    layout: z.string().optional(),
    title: z.string().optional(),
    body: z.string().optional(),
  },
  async ({ presentationId, layout, title, body }) => {
    const slideId = `slide_${Date.now()}`;
    const titleId = `${slideId}_title`;
    const bodyId = `${slideId}_body`;
    const mappings = [];
    if (title !== undefined) mappings.push({ layoutPlaceholder: { type: 'TITLE' }, objectId: titleId });
    if (body !== undefined) mappings.push({ layoutPlaceholder: { type: 'BODY' }, objectId: bodyId });
    const requests = [
      {
        createSlide: {
          objectId: slideId,
          slideLayoutReference: { predefinedLayout: layout ?? 'TITLE_AND_BODY' },
          placeholderIdMappings: mappings.length ? mappings : undefined,
        },
      },
    ];
    if (title !== undefined) requests.push({ insertText: { objectId: titleId, text: title } });
    if (body !== undefined) requests.push({ insertText: { objectId: bodyId, text: body } });
    await slides.presentations.batchUpdate({ presentationId, requestBody: { requests } });
    return text({ createdSlideId: slideId });
  },
);

server.tool(
  'slides_replace_text',
  'Find and replace all occurrences of text across all slides',
  {
    presentationId: z.string(),
    find: z.string(),
    replace: z.string(),
    matchCase: z.boolean().optional(),
  },
  async ({ presentationId, find, replace, matchCase }) => {
    const { data } = await slides.presentations.batchUpdate({
      presentationId,
      requestBody: {
        requests: [
          {
            replaceAllText: {
              containsText: { text: find, matchCase: matchCase ?? true },
              replaceText: replace,
            },
          },
        ],
      },
    });
    return text(data.replies?.[0]?.replaceAllText ?? { occurrencesChanged: 0 });
  },
);

server.tool(
  'slides_batch_update',
  'Apply raw Slides API batchUpdate requests (full API power: shapes, images, formatting, etc). See https://developers.google.com/slides/api/reference/rest/v1/presentations/batchUpdate',
  { presentationId: z.string(), requests: z.array(z.record(z.any())) },
  async ({ presentationId, requests }) => {
    const { data } = await slides.presentations.batchUpdate({ presentationId, requestBody: { requests } });
    return text(data.replies ?? []);
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('gworkspace MCP server running on stdio');
