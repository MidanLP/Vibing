'use strict';
/* global Quill */

// Rich text editors for posts and comments. The editor's HTML is copied into
// a hidden form field when the form is submitted; the server cleans it up.

const TOOLBARS = {
  post: [
    [{ header: 2 }, { header: 3 }],
    ['bold', 'italic', 'underline', 'strike'],
    ['link', 'blockquote', 'code-block'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['image'],
    ['clean'],
  ],
  comment: [['bold', 'italic', 'link'], ['clean']],
};

const FORMATS = {
  post: ['header', 'bold', 'italic', 'underline', 'strike', 'link', 'blockquote', 'code-block', 'list', 'image'],
  comment: ['bold', 'italic', 'link'],
};

function csrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? meta.content : '';
}

async function uploadFile(quill, file, index) {
  const body = new FormData();
  body.append('image', file);
  quill.enable(false);
  let url;
  try {
    const response = await fetch('/uploads/image', {
      method: 'POST',
      body,
      headers: { 'x-csrf-token': csrfToken() },
      credentials: 'same-origin',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.url) throw new Error(data.error || 'The picture could not be uploaded.');
    url = data.url;
  } catch (err) {
    window.alert(err.message);
  } finally {
    quill.enable(true);
  }
  if (url) {
    quill.insertEmbed(index, 'image', url, 'user');
    quill.setSelection(index + 1, 0, 'silent');
  }
}

function pickImage(quill) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/gif,image/webp';
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (file) uploadFile(quill, file, quill.getSelection(true).index);
  });
  input.click();
}

document.querySelectorAll('[data-rich-editor]').forEach((el) => {
  const kind = el.getAttribute('data-rich-editor') === 'post' ? 'post' : 'comment';
  const quill = new Quill(el, {
    theme: 'snow',
    placeholder: el.getAttribute('data-placeholder') || '',
    formats: FORMATS[kind],
    modules: {
      toolbar: {
        container: TOOLBARS[kind],
        handlers: kind === 'post' ? { image() { pickImage(quill); } } : {},
      },
      // Pictures dropped or pasted into a post are uploaded to the server.
      uploader: {
        mimetypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
        handler(range, files) {
          if (kind !== 'post') return;
          files.reduce((chain, file) => chain.then(() => uploadFile(quill, file, quill.getSelection(true).index)), Promise.resolve());
        },
      },
    },
  });

  // Pictures pasted as embedded data would be stored inside the text itself;
  // the server would drop them anyway, so leave them out right away.
  quill.clipboard.addMatcher('IMG', (node, delta) => {
    const src = node.getAttribute('src') || '';
    return /^data:/i.test(src) ? new delta.constructor() : delta;
  });

  const form = el.closest('form');
  const hidden = form && form.querySelector('[data-rich-input]');
  if (!form || !hidden) return;

  let dirty = false;
  quill.on('text-change', () => { dirty = true; });
  form.addEventListener('input', () => { dirty = true; });

  form.addEventListener('submit', (event) => {
    const empty = quill.getText().trim() === '' && !quill.root.querySelector('img');
    if (kind === 'comment' && empty) {
      event.preventDefault();
      quill.focus();
      return;
    }
    hidden.value = empty ? '' : quill.getSemanticHTML();
    dirty = false;
  });

  if (kind === 'post') {
    window.addEventListener('beforeunload', (event) => {
      if (dirty) event.preventDefault();
    });
  }
});
