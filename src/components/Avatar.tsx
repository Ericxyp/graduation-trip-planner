import { memberById } from '../data'
import type { MemberId } from '../types'

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-14 w-14 text-base',
}

export default function Avatar({
  id,
  size = 'md',
  dim = false,
  ring = true,
}: {
  id: MemberId
  size?: keyof typeof SIZES
  dim?: boolean
  ring?: boolean
}) {
  const m = memberById(id)
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white ${SIZES[size]} ${
        ring ? 'ring-2 ring-white' : ''
      } ${dim ? 'opacity-40 grayscale' : ''}`}
      style={{ backgroundColor: m.color }}
    >
      {m.name.slice(-1) === 'K' ? 'K' : m.name.slice(-1)}
    </span>
  )
}
