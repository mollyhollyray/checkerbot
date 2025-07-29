const { escapeHtml } = require('./message');

describe('escapeHtml', () => {
  it('заменяет < на &lt;', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
  });

  it('не трогает обычный текст', () => {
    expect(escapeHtml('Hello')).toBe('Hello');
  });

  it('обрабатывает &', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });
});