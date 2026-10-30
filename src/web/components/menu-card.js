import { useLongPress } from '/shared/long-press.js'

export const MenuCard = {
  props: {
    href: { type: String, default: '' },
    label: { type: String, default: '' },
    moreLabel: { type: String, required: true },
  },
  emits: ['open', 'menu'],
  template: `
    <div class="menu-card" @contextmenu="onContextMenu">
      <component :is="href ? 'a' : 'button'" :href="href || null" :type="href ? null : 'button'" class="menu-card-hit"
        :aria-label="label || null" @click="onClick" @pointerdown="onPointerDown" @pointermove="onPointerMove"
        @pointerup="onPointerEnd" @pointercancel="onPointerEnd" @pointerleave="onPointerEnd"><slot /></component>
      <button type="button" class="menu-card-more" :aria-label="moreLabel" aria-haspopup="dialog" @click="$emit('menu')">
        <more-glyph />
      </button>
    </div>
  `,
  setup(props, { emit }) {
    const { onPointerDown, onPointerMove, onPointerEnd, onContextMenu } = useLongPress(() => emit('menu'))
    const onClick = () => emit('open')
    return { onClick, onPointerDown, onPointerMove, onPointerEnd, onContextMenu }
  },
}
