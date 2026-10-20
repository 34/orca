// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MultiRepoDescription } from './MultiRepoDescription'

vi.mock('@/components/github/GitHubMarkdownComposer', () => ({
  GitHubMarkdownComposer: ({ value, disabled }: { value: string; disabled: boolean }) => (
    <textarea aria-label="Description" value={value} disabled={disabled} readOnly />
  )
}))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('attaches files to the latest committed description after asynchronous reading', async () => {
  const finish: (() => void)[] = []
  vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
    finish.push(() => {
      Object.defineProperty(this, 'result', { value: 'data:text/plain;base64,Y29udGV4dA==' })
      this.dispatchEvent(new ProgressEvent('load'))
    })
  })
  const onChange = vi.fn()
  const onBusyChange = vi.fn()
  const view = render(
    <MultiRepoDescription
      value="Original"
      attachments={[]}
      onChange={onChange}
      onBusyChange={onBusyChange}
    />
  )
  fireEvent.change(view.getByLabelText('Upload context files'), {
    target: { files: [new File(['context'], 'context.txt', { type: 'text/plain' })] }
  })
  expect(onBusyChange).toHaveBeenCalledWith(true)
  view.rerender(
    <MultiRepoDescription
      value="Edited while reading"
      attachments={[]}
      onChange={onChange}
      onBusyChange={onBusyChange}
    />
  )
  await act(async () => {
    finish[0]()
  })
  expect(onChange).toHaveBeenCalledWith(expect.stringContaining('Edited while reading'), [
    expect.objectContaining({ name: 'context.txt', base64: 'Y29udGV4dA==' })
  ])
  expect(onBusyChange).toHaveBeenLastCalledWith(false)
})

it('ignores pasted files while submission has disabled the description', () => {
  const onChange = vi.fn()
  const read = vi.spyOn(FileReader.prototype, 'readAsDataURL')
  const view = render(
    <MultiRepoDescription
      value="Submitted"
      attachments={[]}
      onChange={onChange}
      onBusyChange={vi.fn()}
      disabled
    />
  )
  fireEvent.paste(view.getByLabelText('Description'), {
    clipboardData: { files: [new File(['context'], 'context.txt')] }
  })
  expect(read).not.toHaveBeenCalled()
  expect(onChange).not.toHaveBeenCalled()
})
