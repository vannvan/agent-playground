import type { ChangeEvent, SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import './styles.less'

export type SelectOption = {
  label: string
  value: string
  disabled?: boolean
}

type NativeSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'value' | 'onChange' | 'size'>

export type SelectProps = NativeSelectProps & {
  options: SelectOption[]
  value: string
  onValueChange: (value: string, event: ChangeEvent<HTMLSelectElement>) => void
  size?: 'compact' | 'default'
  wrapperClassName?: string
}

/** A consistently styled, scoped native select that preserves native keyboard and screen-reader behavior. */
export function Select({
  options,
  value,
  onValueChange,
  size = 'default',
  className = '',
  wrapperClassName = '',
  ...selectProps
}: SelectProps) {
  const rootClassName = ['ui-select-root', `ui-select-${size}`, wrapperClassName].filter(Boolean).join(' ')
  const controlClassName = ['ui-select-control', className].filter(Boolean).join(' ')

  return <span className={rootClassName}>
    <select
      {...selectProps}
      className={controlClassName}
      value={value}
      onChange={(event) => onValueChange(event.currentTarget.value, event)}
    >
      {options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
    </select>
    <ChevronDown className="ui-select-chevron" size={15} aria-hidden="true" />
  </span>
}

export default Select
