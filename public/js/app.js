'use strict';

// Ask before submitting forms marked with data-confirm (e.g. delete buttons).
document.addEventListener('submit', (event) => {
  const form = event.target;
  const message = form.getAttribute('data-confirm');
  if (message && !window.confirm(message)) event.preventDefault();
});

// Show a preview of a chosen picture before it is uploaded.
document.querySelectorAll('input[type=file][data-preview-target]').forEach((input) => {
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    const target = document.querySelector(input.getAttribute('data-preview-target'));
    if (!file || !target || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    if (target.tagName === 'IMG') {
      target.src = url;
      target.hidden = false;
    } else {
      const img = document.createElement('img');
      img.className = 'avatar';
      img.src = url;
      img.alt = '';
      img.style.width = img.style.height = '88px';
      target.replaceChildren(img);
    }
  });
});

// Suggest a web address for a new blog from its name.
const slugSource = document.querySelector('[data-slug-source]');
const slugTarget = document.querySelector('[data-slug-target]');
if (slugSource && slugTarget && !slugTarget.hasAttribute('data-slug-locked')) {
  let edited = slugTarget.value !== '';
  slugTarget.addEventListener('input', () => { edited = slugTarget.value !== ''; });
  slugSource.addEventListener('input', () => {
    if (edited) return;
    slugTarget.value = slugSource.value.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  });
}
