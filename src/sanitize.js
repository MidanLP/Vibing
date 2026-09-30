'use strict';
const sanitizeHtml = require('sanitize-html');

const linkTransform = (tagName, attribs) => ({
  tagName: 'a',
  attribs: {
    href: attribs.href,
    target: '_blank',
    rel: 'noopener noreferrer nofollow ugc',
  },
});

// Only images hosted on this site or over http(s) are allowed in posts.
const imageFilter = (frame) => frame.tag === 'img' && !frame.attribs.src;

const POST_OPTIONS = {
  allowedTags: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'h1', 'h2', 'h3', 'blockquote', 'pre', 'code',
    'ul', 'ol', 'li', 'a', 'img',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  transformTags: { a: linkTransform },
  exclusiveFilter: imageFilter,
};

const COMMENT_OPTIONS = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  transformTags: { a: linkTransform },
};

function cleanup(html) {
  // The editor sometimes exports ordinary spaces as non-breaking spaces,
  // which stops long lines from wrapping.
  return String(html || '').replace(/&nbsp;/g, ' ').replace(/ /g, ' ');
}

function sanitizePostHtml(html) {
  return sanitizeHtml(cleanup(html), POST_OPTIONS).trim();
}

function sanitizeCommentHtml(html) {
  return sanitizeHtml(cleanup(html), COMMENT_OPTIONS).trim();
}

/** Plain text version of HTML, used for search and excerpts. */
function htmlToText(html) {
  const spaced = String(html || '').replace(/<\/(p|h[1-6]|li|blockquote|pre)>|<br\s*\/?>/gi, '$& ');
  const text = sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} });
  return decodeEntities(text).replace(/\s+/g, ' ').trim();
}

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
}

/** True if the HTML has any visible content (text or an image). */
function hasContent(html) {
  return htmlToText(html).length > 0 || /<img\s/i.test(html);
}

module.exports = { sanitizePostHtml, sanitizeCommentHtml, htmlToText, hasContent };
