import { UI_FONT_FAMILY } from './textStyles.js'

function button(label, primary) {
  return `
    <button data-action="${label.toLowerCase()}" style="
      border: 1px solid ${primary ? '#4be7ff' : '#5c6f8f'};
      background: ${primary ? 'linear-gradient(180deg, #13314d 0%, #0b1f32 100%)' : '#111929'};
      color: ${primary ? '#eafcff' : '#d1d7e4'};
      border-radius: 10px;
      padding: 10px 16px;
      font: 700 14px ${UI_FONT_FAMILY};
      letter-spacing: 0.04em;
      cursor: pointer;
      min-width: 96px;
    ">${label}</button>
  `
}

export function showTextPrompt({
  title,
  label,
  initialValue = '',
  placeholder = '',
  maxLength = 32,
  transform = (value) => value,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(3, 8, 18, 0.78);
      backdrop-filter: blur(6px);
      z-index: 2000;
      padding: 16px;
    `

    overlay.innerHTML = `
      <div style="
        width: min(420px, 100%);
        background: linear-gradient(180deg, #122033 0%, #09111f 100%);
        border: 1px solid #4be7ff;
        border-radius: 16px;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
        padding: 18px;
        color: #eef8ff;
        font-family: ${UI_FONT_FAMILY};
      ">
        <div style="font-size: 18px; font-weight: 800; letter-spacing: 0.06em; color: #4be7ff; text-transform: uppercase;">${title}</div>
        <div style="margin-top: 10px; font-size: 13px; line-height: 1.5; color: #d4deec;">${label}</div>
        <input data-role="input" maxlength="${maxLength}" value="${escapeHtml(initialValue)}" placeholder="${escapeHtml(placeholder)}" style="
          width: 100%;
          margin-top: 12px;
          border: 1px solid #8bb3d9;
          border-radius: 12px;
          background: #f4f8ff;
          color: #08111f;
          padding: 12px 14px;
          font: 700 16px ${UI_FONT_FAMILY};
          outline: none;
        " />
        <div style="margin-top: 8px; font-size: 12px; color: #9fb2c9;">Press Enter to confirm. Escape cancels.</div>
        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px;">
          ${button(cancelLabel, false)}
          ${button(submitLabel, true)}
        </div>
      </div>
    `

    const close = (value) => {
      cleanup()
      resolve(value)
    }

    const cleanup = () => {
      document.removeEventListener('keydown', onKeyDown)
      overlay.remove()
    }

    const input = overlay.querySelector('[data-role="input"]')
    const submit = () => close(transform(input.value))
    const cancel = () => close(null)

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        cancel()
      } else if (event.key === 'Enter') {
        event.preventDefault()
        submit()
      }
    }

    overlay.addEventListener('click', (event) => {
      const action = event.target?.getAttribute?.('data-action')
      if (event.target === overlay) cancel()
      if (action === cancelLabel.toLowerCase()) cancel()
      if (action === submitLabel.toLowerCase()) submit()
    })

    document.addEventListener('keydown', onKeyDown)
    document.body.appendChild(overlay)
    input.focus()
    input.select()
  })
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
