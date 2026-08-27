import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Button } from '../../src/ui/primitives/Button';
import { IconButton } from '../../src/ui/primitives/IconButton';
import { Select, type SelectOption } from '../../src/ui/primitives/Select';

const instances: Array<{ destroy(): void }> = [];

afterEach(() => {
  instances.forEach((instance) => instance.destroy());
  instances.length = 0;
});

const sampleOptions: SelectOption[] = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
  { value: 'c', label: 'C', tone: 'danger' },
];

describe('Button', () => {
  it('oluşturma ve yok etme', () => {
    const button = new Button('Gönder');
    instances.push(button);

    expect(button.element.tagName).toBe('BUTTON');
    expect(button.element.type).toBe('button');
    expect(button.element.classList.contains('vol-button')).toBe(true);
    expect(button.element.querySelector<HTMLSpanElement>('.vol-button__label')?.textContent).toBe(
      'Gönder',
    );
    expect(button.element.disabled).toBe(false);

    document.body.appendChild(button.element);
    button.destroy();
    expect(button.element.isConnected).toBe(false);
  });

  it('.vol-button[hidden] görünmez — jsdom cascade hesaplamadığı için yapısal doğrulama', () => {
    // `.vol-button`'un kendi `display: inline-flex`'i (author stili) native
    // `[hidden] { display: none }` UA stilini ezer; `hidden = true` tek
    // başına GÖRSEL olarak gizlemez — bu override'ın primitives.css'te
    // gerçekten var olduğunu doğrular (bkz. .vol-card-picker[hidden] emsali).
    const css = readFileSync(resolve(import.meta.dirname, '../../src/ui/primitives.css'), 'utf-8');
    expect(css).toMatch(/\.vol-button\[hidden\]\s*\{\s*display:\s*none;?\s*\}/);
  });

  it('tıklama onClick handlerını çağırır', () => {
    const onClick = vi.fn();
    const button = new Button('Gönder', { onClick });
    instances.push(button);

    button.element.dispatchEvent(
      new PointerEvent('click', { bubbles: true, cancelable: true, pointerId: 1 }),
    );
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disabled durumda tıklama handlerı çağırmaz', () => {
    const onClick = vi.fn();
    const button = new Button('Gönder', { onClick, disabled: true });
    instances.push(button);

    expect(button.element.disabled).toBe(true);
    button.element.click();
    expect(onClick).not.toHaveBeenCalled();

    button.setDisabled(false);
    button.element.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('onClick ile handler değiştirilebilir', () => {
    const first = vi.fn();
    const second = vi.fn();
    const button = new Button('Gönder');
    instances.push(button);

    button.onClick(first);
    button.element.click();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    button.onClick(second);
    button.element.click();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('variant, size ve fullWidth classlarını doğru uygular', () => {
    const button = new Button('Gönder', { variant: 'primary', size: 'lg', fullWidth: false });
    instances.push(button);

    const classes = button.element.classList;
    expect(classes.contains('vol-button')).toBe(true);
    expect(classes.contains('vol-button--primary')).toBe(true);
    expect(classes.contains('vol-button--lg')).toBe(true);
    expect(classes.contains('vol-button--auto-width')).toBe(true);
    expect(classes.contains('vol-button--default')).toBe(false);
    expect(classes.contains('vol-button--md')).toBe(false);
  });

  it('varsayılan variant ve size classlarını korur', () => {
    const button = new Button('Gönder');
    instances.push(button);

    const classes = button.element.classList;
    expect(classes.contains('vol-button')).toBe(true);
    expect(classes.contains('vol-button--primary')).toBe(false);
    expect(classes.contains('vol-button--md')).toBe(false);
    expect(classes.contains('vol-button--auto-width')).toBe(false);
  });

  it('sol ve sağ ikonları render eder (metin ve node)', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const button = new Button('Paylaş', { iconLeft: '✉', iconRight: svg });
    instances.push(button);

    const icons = button.element.querySelectorAll<HTMLSpanElement>('.vol-button__icon');
    expect(icons).toHaveLength(2);
    expect(icons[0].textContent).toBe('✉');
    expect(icons[1].firstElementChild).toBe(svg);
  });

  it('setLabel buton metnini günceller', () => {
    const button = new Button('Eski');
    instances.push(button);

    button.setLabel('Yeni');
    expect(button.element.querySelector<HTMLSpanElement>('.vol-button__label')?.textContent).toBe(
      'Yeni',
    );
  });

  it('setLoading DOM durumunu ve disabled niteliğini yönetir', () => {
    const button = new Button('Yükle');
    instances.push(button);

    button.setLoading(true);
    expect(button.element.classList.contains('vol-button--loading')).toBe(true);
    expect(button.element.disabled).toBe(true);
    const spinner = button.element.querySelector('.vol-button__spinner');
    expect(spinner).not.toBeNull();
    expect(spinner?.hasAttribute('hidden')).toBe(false);

    button.setLoading(false);
    expect(button.element.classList.contains('vol-button--loading')).toBe(false);
    expect(button.element.disabled).toBe(false);
    expect(spinner?.hasAttribute('hidden')).toBe(true);
  });

  it('loading sırasında tıklama handlerı çağırmaz', () => {
    const onClick = vi.fn();
    const button = new Button('Yükle', { onClick });
    instances.push(button);

    button.setLoading(true);
    button.element.dispatchEvent(
      new PointerEvent('click', { bubbles: true, cancelable: true, pointerId: 1 }),
    );
    expect(onClick).not.toHaveBeenCalled();
  });

  it('asenkron onClick sırasında loading durumunu açar ve kapatır', async () => {
    let resolveClick = () => {};
    const clickPromise = new Promise<void>((resolve) => {
      resolveClick = resolve;
    });
    const onClick = vi.fn(() => clickPromise);
    const button = new Button('Kaydet', { onClick });
    instances.push(button);

    button.element.dispatchEvent(
      new PointerEvent('click', { bubbles: true, cancelable: true, pointerId: 1 }),
    );
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button.element.classList.contains('vol-button--loading')).toBe(true);
    expect(button.element.querySelector('.vol-button__spinner')?.hasAttribute('hidden')).toBe(
      false,
    );
    expect(button.element.disabled).toBe(true);

    resolveClick();
    await clickPromise;
    expect(button.element.classList.contains('vol-button--loading')).toBe(false);
    expect(button.element.querySelector('.vol-button__spinner')?.hasAttribute('hidden')).toBe(true);
    expect(button.element.disabled).toBe(false);
  });

  it('destroy sonrası tıklama handlerı çalışmaz ve element kaldırılır', () => {
    const onClick = vi.fn();
    const button = new Button('Gönder', { onClick });
    instances.push(button);

    document.body.appendChild(button.element);
    button.destroy();
    expect(button.element.isConnected).toBe(false);

    button.element.dispatchEvent(
      new PointerEvent('click', { bubbles: true, cancelable: true, pointerId: 1 }),
    );
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('IconButton', () => {
  it('oluşturma ve yok etme', () => {
    const icon = new IconButton('✕', { label: 'Kapat' });
    instances.push(icon);

    expect(icon.element.tagName).toBe('BUTTON');
    expect(icon.element.type).toBe('button');
    expect(icon.element.classList.contains('vol-icon-button')).toBe(true);
    expect(icon.element.getAttribute('aria-label')).toBe('Kapat');
    expect(icon.element.title).toBe('Kapat');
    expect(icon.element.querySelector<HTMLSpanElement>('.vol-icon-button__icon')?.textContent).toBe(
      '✕',
    );

    document.body.appendChild(icon.element);
    icon.destroy();
    expect(icon.element.isConnected).toBe(false);
  });

  it('tıklama onClick handlerını çağırır', () => {
    const onClick = vi.fn();
    const icon = new IconButton('✕', { label: 'Kapat', onClick });
    instances.push(icon);

    icon.element.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disabled durumda tıklama handlerı çağırmaz', () => {
    const onClick = vi.fn();
    const icon = new IconButton('✕', { label: 'Kapat', onClick, disabled: true });
    instances.push(icon);

    expect(icon.element.disabled).toBe(true);
    icon.element.click();
    expect(onClick).not.toHaveBeenCalled();

    icon.setDisabled(false);
    icon.element.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('onClick değiştiğinde eski listener kaldırılır', () => {
    const first = vi.fn();
    const second = vi.fn();
    const icon = new IconButton('✕', { label: 'Kapat' });
    instances.push(icon);

    icon.onClick(first);
    icon.onClick(second);
    icon.element.click();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('variant ve size classlarını uygular', () => {
    const icon = new IconButton('✕', { label: 'Kapat', variant: 'danger', size: 'sm' });
    instances.push(icon);

    const classes = icon.element.classList;
    expect(classes.contains('vol-icon-button')).toBe(true);
    expect(classes.contains('vol-icon-button--danger')).toBe(true);
    expect(classes.contains('vol-icon-button--sm')).toBe(true);
  });

  it('varsayılan variant ve size classlarını korur', () => {
    const icon = new IconButton('✕', { label: 'Kapat' });
    instances.push(icon);

    const classes = icon.element.classList;
    expect(classes.contains('vol-icon-button')).toBe(true);
    expect(classes.contains('vol-icon-button--default')).toBe(false);
    expect(classes.contains('vol-icon-button--md')).toBe(false);
  });

  it('setIcon metin ve node ikonunu günceller', () => {
    const icon = new IconButton('✕', { label: 'Kapat' });
    instances.push(icon);

    const wrapper = icon.element.querySelector<HTMLSpanElement>('.vol-icon-button__icon');
    icon.setIcon('✓');
    expect(wrapper?.textContent).toBe('✓');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setIcon(svg);
    expect(wrapper?.firstElementChild).toBe(svg);
    expect(wrapper?.textContent).toBe('');
  });

  it('setLabel aria-label ve title günceller', () => {
    const icon = new IconButton('✕', { label: 'Kapat' });
    instances.push(icon);

    icon.setLabel('Aç');
    expect(icon.element.getAttribute('aria-label')).toBe('Aç');
    expect(icon.element.title).toBe('Aç');
  });

  it('destroy sonrası tıklama handlerı çalışmaz', () => {
    const onClick = vi.fn();
    const icon = new IconButton('✕', { label: 'Kapat', onClick });
    instances.push(icon);

    document.body.appendChild(icon.element);
    icon.destroy();
    icon.element.click();
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Select', () => {
  it('oluşturma ve yok etme', () => {
    const select = new Select({ options: sampleOptions });
    instances.push(select);

    expect(select.element.tagName).toBe('BUTTON');
    expect(select.element.type).toBe('button');
    expect(select.element.classList.contains('vol-select')).toBe(true);
    expect(select.element.getAttribute('aria-haspopup')).toBe('listbox');
    expect(select.element.getAttribute('aria-expanded')).toBe('false');
    expect(select.getValue()).toBeUndefined();
    expect(select.element.querySelector<HTMLSpanElement>('.vol-select__label')?.textContent).toBe(
      'Seçiniz',
    );

    document.body.appendChild(select.element);
    select.destroy();
    expect(select.element.isConnected).toBe(false);
    expect(document.body.querySelector('.vol-select__listbox')).toBeNull();
  });

  it('başlangıç değeri seçili etiketi ve aria-selected değerini gösterir', async () => {
    const select = new Select({ options: sampleOptions, value: 'b' });
    instances.push(select);
    document.body.appendChild(select.element);

    select.element.dispatchEvent(
      new PointerEvent('click', { bubbles: true, cancelable: true, pointerId: 1 }),
    );
    await Promise.resolve();

    const optionButtons = document.body.querySelectorAll<HTMLButtonElement>('.vol-select__option');
    expect(optionButtons).toHaveLength(3);
    expect(optionButtons[0].getAttribute('aria-selected')).toBe('false');
    expect(optionButtons[1].getAttribute('aria-selected')).toBe('true');
    expect(optionButtons[2].getAttribute('aria-selected')).toBe('false');
    expect(select.element.querySelector<HTMLSpanElement>('.vol-select__label')?.textContent).toBe(
      'B',
    );
  });

  it('değer seçilmemişken placeholder gösterir', () => {
    const select = new Select({ options: sampleOptions, placeholder: 'Bir seçenek seçin' });
    instances.push(select);

    expect(select.element.querySelector<HTMLSpanElement>('.vol-select__label')?.textContent).toBe(
      'Bir seçenek seçin',
    );
    expect(select.getValue()).toBeUndefined();
  });

  it('setValue callback çağırmaz, etiket ve aria-selected günceller', async () => {
    const onInput = vi.fn();
    const select = new Select({ options: sampleOptions, onInput });
    instances.push(select);

    select.setValue('c');
    expect(onInput).not.toHaveBeenCalled();
    expect(select.getValue()).toBe('c');
    expect(select.element.querySelector<HTMLSpanElement>('.vol-select__label')?.textContent).toBe(
      'C',
    );
    expect(
      select.element
        .querySelector<HTMLSpanElement>('.vol-select__label')
        ?.classList.contains('vol-select__label--danger'),
    ).toBe(true);

    document.body.appendChild(select.element);
    select.element.dispatchEvent(
      new PointerEvent('click', { bubbles: true, cancelable: true, pointerId: 1 }),
    );
    await Promise.resolve();
    const optionButtons = document.body.querySelectorAll<HTMLButtonElement>('.vol-select__option');
    expect(optionButtons[2].getAttribute('aria-selected')).toBe('true');
    expect(optionButtons[0].getAttribute('aria-selected')).toBe('false');
  });

  it('seçenek tıklaması input callback çağırır, değeri ve etiketi günceller', async () => {
    const onInput = vi.fn();
    const select = new Select({ options: sampleOptions, onInput });
    instances.push(select);
    document.body.appendChild(select.element);

    select.element.dispatchEvent(
      new PointerEvent('click', { bubbles: true, cancelable: true, pointerId: 1 }),
    );
    await Promise.resolve();

    const optionButtons = document.body.querySelectorAll<HTMLButtonElement>('.vol-select__option');
    optionButtons[1].dispatchEvent(
      new PointerEvent('click', { bubbles: true, cancelable: true, pointerId: 1 }),
    );

    expect(onInput).toHaveBeenCalledTimes(1);
    expect(onInput).toHaveBeenCalledWith('b');
    expect(select.getValue()).toBe('b');
    expect(select.element.querySelector<HTMLSpanElement>('.vol-select__label')?.textContent).toBe(
      'B',
    );
    expect(select.element.getAttribute('aria-expanded')).toBe('false');
  });

  it('tone seçenek ve etiket classını uygular', async () => {
    const select = new Select({ options: sampleOptions, value: 'c' });
    instances.push(select);
    document.body.appendChild(select.element);

    select.element.dispatchEvent(
      new PointerEvent('click', { bubbles: true, cancelable: true, pointerId: 1 }),
    );
    await Promise.resolve();

    const optionButtons = document.body.querySelectorAll<HTMLButtonElement>('.vol-select__option');
    expect(optionButtons[2].classList.contains('vol-select__option--danger')).toBe(true);
    expect(optionButtons[0].classList.contains('vol-select__option--danger')).toBe(false);
    expect(
      select.element
        .querySelector<HTMLSpanElement>('.vol-select__label')
        ?.classList.contains('vol-select__label--danger'),
    ).toBe(true);
  });

  it('tetikleyici tıklama ile açılıp kapanır', () => {
    const select = new Select({ options: sampleOptions });
    instances.push(select);
    document.body.appendChild(select.element);

    select.element.dispatchEvent(
      new PointerEvent('click', { bubbles: true, cancelable: true, pointerId: 1 }),
    );
    expect(select.element.getAttribute('aria-expanded')).toBe('true');
    const popup = document.body.querySelector<HTMLDivElement>('.vol-select__listbox');
    expect(popup).not.toBeNull();
    expect(popup?.classList.contains('vol-popup--visible')).toBe(true);
    expect(popup?.getAttribute('role')).toBe('listbox');

    select.element.dispatchEvent(
      new PointerEvent('click', { bubbles: true, cancelable: true, pointerId: 1 }),
    );
    expect(select.element.getAttribute('aria-expanded')).toBe('false');
    expect(popup?.classList.contains('vol-popup--visible')).toBe(false);
  });

  it('dışarı tıklama listboxu kapatır', async () => {
    const select = new Select({ options: sampleOptions });
    instances.push(select);
    document.body.appendChild(select.element);

    select.element.dispatchEvent(
      new PointerEvent('click', { bubbles: true, cancelable: true, pointerId: 1 }),
    );
    await Promise.resolve();

    const popup = document.body.querySelector<HTMLDivElement>('.vol-select__listbox');
    expect(popup?.classList.contains('vol-popup--visible')).toBe(true);

    document.dispatchEvent(
      new PointerEvent('click', { bubbles: true, cancelable: true, pointerId: 2 }),
    );
    expect(select.element.getAttribute('aria-expanded')).toBe('false');
    expect(popup?.classList.contains('vol-popup--visible')).toBe(false);
  });

  it('Escape listboxu kapatır', async () => {
    const select = new Select({ options: sampleOptions });
    instances.push(select);
    document.body.appendChild(select.element);

    select.element.dispatchEvent(
      new PointerEvent('click', { bubbles: true, cancelable: true, pointerId: 1 }),
    );
    await Promise.resolve();

    const popup = document.body.querySelector<HTMLDivElement>('.vol-select__listbox');
    expect(popup?.classList.contains('vol-popup--visible')).toBe(true);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(select.element.getAttribute('aria-expanded')).toBe('false');
    expect(popup?.classList.contains('vol-popup--visible')).toBe(false);
  });

  it('disabled durumda açılmaz', () => {
    const select = new Select({ options: sampleOptions, disabled: true });
    instances.push(select);
    document.body.appendChild(select.element);

    expect(select.element.disabled).toBe(true);
    select.element.click();
    expect(select.element.getAttribute('aria-expanded')).toBe('false');
    expect(document.body.querySelector('.vol-select__listbox')).toBeNull();

    select.setDisabled(false);
    expect(select.element.disabled).toBe(false);
    select.element.click();
    expect(select.element.getAttribute('aria-expanded')).toBe('true');
  });

  it('ArrowDown tetikleyiciyi açar ve ilk seçeneği odaklar', async () => {
    const select = new Select({ options: sampleOptions });
    instances.push(select);
    document.body.appendChild(select.element);

    select.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    await Promise.resolve();

    expect(select.element.getAttribute('aria-expanded')).toBe('true');
    const optionButtons = document.body.querySelectorAll<HTMLButtonElement>('.vol-select__option');
    expect(document.activeElement).toBe(optionButtons[0]);
  });

  it('ArrowUp tetikleyiciyi açar ve başlangıç değerine odaklanır', async () => {
    const select = new Select({ options: sampleOptions, value: 'b' });
    instances.push(select);
    document.body.appendChild(select.element);

    select.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
    );
    await Promise.resolve();

    const optionButtons = document.body.querySelectorAll<HTMLButtonElement>('.vol-select__option');
    expect(document.activeElement).toBe(optionButtons[1]);
  });

  it('seçeneklerde ok tuşlarıyla gezinebilir', async () => {
    const select = new Select({ options: sampleOptions });
    instances.push(select);
    document.body.appendChild(select.element);

    select.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    await Promise.resolve();

    const optionButtons = document.body.querySelectorAll<HTMLButtonElement>('.vol-select__option');
    expect(document.activeElement).toBe(optionButtons[0]);

    optionButtons[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(optionButtons[1]);

    optionButtons[1].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(optionButtons[2]);

    optionButtons[2].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(optionButtons[0]);

    optionButtons[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(optionButtons[2]);

    optionButtons[2].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(optionButtons[0]);

    optionButtons[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(optionButtons[2]);
  });

  it('Escape seçenekten çıkar ve tetikleyiciye odaklanır', async () => {
    const select = new Select({ options: sampleOptions });
    instances.push(select);
    document.body.appendChild(select.element);

    select.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    await Promise.resolve();

    const optionButtons = document.body.querySelectorAll<HTMLButtonElement>('.vol-select__option');
    expect(document.activeElement).toBe(optionButtons[0]);

    optionButtons[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(select.element.getAttribute('aria-expanded')).toBe('false');
    expect(
      document.body
        .querySelector<HTMLDivElement>('.vol-select__listbox')
        ?.classList.contains('vol-popup--visible'),
    ).toBe(false);
    expect(document.activeElement).toBe(select.element);
  });

  it('Tab listboxu kapatır', async () => {
    const select = new Select({ options: sampleOptions });
    instances.push(select);
    document.body.appendChild(select.element);

    select.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    await Promise.resolve();

    const optionButtons = document.body.querySelectorAll<HTMLButtonElement>('.vol-select__option');
    optionButtons[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );
    expect(select.element.getAttribute('aria-expanded')).toBe('false');
    expect(
      document.body
        .querySelector<HTMLDivElement>('.vol-select__listbox')
        ?.classList.contains('vol-popup--visible'),
    ).toBe(false);
  });

  it('erişilebilirlik niteliklerini ayarlar', () => {
    const select = new Select({ options: sampleOptions, value: 'a' });
    instances.push(select);

    expect(select.element.getAttribute('aria-haspopup')).toBe('listbox');
    expect(select.element.getAttribute('aria-expanded')).toBe('false');

    document.body.appendChild(select.element);
    select.element.dispatchEvent(
      new PointerEvent('click', { bubbles: true, cancelable: true, pointerId: 1 }),
    );

    const optionButtons = document.body.querySelectorAll<HTMLButtonElement>('.vol-select__option');
    expect(optionButtons).toHaveLength(3);
    expect(optionButtons[0].getAttribute('role')).toBe('option');
    expect(optionButtons[0].getAttribute('aria-selected')).toBe('true');
    expect(optionButtons[1].getAttribute('aria-selected')).toBe('false');

    const listbox = document.body.querySelector<HTMLDivElement>('.vol-select__listbox');
    expect(listbox?.getAttribute('role')).toBe('listbox');
  });

  it('destroy açık listboxu ve listenerları temizler', async () => {
    const select = new Select({ options: sampleOptions });
    instances.push(select);
    document.body.appendChild(select.element);

    select.element.dispatchEvent(
      new PointerEvent('click', { bubbles: true, cancelable: true, pointerId: 1 }),
    );
    await Promise.resolve();
    expect(document.body.querySelector('.vol-select__listbox')).not.toBeNull();

    select.destroy();
    expect(select.element.isConnected).toBe(false);
    expect(document.body.querySelector('.vol-select__listbox')).toBeNull();

    document.dispatchEvent(
      new PointerEvent('click', { bubbles: true, cancelable: true, pointerId: 3 }),
    );
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(document.body.querySelector('.vol-select__listbox')).toBeNull();
  });
});
